// Under a pin, the pinned rule at every press (the founder, 9 Oct 2026). For a day, a pass of a rule pinned ahead that
// came back with no proof was followed by one with Reclaim's agent: a session closed for inactivity in front of the
// form counted as the trial of the fixed rule, and the next press led somewhere else. Against a real Postgres (PGlite
// in-process) for the session's row, so what the test leaves behind it is what production's table holds.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { configureProofSessionStore, consumeAndSaveVerification, ensureProofSessionSchema, loadOpenShownSession, saveProofSession, type SqlExecutor } from "../src/proof-session-store";
import { pinnedRuleAlert } from "../src/provider-alert";
import { ruleAsked, type WitnessPin } from "../src/witness-portal";

let db: PGlite;
const executor: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};
const STUDENT = "0x000000000000000000000000000000000000A11c";
const CONDITION = "university-enrollment-shown";
const GIFT = "1000009";

/** A rule pinned ahead of any proof, written by hand: Toulouse's on 9 Oct 2026, in its shape. */
const PINNED: WitnessPin = { providerVersion: "5.0.0", url: "https://portal.example/file", method: "POST", responseMatches: "[]", responseRedactions: "[]", specHash: `0x${"84".repeat(32)}`, ahead: true, fixed: true };

before(async () => {
  db = new PGlite();
  configureProofSessionStore(executor);
  await ensureProofSessionSchema();
});

after(async () => {
  configureProofSessionStore(undefined);
  await db.close();
});

test("after a session of the pinned version ended with no proof, the next one asks for the same version, with no agent", async () => {
  const provider = { providerVersion: PINNED.providerVersion, witness: { pin: PINNED } };
  const first = ruleAsked(provider);
  assert.deepEqual(first, { providerVersion: "5.0.0", acceptAiProviders: false });

  // The first session, opened on that version, and ended at Reclaim with no proof: its row is closed as the verify
  // route closes it (src/shown-verification.ts), which is what gift 1000009 had on 9 Oct 2026.
  const link = `https://portal.reclaimprotocol.org/?template=${encodeURIComponent(JSON.stringify({ providerId: "provider", providerVersion: first.providerVersion, acceptAiProviders: first.acceptAiProviders }))}`;
  await saveProofSession({ sessionId: "pinned-and-stopped", account: STUDENT, giftId: GIFT, goalType: 13, conditionId: CONDITION, phase: "reach", dayIndex: 0, requestUrl: link });
  assert.equal(await consumeAndSaveVerification({ sessionId: "pinned-and-stopped", evidence: { stopped: "SESSION_CANCELLED" }, attestation: { message: {}, signature: "0x" }, proofs: null }), true);
  assert.equal(await loadOpenShownSession(GIFT, STUDENT), null, "nothing is open: the person presses again");

  // The next press: the same version, and no agent.
  assert.deepEqual(ruleAsked(provider), first);

  // And nothing of an earlier session can change it: the route reads none, and the module that did is gone.
  const route = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(route, /await ReclaimProofRequest\.init\(appId, appSecret, providerId, \{\s+\.\.\.ruleAsked\(\{ providerVersion, witness \}\),\s+\.\.\.reclaimChannelInitOptions\(channel\),/);
  assert.doesNotMatch(route, /withTheAgent|earlierPass|AGENT_FIRST_VERSION|second-pass/);
  assert.equal(existsSync("src/second-pass.ts"), false);
  const asked = readFileSync("src/witness-portal.ts", "utf8");
  const body = asked.slice(asked.indexOf("export function ruleAsked("), asked.indexOf("/** An agent-written version"));
  assert.doesNotMatch(body, /session|await|sql/i, "said from the provider alone");
});

test("Reclaim's agent keeps its one place: a university with no rule yet, and a pin its own proof gave", () => {
  // No pin and no version: the agent writes the rule, at the first proof.
  assert.deepEqual(ruleAsked({ providerVersion: "", witness: { pin: null } }), { acceptAiProviders: true });
  // No pin, and a version the operator set to run on: that version, read as a first proof is.
  assert.deepEqual(ruleAsked({ providerVersion: "3.0.1", witness: { pin: null } }), { providerVersion: "3.0.1", acceptAiProviders: true });
  // A pin a first proof gave under the agent: its sessions go on as that proof was made.
  const fromAProof: WitnessPin = { ...PINNED, providerVersion: "1.0.0-ai.2", ahead: undefined, fixed: undefined };
  assert.deepEqual(ruleAsked({ providerVersion: "1.0.0-ai.2", witness: { pin: fromAProof } }), { providerVersion: "1.0.0-ai.2", acceptAiProviders: true });
  // A fixed rule a proof has borne out (the mark "ahead" is off): still the fixed rule, and no agent.
  assert.deepEqual(ruleAsked({ providerVersion: "5.0.0", witness: { pin: { ...PINNED, ahead: undefined } } }), { providerVersion: "5.0.0", acceptAiProviders: false });
  // A provider that is no university's: its own version, and never the agent.
  assert.deepEqual(ruleAsked({ providerVersion: "1.0.0" }), { providerVersion: "1.0.0", acceptAiProviders: false });
});

test("the operator's line when a pinned rule gives no proof: the university, the gift, the state Reclaim ended it in", () => {
  const stop = { portalId: "utoulouse-fr", sense: "enrolment", giftId: GIFT, providerVersion: "5.0.0", state: "SESSION_CANCELLED" };
  const alert = pinnedRuleAlert(stop, "Université de Toulouse");
  assert.equal(alert.subject, "A pinned rule gave no proof: Université de Toulouse (utoulouse-fr), enrolment");
  assert.equal(alert.text, "Université de Toulouse (utoulouse-fr), gift 1000009: a session of the pinned rule (version 5.0.0) ended at Reclaim with no proof, in the state SESSION_CANCELLED.");
  assert.equal(alert.text.split("\n").length, 1, "one line");
  // A university whose name could not be read is said by its id, which is still true.
  assert.equal(pinnedRuleAlert(stop, null).text.startsWith("utoulouse-fr, gift 1000009:"), true);
  // Sent by the route that verifies, through the channel the other alerts take.
  const verify = readFileSync("app/api/proof/verify/route.ts", "utf8");
  assert.match(verify, /pinnedRuleStopped: async \(stop\) => sendPinnedRuleAlert\(stop, \(await loadPortal\(stop\.portalId\)\.catch\(\(\) => null\)\)\?\.university \?\? null\),/);
  assert.match(readFileSync("src/provider-alert.ts", "utf8"), /return sendAlert\(pinnedRuleAlert\(stop, university\), env\);/);
});
