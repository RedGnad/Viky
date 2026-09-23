// The table of proved student portals against a real Postgres (PGlite in-process), so the SQL is what runs on Neon.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  configurePortalStore,
  countPortals,
  ensurePortalSchema,
  isValidPortalSearch,
  loadPortal,
  pageOfRequest,
  portalByRequestHash,
  portalFound,
  portalProblem,
  savePortal,
  saveResults,
  searchPortals,
} from "../src/portal-store";
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
  assert.equal(back?.extract.field, "status");
  assert.equal(back?.provenBy, OPERATOR);
  assert.ok(back && Date.now() - back.provenAt.getTime() < 60_000);
  assert.equal((await portalByRequestHash(UCAD.requestHash.toUpperCase()))?.portalId, "ucad-sn", "whatever the case of the hash");
  assert.equal((await searchPortals("cheikh"))[0]?.portalId, "ucad-sn");
  assert.equal((await searchPortals("SN"))[0]?.portalId, "ucad-sn", "by country too");
  assert.deepEqual(await searchPortals("sorbonne"), []);
  assert.equal(await countPortals(), 1);
  assert.deepEqual(portalFound(back!), { pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", path: "" }, "what the chooser lists, and no sign-in address");
});

test("proving a portal again replaces its row rather than adding a second one", async () => {
  await savePortal({ ...UCAD, providerVersion: "1.1.0", extract: { ...UCAD.extract, matches: "^Inscrit" } });
  assert.equal(await countPortals(), 1);
  assert.equal((await loadPortal("ucad-sn"))?.providerVersion, "1.1.0");
});

test("words too short or too long are not searched on, and a pattern character in them cannot widen the search", async () => {
  assert.equal(isValidPortalSearch("u"), false);
  assert.equal(isValidPortalSearch("x".repeat(81)), false);
  assert.deepEqual(await searchPortals("%"), []);
  assert.deepEqual(await searchPortals("%%"), [], "two percent signs are not everything");
});

/** The results page, a second extraction on the row (D174): written after enrolment, kept when enrolment is proved again. */
const RESULTS: ResultsExtract = {
  providerId: "8a1b2c3d-0000-4000-8000-00000000abcd",
  providerVersion: "1.0.0",
  requestHash: `0x${"CD".repeat(32)}`,
  admitted: { field: "decision", matches: "^(Admis|Passed)" },
  grade: { field: "average", scale: { kind: "numeric", max: 20, step: 0.01 } },
  year: { field: "academicYear", matches: "2026-2027" },
};

function record(portal: string | null) {
  return { giftId: "1000009", conditionId: "x", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal };
}

test("the results page is written on a proved row, read back by either request, and survives enrolment being proved again", async () => {
  assert.equal((await loadPortal("ucad-sn"))?.results, null, "enrolment alone so far");
  assert.equal(await saveResults("nobody-knows", RESULTS), false, "no row, nothing to add to");
  await assert.rejects(saveResults("ucad-sn", { ...RESULTS, requestHash: UCAD.requestHash }), /not the enrolment's own/);
  await assert.rejects(saveResults("ucad-sn", { ...RESULTS, providerId: "nope" }), /results page, the results provider's id/);
  assert.equal(await saveResults("ucad-sn", RESULTS), true);
  const back = await loadPortal("ucad-sn");
  assert.deepEqual(back?.results, { ...RESULTS, requestHash: RESULTS.requestHash.toLowerCase() });
  assert.equal((await portalByRequestHash(RESULTS.requestHash))?.portalId, "ucad-sn", "the results request names the portal too");
  assert.equal(pageOfRequest(back!, RESULTS.requestHash), "results");
  assert.equal(pageOfRequest(back!, UCAD.requestHash), "enrolment");
  assert.equal(pageOfRequest(back!, `0x${"00".repeat(32)}`), null);
  // Enrolment proved again, with no results named on the command: the results page stays.
  await savePortal(UCAD);
  assert.deepEqual((await loadPortal("ucad-sn"))?.results, { ...RESULTS, requestHash: RESULTS.requestHash.toLowerCase() });
  // Named on the command, it is replaced.
  await savePortal({ ...UCAD, results: { ...RESULTS, grade: { field: "moyenne", scale: { kind: "numeric", max: 20, step: 0.5 } } } });
  assert.equal((await loadPortal("ucad-sn"))?.results?.grade.field, "moyenne");
});

test("the shown register reads the year and the grade off the portal's results page, and names what a portal without one lacks", async () => {
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
  // A portal proved for enrolment alone: the provider cannot serve, and says which page is missing.
  await savePortal({ ...UCAD, portalId: "sorbonne-fr", university: "Sorbonne Université", country: "FR", requestHash: `0x${"ef".repeat(32)}` });
  const none = await UNIVERSITY_YEAR_SHOWN.providerOf?.(record("sorbonne-fr"));
  assert.equal(none?.providerId, "");
  assert.equal(none?.missing?.code, "NO_RESULTS_PAGE");
  assert.throws(() => none?.read({}), (error: unknown) => error instanceof ShownProofError && error.code === "NO_RESULTS_PAGE");
  assert.equal(await UNIVERSITY_GRADE_SHOWN.providerOf?.(record("nobody-knows")), null);
  assert.equal(await UNIVERSITY_GRADE_SHOWN.providerOf?.(record(null)), null);
});

test("a row defined from the portal's public pages is marked unverified, says so on the chooser, and loses the mark once written again from a session (D193)", async () => {
  await savePortal({ ...UCAD, unverified: true });
  const marked = await loadPortal("ucad-sn");
  assert.equal(marked?.unverified, true);
  assert.equal(portalFound(marked!).title, "Université Cheikh Anta Diop (unverified)", "the funder reads it on the line they press");
  await savePortal(UCAD);
  const confirmed = await loadPortal("ucad-sn");
  assert.equal(confirmed?.unverified, false, "proving it from a student's session writes the row without the mark");
  assert.equal(portalFound(confirmed!).title, "Université Cheikh Anta Diop");
});

test("an unverified university does not refuse the gift: the funder reads, before paying, that nobody has shown a proof from it yet (D195)", async () => {
  const { universityNamed, UNIVERSITY_SHOWN_MILESTONE } = await import("../src/milestone-conditions");
  const { scanSource } = await import("../src/consumer-words");
  await savePortal({ ...UCAD, unverified: true });
  const found = portalFound((await loadPortal("ucad-sn"))!);
  const title = `${found.title}, ${found.issuer}`;
  const said = universityNamed("staying enrolled at ", title);
  assert.equal(said, "This gift will be for staying enrolled at Université Cheikh Anta Diop (unverified), Senegal. Nobody has shown a proof from this university yet. If it cannot be read, your money comes back to you at the deadline.");
  assert.deepEqual(scanSource("sentence", said), [], "through the consumer words check");
  assert.equal(universityNamed("", "Université Cheikh Anta Diop, Senegal"), "This gift will be for Université Cheikh Anta Diop, Senegal.", "a verified row says nothing more");
  assert.equal(UNIVERSITY_SHOWN_MILESTONE.portal?.refuses((await loadPortal("ucad-sn"))!, UNIVERSITY_SHOWN_MILESTONE.target.suggested), undefined, "made on an unverified portal: the mark refuses nothing");
});
