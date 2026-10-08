// A second pass in the same visit (8 Oct 2026). Under a pin made ahead of any proof, a first pass that came back with
// none is followed by one with Reclaim's agent, as every pass of 7 Oct 2026 ran; a first press, a page nobody opened,
// a proof on its way and a pin a proof has borne out all run the pinned rule. Against a real Postgres (PGlite
// in-process), so the SQL is what runs on Neon.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { configureProofSessionStore, consumeAndSaveVerification, ensureProofSessionSchema, PROOF_SESSION_TTL_SECONDS, saveProofSession, type SqlExecutor } from "../src/proof-session-store";
import { AGENT_FIRST_VERSION, configureSecondPass, earlierPassGaveNoProof, passGaveNoProof, versionAsked, type ReclaimRecord } from "../src/second-pass";
import { isWitnessVersion } from "../src/witness-portal";

let db: PGlite;
const executor: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};
const STUDENT = "0x000000000000000000000000000000000000A11c";
const OTHER = "0x000000000000000000000000000000000000b0b0";
const CONDITION = "university-enrollment-shown";
const GIFT = "1000007";
const PASS = { giftId: GIFT, account: STUDENT, conditionId: CONDITION };

before(async () => {
  db = new PGlite();
  configureProofSessionStore(executor);
  configureSecondPass(executor);
  await ensureProofSessionSchema();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_proof_sessions");
});

after(async () => {
  configureProofSessionStore(undefined);
  configureSecondPass(undefined);
  await db.close();
});

/** A session as the session route writes it. */
async function opened(sessionId: string, of: Readonly<{ giftId?: string; account?: string }> = {}): Promise<void> {
  await saveProofSession({ sessionId, account: of.account ?? STUDENT, giftId: of.giftId ?? GIFT, conditionId: CONDITION, goalType: 14, phase: "reach", dayIndex: 0, requestUrl: "https://portal.reclaimprotocol.org/?sessionId=s" });
}

/** The link a session's row keeps, as Reclaim's SDK builds it: one `template` field, JSON, with the version asked. */
function linkAsking(version: string, agent: boolean): string {
  return `https://portal.reclaimprotocol.org/?template=${encodeURIComponent(JSON.stringify({ sessionId: "s", providerId: "c560dffd-5f37-4b8a-94ed-106ce9e9ee27", providerVersion: version, resolvedProviderVersion: version, acceptAiProviders: agent }))}`;
}

/** A session opened on one version of the provider. */
async function openedOn(sessionId: string, version: string, agent = false): Promise<void> {
  await saveProofSession({ sessionId, account: STUDENT, giftId: GIFT, conditionId: CONDITION, goalType: 14, phase: "reach", dayIndex: 0, requestUrl: linkAsking(version, agent) });
}

/** Reclaim's public record of each session, and which ones were asked for. */
function reclaim(records: Record<string, ReclaimRecord>) {
  const asked: string[] = [];
  return {
    asked,
    deps: {
      recordOf: async (sessionId: string) => {
        asked.push(sessionId);
        return records[sessionId] ?? null;
      },
    },
  };
}

test("a first press has no pass behind it: the pinned rule runs", async () => {
  const none = reclaim({});
  assert.equal(await earlierPassGaveNoProof(PASS, none.deps), false);
  assert.deepEqual(none.asked, [], "nothing to ask Reclaim about");
});

test("a pass the person made that gave no proof opens the next one with the agent", async () => {
  // The record of a verification page left with nothing made, as Reclaim kept it on 8 Oct 2026 (session e6286e05c7).
  await opened("first-pass");
  const left = reclaim({ "first-pass": { state: "USER_STARTED_VERIFICATION", proofs: 0 } });
  assert.equal(await earlierPassGaveNoProof(PASS, left.deps), true);
  // The same once its thirty minutes are over: the row is still there, and the pass still gave nothing.
  await db.query("UPDATE viky_proof_sessions SET created_at = now() - make_interval(secs => $1)", [PROOF_SESSION_TTL_SECONDS + 60]);
  assert.equal(await earlierPassGaveNoProof(PASS, left.deps), true);
  // Asked by the account as the cookie gives it, whatever its letters' case.
  assert.equal(await earlierPassGaveNoProof({ ...PASS, account: STUDENT.toLowerCase() }, left.deps), true);
});

test("a session Reclaim ended with no proof counts by its own row, with nothing asked", async () => {
  await opened("ended");
  await consumeAndSaveVerification({ sessionId: "ended", evidence: { stopped: "ERROR_SUBMITTED" }, attestation: { message: {}, signature: "0x" }, proofs: null });
  const record = reclaim({});
  assert.equal(await earlierPassGaveNoProof(PASS, record.deps), true);
  assert.deepEqual(record.asked, []);
});

test("a page nobody opened, a proof on its way and a record Reclaim does not give are no empty pass", async () => {
  await opened("never-opened");
  assert.equal(await earlierPassGaveNoProof(PASS, reclaim({ "never-opened": { state: "SESSION_STARTED", proofs: 0 } }).deps), false, "a link drawn and never pressed is not a pass");
  for (const state of ["PROOF_GENERATION_STARTED", "PROOF_GENERATION_SUCCESS", "PROOF_SUBMITTED", "AI_PROOF_SUBMITTED"]) {
    assert.equal(await earlierPassGaveNoProof(PASS, reclaim({ "never-opened": { state, proofs: 0 } }).deps), false, state);
  }
  assert.equal(await earlierPassGaveNoProof(PASS, reclaim({ "never-opened": { state: "USER_STARTED_VERIFICATION", proofs: 1 } }).deps), false, "a proof is there to take");
  assert.equal(await earlierPassGaveNoProof(PASS, reclaim({}).deps), false, "Reclaim gives no record");
  assert.equal(await earlierPassGaveNoProof(PASS, { recordOf: async () => Promise.reject(new Error("Reclaim did not answer")) }), false, "Reclaim does not answer");
});

test("a pass counts against the rule pinned now, and no other", async () => {
  // The student's two passes of 8 Oct 2026, both cancelled at Reclaim with no proof: the rule 3.0.0, then the agent.
  await openedOn("on-3-0-0", "3.0.0");
  await openedOn("with-the-agent", AGENT_FIRST_VERSION, true);
  const cancelled = { state: "SESSION_CANCELLED", proofs: 0 };
  const record = reclaim({ "on-3-0-0": cancelled, "with-the-agent": cancelled, "on-3-0-1": cancelled });
  // Under the pin they ran, the next press goes to the agent, as it did.
  assert.equal(await earlierPassGaveNoProof({ ...PASS, version: "3.0.0" }, record.deps), true);
  // The rule corrected and pinned again as 3.0.1: neither pass was its own, so its first pass runs it, and Reclaim is
  // asked nothing about sessions that are not its own.
  record.asked.length = 0;
  assert.equal(await earlierPassGaveNoProof({ ...PASS, version: "3.0.1" }, record.deps), false);
  assert.deepEqual(record.asked, []);
  // Once 3.0.1 has had its pass and given nothing, the next one goes to the agent.
  await openedOn("on-3-0-1", "3.0.1");
  assert.equal(await earlierPassGaveNoProof({ ...PASS, version: "3.0.1" }, record.deps), true);
  // A session Reclaim ended, closed on its own row, is held to the same question.
  await db.query("DELETE FROM viky_proof_sessions");
  await openedOn("ended-on-3-0-0", "3.0.0");
  await consumeAndSaveVerification({ sessionId: "ended-on-3-0-0", evidence: { stopped: "SESSION_CANCELLED" }, attestation: { message: {}, signature: "0x" }, proofs: null });
  assert.equal(await earlierPassGaveNoProof({ ...PASS, version: "3.0.1" }, record.deps), false);
  assert.equal(await earlierPassGaveNoProof({ ...PASS, version: "3.0.0" }, record.deps), true);
});

test("the version asked is read from the link, and a link that does not say counts as it did", async () => {
  assert.equal(versionAsked(linkAsking("3.0.1", false)), "3.0.1");
  assert.equal(versionAsked(linkAsking(AGENT_FIRST_VERSION, true)), "1.0.0");
  for (const silent of ["https://portal.reclaimprotocol.org/?sessionId=s", "https://portal.reclaimprotocol.org/?template=not-json", "not a link", "", null, undefined]) {
    assert.equal(versionAsked(silent), null, String(silent));
  }
  // A row whose link names no version: counted whatever is pinned, which is what every pass before this did.
  await opened("no-version-on-its-link");
  const left = reclaim({ "no-version-on-its-link": { state: "USER_STARTED_VERIFICATION", proofs: 0 } });
  assert.equal(await earlierPassGaveNoProof({ ...PASS, version: "3.0.1" }, left.deps), true);
});

test("a pass held for review or paid, another person's and another gift's are not this gift's empty pass", async () => {
  await opened("held");
  await consumeAndSaveVerification({ sessionId: "held", evidence: { held: "utoulouse-fr" }, attestation: { message: {}, signature: "0x" }, proofs: null });
  await opened("theirs", { account: OTHER });
  await opened("elsewhere", { giftId: "1000008" });
  const empty = { state: "USER_STARTED_VERIFICATION", proofs: 0 };
  const record = reclaim({ held: empty, theirs: empty, elsewhere: empty });
  assert.equal(await earlierPassGaveNoProof(PASS, record.deps), false);
  assert.deepEqual(record.asked, [], "none of the three is looked up for this person and this gift");
});

test("a lookup that fails says no, and holds no press up", async () => {
  await opened("first-pass");
  configureSecondPass(async () => Promise.reject(new Error("the database did not answer")));
  try {
    assert.equal(await earlierPassGaveNoProof(PASS, reclaim({ "first-pass": { state: "USER_STARTED_VERIFICATION", proofs: 0 } }).deps), false);
  } finally {
    configureSecondPass(executor);
  }
});

test("what an empty pass is, state by state", () => {
  for (const state of ["USER_INIT_VERIFICATION", "USER_STARTED_VERIFICATION", "PROOF_GENERATION_FAILED", "PROOF_SUBMISSION_FAILED", "ERROR_SUBMITTED", "ERROR_SUBMISSION_FAILED", "SESSION_CANCELLED"]) {
    assert.equal(passGaveNoProof({ state, proofs: 0 }), true, state);
  }
  for (const state of ["SESSION_INIT", "SESSION_STARTED", "PROOF_GENERATION_STARTED", "PROOF_GENERATION_SUCCESS", "PROOF_SUBMITTED", "AI_PROOF_SUBMITTED", "PROOF_MANUAL_VERIFICATION_SUBMITED"]) {
    assert.equal(passGaveNoProof({ state, proofs: 0 }), false, state);
  }
});

test("the session route asks for the agent on that second pass only, under a pin made ahead, from the version it builds from", () => {
  const source = readFileSync("app/api/proof/session/route.ts", "utf8");
  // Only under a pin no proof has borne out, and only after a pass that gave none: a first press never asks.
  assert.match(source, /const withTheAgent = Boolean\(witness\?\.pin\?\.ahead\) && \(await earlierPassGaveNoProof\(\{ giftId, account, conditionId: entry\.condition\.conditionId, version: witness\?\.pin\?\.providerVersion \}\)\);/);
  assert.match(source, /providerVersion: withTheAgent \? AGENT_FIRST_VERSION : providerVersion \}/);
  assert.match(source, /acceptAiProviders: Boolean\(witness\) && \(withTheAgent \|\| !witness\?\.pin\?\.fixed\),/);
  // Decided before the session is opened at Reclaim, with the gift and the account the cookie and the row gave.
  assert.ok(source.indexOf("if (gift.recipient?.toLowerCase() !== account.toLowerCase())") < source.indexOf("const withTheAgent ="));
  assert.ok(source.indexOf("const withTheAgent =") < source.indexOf("ReclaimProofRequest.init("));
  // The agent's first version is one a held proof may carry, as its own versions are.
  assert.equal(AGENT_FIRST_VERSION, "1.0.0");
  assert.equal(isWitnessVersion(AGENT_FIRST_VERSION), true);
  assert.equal(isWitnessVersion(`${AGENT_FIRST_VERSION}-ai.4`), true);
  // A proof that does not fit a pin made ahead is held, never refused: the agent's is one.
  assert.match(readFileSync("src/shown-verification.ts", "utf8"), /if \(expected\.version !== expected\.pin\.providerVersion\) return false;/);
});
