process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex, type Hex } from "viem";
import type { Proof } from "@reclaimprotocol/js-sdk";
import { VerificationError } from "../src/duolingo-verification";
import type { MilestoneProofMessage } from "../src/milestone-protocol";
import { PROOF_SESSION_TTL_SECONDS, type ProofSession } from "../src/proof-session-store";
import { PRIVACY, type ConditionPrivacy } from "../src/condition-privacy";
import { SHOWN_CONDITIONS, type ShownEntry } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import { RECLAIM_STOPPED, SHOWN_MAX_PROOF_AGE_SECONDS, verifyShownSession, type ShownVerificationDeps } from "../src/shown-verification";
import { sdkProof } from "./reclaim-proof-set.test";

/**
 * The milestone half of a shown proof, with every outside dependency injected (D162): the session row, the Reclaim
 * status, the SDK's verdict, the contract's state, the signer and the relay. The daily half keeps its own tests in
 * test/duolingo-verification.test.ts and is only shown here to be routed to.
 */

const ACCOUNT = "0x000000000000000000000000000000000000a11c";
const CONTRACT = "0x00000000000000000000000000000000000000E5" as Hex;
const APP_ID = "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf";
const SESSION_ID = "session_12345678";
const NOW = 1_784_000_100;
const REQUEST = "0xd40b146a6c7210c1ee0213ad3e04c424bea780a4d8315d883595cfa1ce12fd3d";

/** A milestone condition for the tests, registered for their duration: the register grows in PR 2, not here. */
const SHOWN: ShownEntry = {
  kind: "milestone",
  subject: keccak256(stringToHex("viky:subject:test-shown:v1")),
  condition: {
    conditionId: "test-shown",
    providerId: "provider-test",
    providerVersion: "1.0.0",
    requestHashes: [REQUEST],
    proofCount: 1,
    phases: ["reach"],
    attestationProviderId: keccak256(stringToHex("viky:provider:test-shown:v1")),
    read: (fields) => ({ metricValue: BigInt(fields.scoreValue ?? "0"), eventAt: null, accountKey: fields.bookingId ?? null }),
  },
};
(SHOWN_CONDITIONS as ShownEntry[]).push(SHOWN);

function session(overrides: Partial<ProofSession> = {}): ProofSession {
  return { sessionId: SESSION_ID, account: ACCOUNT, giftId: "1000002", goalType: 13, conditionId: "test-shown", phase: "reach", dayIndex: 0, ...overrides };
}

function proof(timestampS = NOW - 30): Proof {
  const one = sdkProof({ context: JSON.stringify({ contextAddress: ACCOUNT, contextMessage: "1000002:reach", reclaimSessionId: SESSION_ID, providerHash: REQUEST }) });
  (one.claimData as { timestampS: number }).timestampS = timestampS;
  return one;
}

function deps(overrides: Partial<ShownVerificationDeps> = {}): ShownVerificationDeps & { proved: MilestoneProofMessage[]; recorded: unknown[] } {
  const proved: MilestoneProofMessage[] = [];
  const recorded: unknown[] = [];
  return {
    proved,
    recorded,
    loadSession: async () => session(),
    loadLatestEvidence: async () => null,
    consumeAndSaveVerification: async () => true,
    consumeShownSession: async () => true,
    fetchStatus: async () => ({
      session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof()] } as never,
    }),
    verifyProofs: async () => ({
      isVerified: true,
      isTeeAttestationVerified: true,
      data: [{ context: { contextAddress: ACCOUNT, contextMessage: "1000002:reach", reclaimSessionId: SESSION_ID, providerHash: REQUEST }, extractedParameters: { scoreValue: "97", bookingId: "555" } }],
    }),
    signCheckIn: async () => "0x" as Hex,
    prove: async ({ message }) => {
      proved.push(message);
      return { hash: `0x${"ab".repeat(32)}` as Hex, happened: "reached" };
    },
    record: async (reading) => {
      recorded.push(reading);
    },
    milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: true, settled: false, target: 90n }),
    milestoneRecordOf: async () => null,
    appId: APP_ID,
    escrowAddress: CONTRACT,
    now: () => NOW,
    ...overrides,
  };
}

async function refuses(code: string, run: () => Promise<unknown>) {
  await assert.rejects(run, (error: unknown) => error instanceof VerificationError && error.code === code, code);
}

test("a proof shown for a milestone becomes the same attestation a certificate reading produces, and is relayed", async () => {
  const d = deps();
  const outcome = await verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(outcome.kind, "reached");
  assert.equal(d.proved.length, 1);
  const message = d.proved[0];
  assert.equal(message.giftId, 1000002n);
  assert.equal(message.recipient, ACCOUNT);
  assert.equal(message.identityHash, SHOWN.subject, "the subject the funder signed, constant per condition");
  assert.equal(message.providerId, SHOWN.condition.attestationProviderId);
  assert.equal(message.metricValue, 97n);
  assert.equal(message.eventAt, BigInt(NOW - 30), "no date on the page: the day it was shown is the event");
  assert.equal(message.observedAt, BigInt(NOW - 30));
  assert.equal(message.issuedAt, BigInt(NOW));
  assert.equal(message.expiresAt, BigInt(NOW + 600));
  assert.equal(d.recorded.length, 1, "the reading is in the gift's history");
});

test("a milestone's proof is fresh for as long as its session lives, and the session's clock is the only one", async () => {
  // A pass on a phone took nine minutes (7 Oct 2026), and the ten that a proof then had left under one to come back.
  assert.equal(SHOWN_MAX_PROOF_AGE_SECONDS, PROOF_SESSION_TTL_SECONDS);
  assert.equal(PROOF_SESSION_TTL_SECONDS, 30 * 60);
  const status = (timestampS: number) => async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof(timestampS)] } as never });
  // Eleven minutes and forty seconds old: refused under the ten minutes, taken now.
  const taken = await verifyShownSession(deps({ fetchStatus: status(NOW - 700) }), { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(taken.kind, "reached");
  assert.equal((await verifyShownSession(deps({ fetchStatus: status(NOW - SHOWN_MAX_PROOF_AGE_SECONDS) }), { sessionId: SESSION_ID, account: ACCOUNT })).kind, "reached");
  await refuses("PROOF_TOO_OLD", () => verifyShownSession(deps({ fetchStatus: status(NOW - SHOWN_MAX_PROOF_AGE_SECONDS - 1) }), { sessionId: SESSION_ID, account: ACCOUNT }));
});

test("a session Reclaim ended with no proof is said as stopped and closed, so no page takes it up again", async () => {
  // Seen once for real (7 Oct 2026, session 53800accd7): signed in, then nothing, then ERROR_SUBMITTED a quarter of an
  // hour later. The page went on waiting, and its link led to a verification Reclaim had closed.
  assert.deepEqual(RECLAIM_STOPPED, ["ERROR_SUBMITTED", "ERROR_SUBMISSION_FAILED", "PROOF_SUBMISSION_FAILED", "SESSION_CANCELLED"]);
  const ended = (statusV2: string) => async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2, proofs: [], error: { type: "ReclaimVerificationAbortedException", message: "Connection lost. The session was disconnected." } } as never });
  for (const state of RECLAIM_STOPPED) {
    const closed: unknown[] = [];
    const d = deps({ fetchStatus: ended(state), consumeShownSession: async (input) => (closed.push(input), true) });
    await assert.rejects(verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT }), (error: unknown) => {
      assert.ok(error instanceof VerificationError);
      assert.equal(error.code, "VERIFICATION_STOPPED");
      assert.equal(error.status, 409);
      assert.equal(error.message, "The verification stopped before it made a proof. Show it again.");
      return true;
    });
    assert.deepEqual(closed, [{ sessionId: SESSION_ID, evidence: { stopped: state }, attestation: { message: {}, signature: "0x" }, proofs: null }]);
    assert.equal(d.proved.length, 0);
    assert.equal(d.recorded.length, 0, "nothing was read, so nothing is written against the gift");
  }
  // A proof that failed to be made can be tried again inside the session (Reclaim's own client gives it thirty
  // seconds), and a session nobody has finished is simply not there yet: neither is closed.
  for (const state of ["PROOF_GENERATION_FAILED", "USER_STARTED_VERIFICATION", "SESSION_INIT", ""]) {
    const closed: unknown[] = [];
    await refuses("NO_PROOF_YET", () => verifyShownSession(deps({ fetchStatus: ended(state), consumeShownSession: async (input) => (closed.push(input), true) }), { sessionId: SESSION_ID, account: ACCOUNT }));
    assert.equal(closed.length, 0, state);
  }
});

test("what the contract would refuse is refused before anything is signed, each with its reason", async () => {
  await refuses("NOT_RECIPIENT", () => verifyShownSession(deps({ milestoneOf: async () => ({ contract: CONTRACT, recipient: "0x000000000000000000000000000000000000b0b0", opened: true, settled: false, target: 90n }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NOT_OPENED", () => verifyShownSession(deps({ milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: false, settled: false, target: 90n }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("ALREADY_SETTLED", () => verifyShownSession(deps({ milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: true, settled: true, target: 90n }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("UNKNOWN_GIFT", () => verifyShownSession(deps({ milestoneOf: async () => null }), { sessionId: SESSION_ID, account: ACCOUNT }));
});

test("the gates the daily path has are the gates this path has", async () => {
  await refuses("UNKNOWN_SESSION", () => verifyShownSession(deps({ loadSession: async () => null }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("UNKNOWN_SESSION", () => verifyShownSession(deps(), { sessionId: SESSION_ID, account: "0x000000000000000000000000000000000000b0b0" }));
  await refuses("UNKNOWN_CONDITION", () => verifyShownSession(deps({ loadSession: async () => session({ conditionId: "nobody-knows" }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("WRONG_PHASE", () => verifyShownSession(deps({ loadSession: async () => session({ phase: "baseline" }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NO_PROOF_YET", () => verifyShownSession(deps({ fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [] } as never }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("TEE_NOT_VERIFIED", () => verifyShownSession(deps({ verifyProofs: async () => ({ isVerified: true, isTeeAttestationVerified: false, data: [] }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("PROOF_TOO_OLD", () => verifyShownSession(deps({ fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof(NOW - SHOWN_MAX_PROOF_AGE_SECONDS - 1)] } as never }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("PROOF_REJECTED", () => verifyShownSession(deps({ fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "another", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof()] } as never }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("ALREADY_RECORDED", () => verifyShownSession(deps({ consumeShownSession: async () => false }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NOT_CONFIGURED", () => verifyShownSession(deps({ appId: "" }), { sessionId: SESSION_ID, account: ACCOUNT }));
});

test("a daily session is routed to the daily path, which keeps its own rules", async () => {
  // The daily path pins the Duolingo provider, so a status from any other provider is refused by its own provenance
  // gate: the first refusal of that path, which is how a test can tell the two paths apart.
  await refuses("PROOF_REJECTED", () => verifyShownSession(deps({ loadSession: async () => session({ conditionId: "duolingo-daily", phase: "baseline", duolingoProfileId: "123456", duolingoUsername: "ama" }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
});

/**
 * A condition whose provider and subject are the gift's own (D165): a university gift reads both off the portal it
 * was made on. Here the portal is a fake row, and what is checked is that the proof must come from that portal's
 * provider, that the subject signed is the portal's, and that a gift naming no portal is refused.
 */
const PORTAL_REQUEST = `0x${"cd".repeat(32)}`;
const OF_THE_PORTAL: ShownEntry = {
  kind: "milestone",
  subjectOf: (record) => (record.portal ? keccak256(stringToHex(`viky:subject:test-portal:${record.portal}`)) : null),
  providerOf: async (record) =>
    record.portal === "ucad-sn"
      ? {
          providerId: "provider-ucad",
          providerVersion: "2.0.0",
          requestHashes: [PORTAL_REQUEST],
          read: (fields) => {
            if (!/^(Inscrit|Enrolled)/i.test(fields.status ?? "")) throw new ShownProofError("NOT_ENROLLED", "not enrolled");
            return { metricValue: 1n, eventAt: null, accountKey: null };
          },
        }
      : null,
  condition: { conditionId: "test-portal", providerId: "", providerVersion: "", requestHashes: [], proofCount: 1, phases: ["reach"], attestationProviderId: keccak256(stringToHex("viky:provider:test-portal:v1")), read: () => { throw new ShownProofError("NO_PORTAL", "no portal"); } },
};
(SHOWN_CONDITIONS as ShownEntry[]).push(OF_THE_PORTAL);

function portalDeps(portal: string | null, status = "Inscrit") {
  return deps({
    loadSession: async () => session({ conditionId: "test-portal", giftId: "1000009" }),
    milestoneRecordOf: async () => ({ giftId: "1000009", conditionId: "test-portal", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal }),
    fetchStatus: async () => ({
      session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-ucad", providerVersionString: "2.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof()] } as never,
    }),
    verifyProofs: async () => ({
      isVerified: true,
      isTeeAttestationVerified: true,
      data: [{ context: { contextAddress: ACCOUNT, contextMessage: "1000009:reach", reclaimSessionId: SESSION_ID, providerHash: PORTAL_REQUEST }, extractedParameters: { status } }],
    }),
  });
}

test("a university gift's proof must come from the portal it was made on, and the subject signed is the portal's", async () => {
  const d = portalDeps("ucad-sn");
  const outcome = await verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(outcome.kind, "reached");
  assert.equal(d.proved[0].identityHash, keccak256(stringToHex("viky:subject:test-portal:ucad-sn")));
  assert.equal(d.proved[0].metricValue, 1n);
  assert.equal(d.proved[0].providerId, OF_THE_PORTAL.condition.attestationProviderId, "one goal for every portal: the attestation carries the family's provider id");
});

test("a page that does not say enrolled, a gift naming no portal, and a proof from another provider are refused", async () => {
  await refuses("NOT_ENROLLED", () => verifyShownSession(portalDeps("ucad-sn", "Radié"), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NO_PORTAL", () => verifyShownSession(portalDeps(null), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NO_PORTAL", () => verifyShownSession(portalDeps("nobody-knows"), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("PROOF_REJECTED", () => verifyShownSession(deps({ ...portalDeps("ucad-sn"), fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof()] } as never }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
});

/**
 * What was shown comes back in the words the reading carries (D174): "14.50 / 20" for a grade, "Passed" for the
 * year, and the number itself where the number is the scale. And a gift on a portal proved for enrolment alone is
 * refused by the name of what is missing, before any proof is fetched.
 */
const WORDED: ShownEntry = {
  ...SHOWN,
  condition: { ...SHOWN.condition, conditionId: "test-worded", read: () => ({ metricValue: 1450n, eventAt: null, accountKey: null, inWords: "14.50 / 20" }) },
};
const NO_RESULTS: ShownEntry = {
  kind: "milestone",
  subjectOf: () => keccak256(stringToHex("viky:subject:test-no-results:v1:ucad-sn")),
  providerOf: async () => ({
    providerId: "",
    providerVersion: "",
    requestHashes: [],
    missing: { code: "NO_RESULTS_PAGE", message: "no results page" },
    read: () => {
      throw new ShownProofError("NO_RESULTS_PAGE", "no results page");
    },
  }),
  condition: { ...SHOWN.condition, conditionId: "test-no-results" },
};
(SHOWN_CONDITIONS as ShownEntry[]).push(WORDED, NO_RESULTS);

test("what was shown comes back in words when the reading carries them, and as the number otherwise", async () => {
  const plain = await verifyShownSession(deps(), { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(plain.kind === "reached" && plain.shown, "97", "the number is the scale, so the number is the words");
  const d = deps({ loadSession: async () => session({ conditionId: "test-worded" }) });
  const worded = await verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(worded.kind === "reached" && worded.shown, "14.50 / 20");
  assert.equal(worded.kind === "reached" && worded.metricValue, "1450", "and the contract compared the hundredths");
  assert.equal(d.proved[0].metricValue, 1450n);
});

test("a portal proved for enrolment and not for its results page is refused by its own name, before any proof is fetched", async () => {
  let fetched = false;
  const d = deps({
    loadSession: async () => session({ conditionId: "test-no-results", giftId: "1000009" }),
    milestoneRecordOf: async () => ({ giftId: "1000009", conditionId: "test-no-results", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal: "ucad-sn" }),
    fetchStatus: async () => {
      fetched = true;
      return { session: undefined } as never;
    },
  });
  await refuses("NO_RESULTS_PAGE", () => verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT }));
  assert.equal(fetched, false);
  assert.equal(d.proved.length, 0);
});

/**
 * A number that is the person's own (D185, the founder's rule of 23 Sep 2026): the exams, the Study rail, School,
 * a course. Seen once by the person who showed it, kept nowhere, the verdict alone attested and stored. Beside it,
 * a number a source publishes is kept as read, and the session row is written in JSON, which has no bigint.
 */
const PRIVATE: ShownEntry = {
  ...SHOWN,
  condition: { ...SHOWN.condition, conditionId: "test-private", read: (fields) => ({ metricValue: BigInt(fields.scoreValue ?? "0"), eventAt: null, accountKey: fields.bookingId ?? null, inWords: `${fields.scoreValue} / 120` }) },
};
(SHOWN_CONDITIONS as ShownEntry[]).push(PRIVATE);
(PRIVACY as Record<string, ConditionPrivacy>)["test-private"] = { kept: "verdict", read: "a test score" };

function consuming() {
  const consumed: unknown[] = [];
  const consumeShownSession: ShownVerificationDeps["consumeShownSession"] = async (input) => {
    // The route's store stringifies what it is given: so does this, and a bigint would throw here as it did there.
    consumed.push(JSON.parse(JSON.stringify(input)));
    return true;
  };
  return { consumed, consumeShownSession };
}

test("a number that is the person's own is seen once by them and kept nowhere: the verdict is attested, the rows keep no number", async () => {
  const { consumed, consumeShownSession } = consuming();
  const d = deps({ loadSession: async () => session({ conditionId: "test-private" }), consumeShownSession });
  const outcome = await verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(outcome.kind === "reached" && outcome.shown, "97 / 120", "the person who showed it reads the number, once");
  assert.equal(d.proved[0].metricValue, 90n, "the contract receives the target as the value: the verdict, never the number");
  assert.equal(outcome.kind === "reached" && outcome.metricValue, "90");
  const row = d.recorded[0] as { rating: number | null; playerId: string | null; proofs?: unknown; outcome: string; attested: boolean };
  assert.equal(row.rating, null);
  assert.equal(row.playerId, null);
  assert.equal(row.proofs, undefined);
  assert.equal(row.outcome, "reached");
  assert.equal(row.attested, true, "and the judges' count still counts it");
  const kept = consumed[0] as { evidence: Record<string, unknown> & { reading: unknown }; attestation: { message: { metricValue: string } }; proofs: unknown };
  assert.deepEqual(kept.evidence.reading, { verdict: "reached" }, "nothing of the number, nor the account key, in the session row");
  assert.deepEqual(Object.keys(kept.evidence).sort(), ["conditionId", "dayIndex", "nullifier", "observedAt", "phase", "reading", "sessionId"], "and no other field carries it");
  assert.equal(kept.attestation.message.metricValue, "90", "the attestation kept is the verdict too");
  assert.equal(kept.proofs, null);
});

test("under the target, nothing is relayed and nothing is recorded: the person is told, with the number", async () => {
  const d = deps({ loadSession: async () => session({ conditionId: "test-private" }), milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: true, settled: false, target: 100n }) });
  await assert.rejects(
    () => verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT }),
    (error: unknown) => error instanceof VerificationError && error.code === "NOT_THERE_YET" && error.status === 409 && error.message.includes("Shown: 97 / 120") && error.message.includes("nothing is lost"),
  );
  assert.equal(d.proved.length, 0, "nothing signed");
  assert.equal(d.recorded.length, 0, "nothing written");
});

test("a number a source publishes is kept as read, and the session row is written in JSON", async () => {
  const { consumed, consumeShownSession } = consuming();
  const d = deps({ consumeShownSession });
  const outcome = await verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(outcome.kind === "reached" && outcome.metricValue, "97");
  assert.equal(d.proved[0].metricValue, 97n);
  const row = d.recorded[0] as { rating: number | null; playerId: string | null; proofs?: unknown };
  assert.equal(row.rating, 97);
  assert.equal(row.playerId, "555");
  assert.ok(Array.isArray(row.proofs) && row.proofs.length === 1, "the proofs stay with the reading");
  const kept = consumed[0] as { evidence: { reading: { metricValue: string; accountKey: string } }; proofs: unknown[] };
  assert.equal(kept.evidence.reading.metricValue, "97", "a string: the row is JSON");
  assert.equal(kept.evidence.reading.accountKey, "555");
  assert.equal(kept.proofs.length, 1);
});

/** A page that does not carry what the pattern names (D193): refused by its name, told with nothing lost, journaled. */
const MISSING: ShownEntry = {
  ...SHOWN,
  condition: { ...SHOWN.condition, conditionId: "test-missing", read: () => { throw new ShownProofError("NO_GRADE", "The results page shown carries no grade on the university's scale."); } },
};
(SHOWN_CONDITIONS as ShownEntry[]).push(MISSING);

test("a page without the field is refused by its name, the person is told nothing is lost, and the journal carries the event", async () => {
  const d = deps({ loadSession: async () => session({ conditionId: "test-missing" }) });
  await assert.rejects(
    () => verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT }),
    (error: unknown) => error instanceof VerificationError && error.code === "NO_GRADE" && error.message.startsWith("The results page shown carries no grade") && error.message.endsWith("and only then does the money go back."),
  );
  assert.equal(d.proved.length, 0, "nothing signed");
  assert.equal(d.recorded.length, 1, "one event in the journal");
  const row = d.recorded[0] as { outcome: string; attested: boolean; rating: number | null; nullifier: unknown; txHash: unknown; proofs?: unknown };
  assert.equal(row.outcome, "refused:NO_GRADE");
  assert.equal(row.attested, false);
  assert.equal(row.rating, null);
  assert.equal(row.nullifier, null);
  assert.equal(row.txHash, null);
  assert.equal(row.proofs, undefined, "no proof, no number: the event by its name alone");
});

test("a proof shown without the recipient's yes, or after their stop, is refused before it is fetched", async () => {
  let fetched = false;
  const d = deps({
    leave: async () => ({ allowed: false, reason: "stopped" }),
    fetchStatus: async () => {
      fetched = true;
      throw new Error("not reached");
    },
  });
  await refuses("NO_AGREEMENT", () => verifyShownSession(d, { sessionId: SESSION_ID, account: ACCOUNT }));
  assert.equal(fetched, false);
  assert.deepEqual(d.proved, []);
  const agreed = deps({ leave: async () => ({ allowed: true, beforeAgreements: false }) });
  assert.equal((await verifyShownSession(agreed, { sessionId: SESSION_ID, account: ACCOUNT })).kind, "reached");
});
