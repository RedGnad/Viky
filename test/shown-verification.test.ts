process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex, type Hex } from "viem";
import type { Proof } from "@reclaimprotocol/js-sdk";
import { VerificationError } from "../src/duolingo-verification";
import type { MilestoneProofMessage } from "../src/milestone-protocol";
import type { ProofSession } from "../src/proof-session-store";
import { SHOWN_CONDITIONS, type ShownEntry } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import { verifyShownSession, type ShownVerificationDeps } from "../src/shown-verification";
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
const REQUEST = "0x881b7539dce87f232902946fa97c9410805b7587bb45d3f8fb5041193f3dee21";

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
    milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: true, settled: false }),
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

test("what the contract would refuse is refused before anything is signed, each with its reason", async () => {
  await refuses("NOT_RECIPIENT", () => verifyShownSession(deps({ milestoneOf: async () => ({ contract: CONTRACT, recipient: "0x000000000000000000000000000000000000b0b0", opened: true, settled: false }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NOT_OPENED", () => verifyShownSession(deps({ milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: false, settled: false }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("ALREADY_SETTLED", () => verifyShownSession(deps({ milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: true, settled: true }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("UNKNOWN_GIFT", () => verifyShownSession(deps({ milestoneOf: async () => null }), { sessionId: SESSION_ID, account: ACCOUNT }));
});

test("the gates the daily path has are the gates this path has", async () => {
  await refuses("UNKNOWN_SESSION", () => verifyShownSession(deps({ loadSession: async () => null }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("UNKNOWN_SESSION", () => verifyShownSession(deps(), { sessionId: SESSION_ID, account: "0x000000000000000000000000000000000000b0b0" }));
  await refuses("UNKNOWN_CONDITION", () => verifyShownSession(deps({ loadSession: async () => session({ conditionId: "nobody-knows" }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("WRONG_PHASE", () => verifyShownSession(deps({ loadSession: async () => session({ phase: "baseline" }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("NO_PROOF_YET", () => verifyShownSession(deps({ fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [] } as never }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("TEE_NOT_VERIFIED", () => verifyShownSession(deps({ verifyProofs: async () => ({ isVerified: true, isTeeAttestationVerified: false, data: [] }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
  await refuses("PROOF_TOO_OLD", () => verifyShownSession(deps({ fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: "provider-test", providerVersionString: "1.0.0", statusV2: "PROOF_SUBMITTED", proofs: [proof(NOW - 700)] } as never }) }), { sessionId: SESSION_ID, account: ACCOUNT }));
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
