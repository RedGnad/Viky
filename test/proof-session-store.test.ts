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
  loadOpenShownSession,
  PROOF_SESSION_TTL_SECONDS,
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
    conditionId: "duolingo-daily",
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
    conditionId: "duolingo-daily",
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
    conditionId: "duolingo-daily",
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
    conditionId: "duolingo-daily",
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

test("the session open for a gift's one proof is found again by the gift and the account, never by a name the page gives", async () => {
  // A phone loads the gift's page again on the way back from the verification (7 Oct 2026): the row is what is left.
  const URL_OLD = "https://share.reclaimprotocol.org/verify/?template=old";
  const URL_NEW = "https://share.reclaimprotocol.org/verify/?template=new";
  const open = (sessionId: string, requestUrl: string | undefined, account = ACCOUNT, giftId = "1000006") =>
    saveProofSession({ sessionId, account, giftId, conditionId: "university-enrollment-shown", goalType: 13, phase: "reach", dayIndex: 0, ...(requestUrl ? { requestUrl } : {}) });
  assert.equal(await loadOpenShownSession("1000006", ACCOUNT), null, "nothing was opened");
  await open("reach-old", URL_OLD);
  await db.query("UPDATE viky_proof_sessions SET created_at = now() - interval '10 minutes' WHERE session_id = 'reach-old'");
  const first = await loadOpenShownSession("1000006", ACCOUNT.toLowerCase());
  assert.equal(first?.sessionId, "reach-old");
  assert.equal(first?.requestUrl, URL_OLD, "the same verification page is offered again");
  assert.equal(first?.conditionId, "university-enrollment-shown");
  // What is left of its thirty minutes, by the database's clock: twenty, give or take the test's own seconds.
  assert.ok(first!.secondsLeft <= PROOF_SESSION_TTL_SECONDS - 600 && first!.secondsLeft > PROOF_SESSION_TTL_SECONDS - 660, String(first!.secondsLeft));

  // The newest one, when the person opened another.
  await open("reach-new", URL_NEW);
  assert.equal((await loadOpenShownSession("1000006", ACCOUNT))?.sessionId, "reach-new");
  // Somebody else's account, another gift, or a gift that is no number: nothing.
  assert.equal(await loadOpenShownSession("1000006", "0x000000000000000000000000000000000000b0b0"), null);
  assert.equal(await loadOpenShownSession("1000007", ACCOUNT), null);
  assert.equal(await loadOpenShownSession("1000006' OR 1=1", ACCOUNT), null);
  // A row from before the address was kept has no page to offer: it is not taken up.
  await open("reach-bare", undefined, ACCOUNT, "1000008");
  assert.equal(await loadOpenShownSession("1000008", ACCOUNT), null);
  // A daily gift's session is not a milestone's one proof.
  await saveProofSession({ sessionId: "daily-open", account: ACCOUNT, giftId: "77", conditionId: "duolingo-daily", goalType: 1, phase: "check-in", dayIndex: 2, requestUrl: URL_NEW });
  assert.equal(await loadOpenShownSession("77", ACCOUNT), null);

  // Answered: gone, and the older one is the open one again.
  assert.equal(await consumeAndSaveVerification({ sessionId: "reach-new", evidence: { held: "utoulouse-fr" }, attestation: { message: {}, signature: "0x" }, proofs: null }), true);
  assert.equal((await loadOpenShownSession("1000006", ACCOUNT))?.sessionId, "reach-old");
  // Aged out: gone, by the same thirty minutes that stop it being answered.
  await db.query(`UPDATE viky_proof_sessions SET created_at = now() - interval '${PROOF_SESSION_TTL_SECONDS + 5} seconds' WHERE session_id = 'reach-old'`);
  assert.equal(await loadOpenShownSession("1000006", ACCOUNT), null);
  assert.equal(await loadProofSession("reach-old"), null);
});
