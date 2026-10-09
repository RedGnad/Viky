// The month's count of proofs holds every proof Reclaim made (7 Oct 2026): the ones a university's portal gives, which
// never reach the enclave's check where they used to be counted, and the ones made and never asked for, looked up each
// night in Reclaim's own public record. Against a real Postgres (PGlite in-process), so the SQL is what runs on Neon.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { configureAttestedCalls, countProofsNeverTaken, cycleUse, limitsOf, NEVER_TAKEN_AFTER_SECONDS, noteAttestedCall, RECLAIM_PROOF_MADE } from "../src/attested-calls";
import { configureProofSessionStore, consumeAndSaveVerification, ensureProofSessionSchema, PROOF_SESSION_TTL_SECONDS, saveProofSession, type SqlExecutor } from "../src/proof-session-store";

let db: PGlite;
const quiet = async () => {};
const executor: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};
/** 7 Oct 2026, 16:00 UTC: the afternoon of the first university proof. */
const NOW = Date.UTC(2026, 9, 7, 16, 0, 0);
const ACCOUNT = "0x000000000000000000000000000000000000a11c";
const SOURCE = "university-enrollment-shown";

before(async () => {
  db = new PGlite();
  configureAttestedCalls(executor);
  configureProofSessionStore(executor);
  await ensureProofSessionSchema();
});

beforeEach(async () => {
  await noteAttestedCall({ kind: "fetch", source: "made-so-the-table-exists", ok: true }, quiet);
  await db.query("DELETE FROM viky_attested_calls");
  await db.query("DELETE FROM viky_proof_sessions");
});

after(async () => {
  configureAttestedCalls(undefined);
  configureProofSessionStore(undefined);
  await db.close();
});

/** A session opened at a given time of that day, as the session route writes it. */
async function opened(sessionId: string, at: string): Promise<void> {
  await noteAttestedCall({ kind: "asked", source: SOURCE, ok: true, ref: sessionId }, quiet);
  await db.query("UPDATE viky_attested_calls SET at = $1 WHERE ref = $2 AND kind = 'asked'", [`2026-10-07T${at}Z`, sessionId]);
  await saveProofSession({ sessionId, account: ACCOUNT, giftId: "1000006", conditionId: SOURCE, goalType: 14, phase: "reach", dayIndex: 0, requestUrl: "https://share.reclaimprotocol.org/verify/?template=t" });
}

const verifications = async () => (await db.query<{ ref: string; ok: boolean; code: string | null; at: Date }>("SELECT ref, ok, code, at FROM viky_attested_calls WHERE kind = 'verification' ORDER BY ref")).rows;

test("the day of the first university proof, as Reclaim's record had it: three proofs counted, where the journal showed none", async () => {
  // Eight sessions opened; Reclaim made a proof in three, ended one on an error, and four went nowhere.
  const states: Record<string, string> = { "c3e5a7b9d1": "PROOF_SUBMITTED", f6b8d0e2a4: "PROOF_SUBMITTED", "a1c3e5f7b9": "PROOF_SUBMITTED", "b2d4f6a8c0": "ERROR_SUBMITTED", "d4f6b8c0e2": "SESSION_STARTED" };
  await opened("d4f6b8c0e2", "12:15:25");
  await opened("e5a7c9d1f3", "12:44:08");
  await opened("c3e5a7b9d1", "13:12:46");
  await opened("f6b8d0e2a4", "13:27:03");
  await opened("b2d4f6a8c0", "14:33:01");
  await opened("a1c3e5f7b9", "14:51:58");
  // The third proof was taken and held for review; the first two were never asked for.
  await consumeAndSaveVerification({ sessionId: "a1c3e5f7b9", evidence: { held: "utoulouse-fr" }, attestation: { message: {}, signature: "0x" }, proofs: null });
  // A session Reclaim ended was closed by a look, with no proof.
  await consumeAndSaveVerification({ sessionId: "b2d4f6a8c0", evidence: { stopped: "ERROR_SUBMITTED" }, attestation: { message: {}, signature: "0x" }, proofs: null });

  assert.equal((await cycleUse(NOW)).verifications.shown, 0, "what the journal said that afternoon");
  const looked: string[] = [];
  const written = await countProofsNeverTaken(NOW, {
    stateOf: async (sessionId) => {
      looked.push(sessionId);
      // One session Reclaim does not answer for: nothing is written for it, and nothing stops.
      if (sessionId === "e5a7c9d1f3") throw new Error("Reclaim did not answer");
      return states[sessionId] ?? null;
    },
  });
  assert.equal(written, 3);
  assert.deepEqual(looked.sort(), ["a1c3e5f7b9", "b2d4f6a8c0", "c3e5a7b9d1", "d4f6b8c0e2", "e5a7c9d1f3", "f6b8d0e2a4"].sort(), "each session opened and not counted is looked up once");
  const rows = await verifications();
  assert.deepEqual(
    rows.map((row) => [row.ref, row.ok, row.code]),
    [
      ["a1c3e5f7b9", true, null],
      ["c3e5a7b9d1", false, "NEVER_TAKEN"],
      ["f6b8d0e2a4", false, "NEVER_TAKEN"],
    ],
  );
  // Written at the time the session was opened: the cycle and the day it belongs to.
  assert.equal(new Date(rows[1].at).toISOString(), "2026-10-07T13:12:46.000Z");
  const use = await cycleUse(NOW);
  assert.equal(use.verifications.asked, 6);
  assert.equal(use.verifications.shown, 3);
  assert.equal(use.verifications.verified, 1);

  // The next night finds nothing new, and writes nothing twice.
  assert.equal(await countProofsNeverTaken(NOW + 86_400_000, { stateOf: async (sessionId) => states[sessionId] ?? null }), 0);
  assert.equal((await verifications()).length, 3);
});

test("a session still inside its thirty minutes is left to the page that may take its proof, and an old one is not asked about", async () => {
  assert.equal(NEVER_TAKEN_AFTER_SECONDS, PROOF_SESSION_TTL_SECONDS);
  await opened("just-opened", "15:45:00");
  await opened("four-days-ago", "15:00:00");
  await db.query("UPDATE viky_attested_calls SET at = at - interval '4 days' WHERE ref = 'four-days-ago'");
  const looked: string[] = [];
  const stateOf = async (sessionId: string) => {
    looked.push(sessionId);
    return "PROOF_SUBMITTED";
  };
  assert.equal(await countProofsNeverTaken(NOW, { stateOf }), 0);
  assert.deepEqual(looked, []);
  // Half an hour on, the first is past its thirty minutes.
  assert.equal(await countProofsNeverTaken(NOW + 30 * 60_000, { stateOf }), 1);
  assert.deepEqual(looked, ["just-opened"]);
});

test("a proof counted where it came back is not counted again, and twenty-five of them are the month's limit", async () => {
  assert.deepEqual(RECLAIM_PROOF_MADE, ["PROOF_SUBMITTED", "AI_PROOF_SUBMITTED"]);
  await opened("came-back", "13:00:00");
  await noteAttestedCall({ kind: "verification", source: SOURCE, ok: true, ref: "came-back" }, quiet);
  assert.equal(await countProofsNeverTaken(NOW, { stateOf: async () => assert.fail("already counted: not looked up") }), 0);
  for (let index = 0; index < 24; index += 1) await noteAttestedCall({ kind: "verification", source: SOURCE, ok: index % 2 === 0, ref: `proof-${index}` }, quiet);
  assert.equal(limitsOf(await cycleUse(Date.now())).proofs, true, "university proofs count towards the limit like any other");
});

test("the verify route counts a proof whenever Reclaim's record holds one, whichever way it is then verified", () => {
  const route = readFileSync("app/api/proof/verify/route.ts", "utf8");
  // Seen where the session's record is read, before any check that could refuse it.
  assert.match(route, /cameBackWithProof = Array\.isArray\(proofs\) \? proofs\.length > 0 : Boolean\(proofs\);/);
  // Counted once after the verdict when the enclave's check did not count it: a witness portal's proof, or one refused earlier.
  assert.match(route, /if \(cameBackWithProof && !counted\) await cameBack\(true\);/);
  assert.match(route, /if \(cameBackWithProof && !counted\) await cameBack\(false\);/);
  // And the watch looks up, each night, the ones that never came back.
  assert.match(readFileSync("app/api/cron/watch/route.ts", "utf8"), /await countProofsNeverTaken\(\)\.catch\(/);
  // After the watch itself (the final audit of 9 Oct 2026): each session is asked of Reclaim one by one, and a night
  // its record answered slowly the task was cut at sixty seconds before the watch had looked at anything.
  const watch = readFileSync("app/api/cron/watch/route.ts", "utf8");
  const looked = watch.indexOf("const watch = await watchAfterMorning();");
  assert.ok(looked > 0 && looked < watch.indexOf("await countProofsNeverTaken()"), "the watch first, the count after");
  assert.match(watch, /NextResponse\.json\(\{ watch, proofsNeverCounted, \.\.\.test \}, \{ headers: NO_STORE \}\)/, "the answer keeps its fields");
});
