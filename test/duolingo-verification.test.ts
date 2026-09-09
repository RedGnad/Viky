// Every refusal of the verify path, exercised without network or database: the Reclaim SDK, the store and
// the signer are injected. Refusal cases 2 and 5 of the spec live here.

process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { recoverTypedDataAddress, type Hex } from "viem";
import type { Proof } from "@reclaimprotocol/js-sdk";
import {
  DUOLINGO_OWNERSHIP_REQUEST_HASH,
  DUOLINGO_XP_REQUEST_HASH,
  type DuolingoEvidence,
} from "../src/duolingo-proof-policy";
import {
  verifyDuolingoSession,
  VerificationError,
  type VerificationDeps,
} from "../src/duolingo-verification";
import { CHECK_IN_TYPES, evidenceSignerAddress, GIFT_DOMAIN, signCheckIn } from "../src/gift-attestation";
import type { ProofSession, StoredAttestation } from "../src/proof-session-store";
import { sdkProof } from "./reclaim-proof-set.test";

const ACCOUNT = "0x000000000000000000000000000000000000a11c";
const ESCROW = "0x00000000000000000000000000000000000000E5" as Hex;
const APP_ID = "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf";
const SESSION_ID = "session_12345678";
const NOW = 1_784_000_100;

function session(overrides: Partial<ProofSession> = {}): ProofSession {
  return {
    sessionId: SESSION_ID,
    account: ACCOUNT,
    giftId: "42",
    goalType: 1,
    phase: "baseline",
    dayIndex: 0,
    duolingoUsername: "ama",
    duolingoProfileId: "123456",
    ...overrides,
  };
}

function proofsFor(message: string, timestampS = NOW - 30): Proof[] {
  const ownership = sdkProof({
    context: JSON.stringify({ contextAddress: ACCOUNT, contextMessage: message, reclaimSessionId: SESSION_ID, providerHash: DUOLINGO_OWNERSHIP_REQUEST_HASH }),
  });
  const xp = sdkProof({
    context: JSON.stringify({ contextAddress: ACCOUNT, contextMessage: message, reclaimSessionId: SESSION_ID, providerHash: DUOLINGO_XP_REQUEST_HASH }),
  });
  for (const proof of [ownership, xp]) {
    (proof.claimData as { timestampS: number }).timestampS = timestampS;
  }
  return [ownership, xp];
}

function trustedData(input: { marker?: string; id?: string; xp?: string; message: string }) {
  const base = { contextAddress: ACCOUNT, contextMessage: input.message, reclaimSessionId: SESSION_ID };
  return [
    { context: { ...base, providerHash: DUOLINGO_OWNERSHIP_REQUEST_HASH }, extractedParameters: { marker: input.marker ?? "disable_social" } },
    { context: { ...base, providerHash: DUOLINGO_XP_REQUEST_HASH }, extractedParameters: { id: input.id ?? "123456", xp: input.xp ?? "1000" } },
  ];
}

type Fixture = {
  deps: VerificationDeps;
  saved: { evidence?: DuolingoEvidence; attestation?: StoredAttestation; proofs?: unknown };
};

function fixture(overrides: {
  session?: ProofSession | null;
  proofs?: Proof[];
  statusV2?: string;
  providerId?: string;
  verification?: Partial<{ isVerified: boolean; isTeeAttestationVerified: boolean; data: unknown }>;
  previous?: DuolingoEvidence | null;
  consumed?: boolean;
  escrowAddress?: Hex | undefined;
  appId?: string;
  data?: unknown;
} = {}): Fixture {
  const current = overrides.session === undefined ? session() : overrides.session;
  const message = current ? (current.phase === "baseline" ? `${current.giftId}:baseline` : `${current.giftId}:${current.dayIndex}`) : "42:baseline";
  const proofs = overrides.proofs ?? proofsFor(message);
  const saved: Fixture["saved"] = {};
  const deps: VerificationDeps = {
    loadSession: async () => current,
    loadLatestEvidence: async () => overrides.previous ?? null,
    consumeAndSaveVerification: async (input) => {
      saved.evidence = input.evidence;
      saved.attestation = input.attestation;
      saved.proofs = input.proofs;
      return overrides.consumed ?? true;
    },
    fetchStatus: async () => ({
      session: {
        sessionId: SESSION_ID,
        appId: APP_ID,
        providerId: overrides.providerId ?? "cdf8cb3b-2976-4413-ab2d-693ae5028380",
        providerVersionString: "1.0.8",
        statusV2: overrides.statusV2 ?? "PROOF_SUBMITTED",
        proofs,
      },
    }),
    verifyProofs: async () => ({
      isVerified: true,
      isTeeAttestationVerified: true,
      data: overrides.data ?? trustedData({ message }),
      ...overrides.verification,
    }),
    signCheckIn: (message) => signCheckIn(message, ESCROW),
    appId: overrides.appId ?? APP_ID,
    escrowAddress: "escrowAddress" in overrides ? overrides.escrowAddress : ESCROW,
    now: () => NOW,
  };
  return { deps, saved };
}

function code(expected: string) {
  return (error: unknown) => error instanceof VerificationError && error.code === expected;
}

test("a baseline passes and the recorded attestation recovers to the evidence signer", async () => {
  const { deps, saved } = fixture();
  const result = await verifyDuolingoSession(deps, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(result.phase, "baseline");
  assert.equal(result.metricValue, 1000);
  assert.equal(result.earnedSincePrevious, null);
  assert.ok(saved.attestation);
  const message = saved.attestation.message;
  const recovered = await recoverTypedDataAddress({
    domain: { ...GIFT_DOMAIN, verifyingContract: ESCROW },
    types: CHECK_IN_TYPES,
    primaryType: "CheckIn",
    message: {
      giftId: BigInt(message.giftId),
      recipient: message.recipient as Hex,
      identityHash: message.identityHash as Hex,
      providerId: message.providerId as Hex,
      metricValue: BigInt(message.metricValue),
      observedAt: BigInt(message.observedAt),
      nullifier: message.nullifier as Hex,
      issuedAt: BigInt(message.issuedAt),
      expiresAt: BigInt(message.expiresAt),
    },
    signature: saved.attestation.signature,
  });
  assert.equal(recovered, evidenceSignerAddress());
  assert.equal(Number(message.expiresAt) - Number(message.issuedAt), 600);
  assert.equal(message.recipient, ACCOUNT);
  assert.ok(Array.isArray(saved.proofs) && saved.proofs.length === 2, "the raw proofs are kept for the live-schema check");
});

test("a check-in passes with the progress since the previous evidence", async () => {
  const checkIn = session({ phase: "check-in", dayIndex: 3 });
  const previous: DuolingoEvidence = {
    profileId: "123456",
    totalXp: 990,
    identityHash: "0x00",
    eventNullifier: "0x01",
    observedAt: NOW - 86_400,
    sessionId: "older",
    phase: "baseline",
    dayIndex: 0,
  };
  const { deps } = fixture({ session: checkIn, previous });
  // The identity hash of the stored evidence must match what the policy computes for this profile.
  const baseline = fixture();
  await verifyDuolingoSession(baseline.deps, { sessionId: SESSION_ID, account: ACCOUNT });
  previous.identityHash = baseline.saved.evidence!.identityHash;
  const result = await verifyDuolingoSession(deps, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(result.phase, "check-in");
  assert.equal(result.dayIndex, 3);
  assert.equal(result.earnedSincePrevious, 10);
});

test("an unknown, expired or foreign session is refused", async () => {
  await assert.rejects(verifyDuolingoSession(fixture({ session: null }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), code("UNKNOWN_SESSION"));
  await assert.rejects(
    verifyDuolingoSession(fixture().deps, { sessionId: SESSION_ID, account: "0x000000000000000000000000000000000000b0b0" }),
    code("UNKNOWN_SESSION"),
  );
  await assert.rejects(verifyDuolingoSession(fixture().deps, { sessionId: "x", account: ACCOUNT }), code("UNKNOWN_SESSION"));
});

test("a session without a TEE attestation is refused (refusal case 2)", async () => {
  const proofs = proofsFor("42:baseline");
  (proofs[1] as { teeAttestation?: unknown }).teeAttestation = undefined;
  await assert.rejects(verifyDuolingoSession(fixture({ proofs }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), (error: unknown) =>
    error instanceof VerificationError && error.code === "PROOF_REJECTED" && /TEE attestation is missing/.test(error.message),
  );
  await assert.rejects(
    verifyDuolingoSession(fixture({ verification: { isTeeAttestationVerified: false } }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    code("TEE_NOT_VERIFIED"),
  );
});

test("the AI submission path and a wrong provider are refused at the session level", async () => {
  await assert.rejects(
    verifyDuolingoSession(fixture({ statusV2: "AI_PROOF_SUBMITTED" }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    (error: unknown) => error instanceof VerificationError && /Unexpected Reclaim submission state/.test(error.message),
  );
  await assert.rejects(
    verifyDuolingoSession(fixture({ providerId: "f3ec8292-d8f3-487c-a79d-f53f482f88e2" }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    (error: unknown) => error instanceof VerificationError && /provider mismatch/.test(error.message),
  );
});

test("a proof older than ten minutes or dated in the future is refused (refusal case 2)", async () => {
  await assert.rejects(
    verifyDuolingoSession(fixture({ proofs: proofsFor("42:baseline", NOW - 601) }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    code("PROOF_TOO_OLD"),
  );
  await assert.rejects(
    verifyDuolingoSession(fixture({ proofs: proofsFor("42:baseline", NOW + 61) }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    code("PROOF_IN_FUTURE"),
  );
});

test("a proof from another Duolingo account than the session's profile is refused (refusal case 5)", async () => {
  await assert.rejects(
    verifyDuolingoSession(fixture({ data: trustedData({ message: "42:baseline", id: "654321" }) }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    code("ACCOUNT_NOT_OWNED"),
  );
});

test("a check-in without a baseline, or on a different identity, is refused", async () => {
  const checkIn = session({ phase: "check-in", dayIndex: 1 });
  await assert.rejects(verifyDuolingoSession(fixture({ session: checkIn, previous: null }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), code("NO_BASELINE"));
  const other: DuolingoEvidence = {
    profileId: "999",
    totalXp: 1,
    identityHash: "0xdead",
    eventNullifier: "0x01",
    observedAt: NOW - 100,
    sessionId: "older",
    phase: "baseline",
    dayIndex: 0,
  };
  await assert.rejects(
    verifyDuolingoSession(fixture({ session: checkIn, previous: other }).deps, { sessionId: SESSION_ID, account: ACCOUNT }),
    code("IDENTITY_CHANGED"),
  );
});

test("a replayed session is refused once consumed", async () => {
  await assert.rejects(verifyDuolingoSession(fixture({ consumed: false }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), code("ALREADY_RECORDED"));
});

test("missing configuration fails closed before any network call", async () => {
  await assert.rejects(verifyDuolingoSession(fixture({ escrowAddress: undefined }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), code("NOT_CONFIGURED"));
  await assert.rejects(verifyDuolingoSession(fixture({ appId: "" }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), code("NOT_CONFIGURED"));
});
