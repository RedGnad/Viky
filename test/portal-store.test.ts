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

test("a row not yet shown by a student keeps the mark in the register, and the flow never prints it (the founder, 26 Sep 2026)", async () => {
  await savePortal({ ...UCAD, unverified: true });
  const marked = await loadPortal("ucad-sn");
  assert.equal(marked?.unverified, true, "in the register");
  assert.equal(portalFound(marked!).title, "Université Cheikh Anta Diop", "never on the line the funder presses");
  await savePortal(UCAD);
  assert.equal((await loadPortal("ucad-sn"))?.unverified, false);
});

test("a portal that proves a student account alone says so on its line, and a row says enrolment unless told otherwise", async () => {
  await savePortal(UCAD);
  assert.equal((await loadPortal("ucad-sn"))?.proves, "enrolment");
  await savePortal({ ...UCAD, proves: "account" });
  const account = await loadPortal("ucad-sn");
  assert.equal(account?.proves, "account");
  assert.equal(portalFound(account!).title, "Université Cheikh Anta Diop (student account)");
  await savePortal(UCAD);
});

test("the gift's sentence says exactly what the portal proves, and nothing about whether it was shown yet", async () => {
  const { universityNamed, UNIVERSITY_SHOWN_MILESTONE } = await import("../src/milestone-conditions");
  const { scanSource } = await import("../src/consumer-words");
  await savePortal({ ...UCAD, unverified: true, proves: "account" });
  const found = portalFound((await loadPortal("ucad-sn"))!);
  const said = universityNamed("staying enrolled at ", `${found.title}, ${found.issuer}`);
  assert.equal(said, "This gift will be for staying enrolled at Université Cheikh Anta Diop, Senegal. Its student portal shows that a student account is active, not that they are enrolled this year: that is what this gift will check.");
  assert.deepEqual(scanSource("sentence", said), [], "through the consumer words check");
  await savePortal({ ...UCAD, unverified: true });
  const enrolment = portalFound((await loadPortal("ucad-sn"))!);
  assert.equal(universityNamed("", `${enrolment.title}, ${enrolment.issuer}`), "This gift will be for Université Cheikh Anta Diop, Senegal.", "enrolment, shown or not yet: nothing more");
  assert.equal(UNIVERSITY_SHOWN_MILESTONE.portal?.refuses((await loadPortal("ucad-sn"))!, UNIVERSITY_SHOWN_MILESTONE.target.suggested), undefined, "the register's mark refuses nothing");
  await savePortal(UCAD);
});
