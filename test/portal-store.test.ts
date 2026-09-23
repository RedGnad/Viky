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
  portalByRequestHash,
  portalFound,
  portalProblem,
  savePortal,
  searchPortals,
} from "../src/portal-store";
import type { SqlExecutor } from "../src/proof-session-store";

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
