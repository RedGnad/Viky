// The session store against a real Postgres (PGlite in-process), so the SQL is what runs on Neon.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { DuolingoEvidence } from "../src/duolingo-proof-policy";
import {
  configureProofSessionStore,
  consumeAndSaveVerification,
  ensureProofSessionSchema,
  loadAttestation,
  loadLatestEvidence,
  loadProofSession,
  pruneExpiredProofSessions,
  saveProofSession,
  type SqlExecutor,
} from "../src/proof-session-store";

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
  configureProofSessionStore(pgliteExecutor(db));
  await ensureProofSessionSchema();
});

after(async () => {
  configureProofSessionStore(undefined);
  await db.close();
});

const ACCOUNT = "0x000000000000000000000000000000000000A11C";

function evidence(overrides: Partial<DuolingoEvidence> = {}): DuolingoEvidence {
  return {
    profileId: "123456",
    totalXp: 1000,
    identityHash: `0x${"11".repeat(32)}`,
    eventNullifier: `0x${"22".repeat(32)}`,
    observedAt: 1_784_000_000,
    sessionId: "s1",
    phase: "baseline",
    dayIndex: 0,
    ...overrides,
  };
}

test("saves and loads a live session, lowercasing the account", async () => {
  await saveProofSession({
    sessionId: "s1",
    account: ACCOUNT,
    giftId: "42",
    goalType: 1,
    phase: "baseline",
    dayIndex: 0,
    duolingoUsername: "ama",
    duolingoProfileId: "123456",
  });
  const loaded = await loadProofSession("s1");
  assert.deepEqual(loaded, {
    sessionId: "s1",
    account: ACCOUNT.toLowerCase(),
    giftId: "42",
    goalType: 1,
    phase: "baseline",
    dayIndex: 0,
    duolingoUsername: "ama",
    duolingoProfileId: "123456",
  });
  assert.equal(await loadProofSession("missing"), null);
});

test("consumes a session exactly once and records evidence, attestation and proofs together", async () => {
  const attestation = { message: { giftId: "42" }, signature: `0x${"33".repeat(65)}` as `0x${string}` };
  assert.equal(await consumeAndSaveVerification({ sessionId: "s1", evidence: evidence(), attestation, proofs: [{ a: 1 }] }), true);
  assert.equal(await loadProofSession("s1"), null, "a consumed session is no longer live");
  assert.equal(await consumeAndSaveVerification({ sessionId: "s1", evidence: evidence(), attestation, proofs: [] }), false, "replay refused");
  assert.deepEqual(await loadAttestation("s1"), attestation);
  assert.equal(await loadAttestation("missing"), null);
});

test("returns the latest evidence for a gift and account, and null before the baseline", async () => {
  assert.equal(await loadLatestEvidence("42", "0x000000000000000000000000000000000000b0b0"), null);
  assert.deepEqual(await loadLatestEvidence("42", ACCOUNT), evidence());

  await saveProofSession({
    sessionId: "s2",
    account: ACCOUNT,
    giftId: "42",
    goalType: 1,
    phase: "check-in",
    dayIndex: 1,
    duolingoUsername: "ama",
    duolingoProfileId: "123456",
  });
  await db.query("UPDATE viky_proof_sessions SET created_at = created_at + interval '1 second' WHERE session_id = 's2'");
  const newer = evidence({ totalXp: 1010, phase: "check-in", dayIndex: 1, sessionId: "s2", eventNullifier: `0x${"44".repeat(32)}` });
  assert.equal(
    await consumeAndSaveVerification({ sessionId: "s2", evidence: newer, attestation: { message: {}, signature: "0x" }, proofs: [] }),
    true,
  );
  assert.deepEqual(await loadLatestEvidence("42", ACCOUNT), newer);
});

test("expiry is enforced in SQL and pruning removes only stale unconsumed sessions", async () => {
  await saveProofSession({
    sessionId: "s3",
    account: ACCOUNT,
    giftId: "43",
    goalType: 1,
    phase: "baseline",
    dayIndex: 0,
    duolingoUsername: "ama",
    duolingoProfileId: "123456",
  });
  await db.query("UPDATE viky_proof_sessions SET created_at = now() - interval '31 minutes' WHERE session_id = 's3'");
  assert.equal(await loadProofSession("s3"), null, "older than the 30 minute TTL");
  await db.query("UPDATE viky_proof_sessions SET created_at = now() - interval '2 days' WHERE session_id = 's3'");
  await pruneExpiredProofSessions();
  const remaining = await db.query<{ session_id: string }>("SELECT session_id FROM viky_proof_sessions ORDER BY session_id");
  assert.deepEqual(
    remaining.rows.map((row) => row.session_id),
    ["s1", "s2"],
    "consumed sessions stay (they hold the evidence), the stale unconsumed one is gone",
  );
});
