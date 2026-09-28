// The table of proved student portals against a real Postgres (PGlite in-process), so the SQL is what runs on Neon.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  awaitingPin,
  configurePortalStore,
  countPortals,
  decideReview,
  ensurePortalSchema,
  holdForReview,
  isValidPortalSearch,
  latestReviewOf,
  loadPortal,
  loadReview,
  markRequestBuilt,
  openRequests,
  pageOfRequest,
  pinProvider,
  portalByRequestHash,
  portalCountries,
  portalFound,
  portalListed,
  portalProblem,
  portalsIn,
  providerCounts,
  providerProblem,
  removePortal,
  requestProvider,
  resultsExtractOf,
  savePortal,
  savePortalRows,
  saveProvider,
  saveResults,
  searchPortals,
  witnessProviders,
} from "../src/portal-store";
import { providerInstruction } from "../src/provider-instruction";
import type { SqlExecutor } from "../src/proof-session-store";
import { UNIVERSITY_GRADE_SHOWN, UNIVERSITY_YEAR_SHOWN } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import type { ResultsExtract } from "../src/university-shown";

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    const result = await database.query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}

before(async () => {
  db = new PGlite();
  configurePortalStore(pgliteExecutor(db));
  await ensurePortalSchema();
  // The gifts' own table, as far as a portal is concerned: a portal a gift names is never removed.
  await db.query(`CREATE TABLE IF NOT EXISTS viky_milestone_gifts (gift_id text PRIMARY KEY, portal text)`);
});

after(async () => {
  configurePortalStore(undefined);
  await db.close();
});

const OPERATOR = "0x000000000000000000000000000000000000a11c";
const UCAD = {
  portalId: "ucad-sn",
  name: "UCAD, espace étudiant",
  university: "Université Cheikh Anta Diop",
  country: "SN",
  providerId: "67ec1b13-b206-4fac-a78c-fbd5a2af55b3",
  providerVersion: "1.0.0",
  requestHash: `0x${"ab".repeat(32)}`,
  loginUrl: "https://ent.ucad.sn/login",
  extract: { field: "status", matches: "^(Inscrit|Enrolled)", keeps: "whether the status says enrolled, and nothing else" },
  provenBy: OPERATOR,
};

test("the table is empty until a portal has been proved, and the search says so rather than inventing one", async () => {
  assert.equal(await countPortals(), 0);
  assert.deepEqual(await searchPortals("Dakar"), []);
  assert.equal(await loadPortal("ucad-sn"), null);
});

test("a row is written only whole: every field the proof will be checked against, and who proved it", async () => {
  assert.equal(portalProblem(UCAD), undefined);
  assert.match(String(portalProblem({ ...UCAD, portalId: "UCAD SN" })), /portal id/);
  assert.match(String(portalProblem({ ...UCAD, country: "Senegal" })), /country/);
  assert.match(String(portalProblem({ ...UCAD, providerId: "not-a-uuid" })), /provider id/);
  assert.match(String(portalProblem({ ...UCAD, providerVersion: "1" })), /version/);
  assert.match(String(portalProblem({ ...UCAD, requestHash: "0x12" })), /request hash/);
  assert.match(String(portalProblem({ ...UCAD, loginUrl: "http://ent.ucad.sn" })), /https/);
  assert.match(String(portalProblem({ ...UCAD, extract: { ...UCAD.extract, matches: "(" } })), /regular expression/);
  assert.match(String(portalProblem({ ...UCAD, provenBy: "me" })), /operator account/);
  await assert.rejects(savePortal({ ...UCAD, country: "Senegal" }), /country/);
});

test("a proved portal is read back by its id, by the request its proofs make, and by a word of its name", async () => {
  await savePortal(UCAD);
  const back = await loadPortal("ucad-sn");
  assert.equal(back?.university, "Université Cheikh Anta Diop");
  assert.equal(back?.enrolment?.extract?.field, "status");
  assert.equal(back?.enrolment?.verification, "tee");
  assert.equal(back?.results, null);
  assert.equal(back?.provenBy, OPERATOR);
  assert.ok(back && Date.now() - back.provenAt.getTime() < 60_000);
  assert.equal((await portalByRequestHash(UCAD.requestHash.toUpperCase()))?.portalId, "ucad-sn", "whatever the case of the hash");
  assert.equal((await searchPortals("cheikh"))[0]?.portalId, "ucad-sn");
  assert.equal((await searchPortals("SN"))[0]?.portalId, "ucad-sn", "by country too");
  assert.deepEqual(await searchPortals("sorbonne"), []);
  assert.equal(await countPortals(), 1);
  assert.deepEqual(portalFound(back!), { pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", path: "" }, "what the chooser lists, and no sign-in address");
});

test("proving a portal again replaces its row and its provider rather than adding a second one", async () => {
  await savePortal({ ...UCAD, providerVersion: "1.1.0", extract: { ...UCAD.extract, matches: "^Inscrit" } });
  assert.equal(await countPortals(), 1);
  assert.equal((await loadPortal("ucad-sn"))?.enrolment?.providerVersion, "1.1.0");
});

test("words too short or too long are not searched on, and a pattern character in them cannot widen the search", async () => {
  assert.equal(isValidPortalSearch("u"), false);
  assert.equal(isValidPortalSearch("x".repeat(81)), false);
  assert.deepEqual(await searchPortals("%"), []);
  assert.deepEqual(await searchPortals("%%"), [], "two percent signs are not everything");
});

/** The results page, a second provider on the university (D174, D313): written after enrolment, kept when enrolment is proved again. */
const RESULTS: ResultsExtract = {
  providerId: "8a1b2c3d-0000-4000-8000-00000000abcd",
  providerVersion: "1.0.0",
  requestHash: `0x${"CD".repeat(32)}`,
  admitted: { field: "decision", matches: "^(Admis|Passed)" },
  grade: { field: "average", scale: { kind: "numeric", max: 20, step: 0.01 } },
  year: { field: "academicYear", matches: "2026-2027" },
};

function record(portal: string | null, conditionId = "x") {
  return { giftId: "1000009", conditionId, mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal };
}

test("the results page is written on a university, read back by either request, and survives enrolment being proved again", async () => {
  assert.equal(await saveResults("nobody-knows", RESULTS), false, "no row, nothing to add to");
  await assert.rejects(saveResults("ucad-sn", { ...RESULTS, requestHash: UCAD.requestHash }), /not the enrolment's own/);
  await assert.rejects(saveResults("ucad-sn", { ...RESULTS, providerId: "nope" }), /results page, the results provider's id/);
  assert.equal(await saveResults("ucad-sn", RESULTS), true);
  const back = await loadPortal("ucad-sn");
  assert.deepEqual(resultsExtractOf(back!.results), { ...RESULTS, requestHash: RESULTS.requestHash.toLowerCase() });
  assert.equal((await portalByRequestHash(RESULTS.requestHash))?.portalId, "ucad-sn", "the results request names the portal too");
  assert.equal(pageOfRequest(back!, RESULTS.requestHash), "results");
  assert.equal(pageOfRequest(back!, UCAD.requestHash), "enrolment");
  assert.equal(pageOfRequest(back!, `0x${"00".repeat(32)}`), null);
  // Enrolment proved again, with no results named on the command: the results page stays.
  await savePortal(UCAD);
  assert.deepEqual(resultsExtractOf((await loadPortal("ucad-sn"))!.results), { ...RESULTS, requestHash: RESULTS.requestHash.toLowerCase() });
  // Named on the command, it is replaced.
  await savePortal({ ...UCAD, results: { ...RESULTS, grade: { field: "moyenne", scale: { kind: "numeric", max: 20, step: 0.5 } } } });
  assert.equal((await loadPortal("ucad-sn"))?.results?.extract?.grade.field, "moyenne");
});

test("the shown register reads the year and the grade off the results provider, and says a missing provider is being set up", async () => {
  const year = await UNIVERSITY_YEAR_SHOWN.providerOf?.(record("ucad-sn"));
  assert.equal(year?.providerId, RESULTS.providerId);
  assert.equal(year?.providerVersion, "1.0.0");
  assert.deepEqual(year?.requestHashes, [RESULTS.requestHash.toLowerCase()]);
  assert.equal(year?.loginUrl, UCAD.loginUrl);
  assert.deepEqual(year?.read({ decision: "Admis", academicYear: "2026-2027" }), { metricValue: 1n, eventAt: null, accountKey: null, inWords: "Passed" });
  assert.throws(() => year?.read({ decision: "Ajourné", academicYear: "2026-2027" }), (error: unknown) => error instanceof ShownProofError && error.code === "NOT_PASSED");
  assert.throws(() => year?.read({ decision: "Admis", academicYear: "2025-2026" }), (error: unknown) => error instanceof ShownProofError && error.code === "WRONG_TERM");
  const grade = await UNIVERSITY_GRADE_SHOWN.providerOf?.(record("ucad-sn"));
  assert.equal(grade?.providerId, RESULTS.providerId);
  assert.deepEqual(grade?.read({ moyenne: "14,50", academicYear: "2026-2027" }), { metricValue: 1450n, eventAt: null, accountKey: null, inWords: "14.50 / 20" });
  assert.throws(() => grade?.read({ decision: "Admis", academicYear: "2026-2027" }), (error: unknown) => error instanceof ShownProofError && error.code === "NO_GRADE");
  // A university with an enrolment provider alone: the results provider is being set up, and it says so.
  await savePortal({ ...UCAD, portalId: "sorbonne-fr", university: "Sorbonne Université", country: "FR", requestHash: `0x${"ef".repeat(32)}` });
  const none = await UNIVERSITY_YEAR_SHOWN.providerOf?.(record("sorbonne-fr"));
  assert.equal(none?.providerId, "");
  assert.equal(none?.missing?.code, "PROVIDER_BUILDING");
  assert.throws(() => none?.read({}), (error: unknown) => error instanceof ShownProofError && error.code === "PROVIDER_BUILDING");
  assert.equal(await UNIVERSITY_GRADE_SHOWN.providerOf?.(record("nobody-knows")), null);
  assert.equal(await UNIVERSITY_GRADE_SHOWN.providerOf?.(record(null)), null);
});

test("a grade gift made on a scale before the pin is read on the pinned one only if they agree, and the list says the pinned scale", async () => {
  const gift = (gradeScale: string | null) => ({ ...record("ucad-sn"), gradeScale });
  // UCAD's results provider, written above, grades out of 20 in halves.
  const onTwenty = await UNIVERSITY_GRADE_SHOWN.providerOf?.(gift("20"));
  assert.deepEqual(onTwenty?.read({ moyenne: "14,50", academicYear: "2026-2027" }), { metricValue: 1450n, eventAt: null, accountKey: null, inWords: "14.50 / 20" });
  const onFour = await UNIVERSITY_GRADE_SHOWN.providerOf?.(gift("4"));
  assert.throws(
    () => onFour?.read({ moyenne: "14,50", academicYear: "2026-2027" }),
    (error: unknown) => error instanceof ShownProofError && error.code === "SCALE_MISMATCH" && /grades out of 20, in steps of 0.5, not out of 4/.test(error.message),
  );
  const noChoice = await UNIVERSITY_GRADE_SHOWN.providerOf?.(gift(null));
  assert.equal(noChoice?.read({ moyenne: "14,50", academicYear: "2026-2027" }).metricValue, 1450n, "a gift made after the pin is on the pinned scale");
  assert.equal(portalListed((await loadPortal("ucad-sn"))!).scale, "20/0.5");
  assert.equal(portalListed((await loadPortal("sorbonne-fr"))!).scale, null, "no results provider, no scale");
});

test("a row not yet shown by a student keeps the mark in the register, and the flow never prints it (the founder, 26 Sep 2026)", async () => {
  await savePortal({ ...UCAD, unverified: true });
  const marked = await loadPortal("ucad-sn");
  assert.equal(marked?.unverified, true, "in the register");
  assert.equal(portalFound(marked!).title, "Université Cheikh Anta Diop", "never on the line the funder presses");
  await savePortal(UCAD);
  assert.equal((await loadPortal("ucad-sn"))?.unverified, false);
});

test("the gift's sentence names the university and its country, and nothing about how it is read (D313)", async () => {
  const { universityNamed, UNIVERSITY_SHOWN_MILESTONE } = await import("../src/milestone-conditions");
  const { scanSource } = await import("../src/consumer-words");
  const found = portalFound((await loadPortal("ucad-sn"))!);
  const said = universityNamed("staying enrolled at ", `${found.title}, ${found.issuer}`);
  assert.equal(said, "This gift will be for staying enrolled at Université Cheikh Anta Diop, Senegal.");
  assert.deepEqual(scanSource("sentence", said), [], "through the consumer words check");
  assert.equal(UNIVERSITY_SHOWN_MILESTONE.portal?.refuses({ results: null }, UNIVERSITY_SHOWN_MILESTONE.target.suggested), undefined, "enrolment refuses nothing");
});

test("a row written before D313 carries its classic providers over once, and a student account carries nothing", async () => {
  // As the table held them before: the provider in the row's own columns, a results page as JSON, what it proves.
  await db.query(`INSERT INTO viky_portals (portal_id, name, university, country, provider_id, provider_version, request_hash, login_url, extract, results, proven_at, proven_by, proves)
    VALUES ('old-enrolment-fr', 'Old', 'Old University', 'FR', '11111111-2222-4333-8444-555555555555', '2.0.0', '0x${"11".repeat(32)}', 'https://old.example.fr', '{"field":"status","matches":"^Inscrit","keeps":"whether enrolled"}'::jsonb,
      '{"providerId":"66666666-7777-4888-8999-000000000000","providerVersion":"1.0.0","requestHash":"0x${"22".repeat(32)}","admitted":{"field":"d","matches":"Admis"},"grade":{"field":"g","scale":{"kind":"numeric","max":20,"step":0.01}}}'::jsonb,
      now(), '${OPERATOR}', 'enrolment'),
    ('old-account-fr', 'Account', 'Account University', 'FR', '99999999-2222-4333-8444-555555555555', '1.0.0', '0x${"33".repeat(32)}', 'https://account.example.fr', '{"field":"name","matches":"\\\\S","keeps":"a name"}'::jsonb, NULL, now(), '${OPERATOR}', 'account')`);
  await ensurePortalSchema();
  await ensurePortalSchema();
  const old = await loadPortal("old-enrolment-fr");
  assert.equal(old?.enrolment?.providerId, "11111111-2222-4333-8444-555555555555");
  assert.equal(old?.enrolment?.providerVersion, "2.0.0");
  assert.equal(old?.results?.providerId, "66666666-7777-4888-8999-000000000000");
  assert.equal(old?.results?.extract?.admitted.matches, "Admis");
  const account = await loadPortal("old-account-fr");
  assert.equal(account?.enrolment, null, "a student account is not a sense");
  assert.equal(account?.results, null);
  assert.equal(await removePortal("old-enrolment-fr"), true);
  assert.equal(await removePortal("old-account-fr"), true);
});

test("the world's list is written in bulk, a row at a time never touching a provider, and read a country at a time", async () => {
  const rows = [
    { portalId: "uni-a-br", name: "Universidade A", university: "Universidade A", country: "BR", loginUrl: "https://portal.a.br/login", provenBy: OPERATOR, unverified: true },
    { portalId: "uni-b-br", name: "Universidade B", university: "Universidade B", country: "BR", loginUrl: "https://aluno.b.br", provenBy: OPERATOR, unverified: true },
    // Rome's row again from the world's list: its name and address change, its enrolment provider stays.
    { portalId: "ucad-sn", name: "UCAD", university: "Université Cheikh Anta Diop", country: "SN", loginUrl: "https://studentcenter.ucad.sn/login", provenBy: OPERATOR, unverified: true },
  ];
  await assert.rejects(savePortalRows([{ ...rows[0], country: "Brazil" }]), /uni-a-br: a portal row needs a country/);
  assert.equal(await savePortalRows(rows), 3);
  assert.equal((await loadPortal("ucad-sn"))?.enrolment?.providerId, UCAD.providerId, "the provider is untouched");
  assert.equal((await loadPortal("ucad-sn"))?.loginUrl, "https://studentcenter.ucad.sn/login");
  assert.deepEqual((await portalCountries()).find((one) => one.code === "BR"), { code: "BR", count: 2 });
  assert.deepEqual((await portalsIn("BR")).map((one) => one.portalId), ["uni-a-br", "uni-b-br"]);
  assert.deepEqual(await portalsIn("br"), [], "a country is two capitals");
});

test("a missing provider is asked for once, with its instruction, and a witness provider is added, pinned and read back", async () => {
  const instruction = providerInstruction((await loadPortal("uni-a-br"))!, "enrolment");
  assert.match(instruction, /Universidade A \(Brazil\), enrolment/);
  assert.match(instruction, /field named `enrolment`/);
  assert.match(instruction, /pnpm provider:add uni-a-br enrolment <the provider's id> --domain a\.br/);
  const first = await requestProvider({ portalId: "uni-a-br", sense: "enrolment", instruction, giftId: null });
  assert.equal(first.builtAt, null);
  const again = await requestProvider({ portalId: "uni-a-br", sense: "enrolment", instruction, giftId: "1000042" });
  assert.equal(again.firstGiftId, "1000042", "the first gift is kept once known");
  assert.equal((await openRequests()).length, 1);
  // Built: a witness provider on its own domain, no pin yet.
  const witness = { portalId: "uni-a-br", sense: "enrolment" as const, providerId: "abcdefab-0000-4000-8000-000000000001", verification: "witness" as const, domain: "a.br", providerVersion: "", requestHash: "", extract: null, pin: null, addedBy: OPERATOR };
  assert.match(String(providerProblem({ ...witness, domain: null })), /domain/);
  assert.match(String(providerProblem({ ...witness, extract: { field: "enrolment", matches: "2026", keeps: "k" } })), /only once the provider is pinned/);
  await saveProvider(witness);
  await markRequestBuilt("uni-a-br", "enrolment");
  assert.equal((await openRequests()).length, 0);
  const listed = await loadPortal("uni-a-br");
  assert.equal(listed?.enrolment?.verification, "witness");
  assert.equal(listed?.enrolment && awaitingPin(listed.enrolment), true);
  const pin = { providerVersion: "1.0.0-ai.1", url: "https://portal.a.br/me", method: "GET", responseMatches: "[]", responseRedactions: "[]", specHash: `0x${"44".repeat(32)}` };
  assert.equal(await pinProvider("uni-a-br", "results", { pin, extract: { field: "enrolment", matches: "2026", keeps: "k" }, operator: OPERATOR }), false, "no results provider to pin");
  assert.equal(await pinProvider("uni-a-br", "enrolment", { pin, extract: { field: "enrolment", matches: "2026", keeps: "whether enrolled in 2026" }, operator: OPERATOR }), true);
  const pinned = await loadPortal("uni-a-br");
  assert.equal(pinned?.enrolment?.pin?.specHash, pin.specHash);
  assert.equal(pinned?.enrolment?.requestHash, pin.specHash);
  assert.equal(pinned?.enrolment && awaitingPin(pinned.enrolment), false);
  // Asked again for the same sense once built: the request stays built.
  assert.notEqual((await requestProvider({ portalId: "uni-a-br", sense: "enrolment", instruction, giftId: null })).builtAt, null);
  assert.deepEqual((await witnessProviders())?.map((one) => [one.portalId, one.sense, one.domain]), [["uni-a-br", "enrolment", "a.br"]]);
  assert.deepEqual(await providerCounts(), { listed: 4, enrolment: 3, results: 1, witness: 1, pinned: 1, requested: 0 });
});

test("a held proof is held once, by its sense, and a decision drops its proofs; a university a gift names is never removed", async () => {
  const held = { sessionId: "session-held-1", portalId: "uni-b-br", sense: "results" as const, giftId: "1000043", account: OPERATOR, providerVersion: "1.0.0-ai.1", reading: { fields: { decision: "Admis" } }, proofs: [{ a: 1 }], observedAt: 1_784_000_000 };
  assert.equal(await holdForReview(held), true);
  assert.equal(await holdForReview(held), false);
  assert.equal((await loadReview("session-held-1"))?.sense, "results");
  assert.equal((await latestReviewOf("1000043"))?.status, "pending");
  assert.equal(await decideReview("session-held-1", "refused", "WITNESS_OTHER_PATTERN"), true);
  assert.equal(await decideReview("session-held-1", "pinned", null), false, "decided once");
  assert.equal((await loadReview("session-held-1"))?.proofs, null);
  await db.query(`INSERT INTO viky_milestone_gifts (gift_id, portal) VALUES ('1000043', 'uni-b-br')`);
  await assert.rejects(removePortal("uni-b-br"), /named by a gift/);
  assert.equal(await removePortal("uni-a-br"), true);
  assert.equal(await loadPortal("uni-a-br"), null);
  assert.deepEqual(await witnessProviders(), [], "its providers go with it");
});
