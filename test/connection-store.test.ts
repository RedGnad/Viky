// The connections a person made, against a real Postgres (PGlite in-process), so the SQL is what runs on Neon.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { configureConnectionStore, connectionInWords, ensureConnectionSchema, eraseConnection, loadConnection, saveConnection, saveRefreshedTokens } from "../src/connection-store";
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
  configureConnectionStore(pgliteExecutor(db));
  await ensureConnectionSchema();
});

after(async () => {
  configureConnectionStore(undefined);
  await db.close();
});

const ROW = { giftId: "42", source: "fitbit" as const, externalId: "ABC123", accessToken: "v1.sealed.access", refreshToken: "v1.sealed.refresh", expiresAt: new Date("2026-09-24T00:00:00Z"), scope: "activity" };

test("a connection is one row per gift, sealed as given, and connecting again replaces it", async () => {
  assert.equal(await loadConnection("42"), null);
  assert.deepEqual(connectionInWords(null), { connected: false, source: null, since: null });
  await saveConnection(ROW);
  const back = await loadConnection("42");
  assert.equal(back?.externalId, "ABC123");
  assert.equal(back?.accessToken, "v1.sealed.access", "stored as the vault sealed it, never opened here");
  assert.equal(back?.refreshedAt, null);
  assert.equal(connectionInWords(back).connected, true);
  assert.equal(connectionInWords(back).source, "fitbit");
  assert.ok(connectionInWords(back).since);
  await saveConnection({ ...ROW, externalId: "XYZ789", accessToken: "v1.sealed.again" });
  assert.equal((await loadConnection("42"))?.externalId, "XYZ789");
  const rows = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM viky_connections");
  assert.equal(rows.rows[0].n, 1);
});

test("a refresh rotates both keys and says when; erasing deletes the row whole", async () => {
  await saveRefreshedTokens("42", { accessToken: "v1.sealed.new", refreshToken: "v1.sealed.newr", expiresAt: new Date("2026-09-25T00:00:00Z") });
  const back = await loadConnection("42");
  assert.equal(back?.accessToken, "v1.sealed.new");
  assert.equal(back?.refreshToken, "v1.sealed.newr");
  assert.ok(back?.refreshedAt);
  assert.equal(await eraseConnection("42"), true);
  assert.equal(await loadConnection("42"), null);
  assert.equal(await eraseConnection("42"), false, "nothing left to erase");
});
