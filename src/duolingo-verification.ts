import type { Hex } from "viem";
import type { Proof } from "@reclaimprotocol/js-sdk";
import {
  DUOLINGO_PROVIDER_ID,
  DUOLINGO_PROVIDER_VERSION,
  DuolingoPolicyError,
  validateDuolingoEvidence,
  validateDuolingoProgress,
  type DuolingoEvidence,
} from "./duolingo-proof-policy";
import {
  ATTESTATION_TTL_SECONDS,
  DUOLINGO_SESSION_PROVIDER_ID,
  identityPseudonym,
  serialiseMessage,
  type CheckInMessage,
} from "./gift-attestation";
import type { ProofSession, StoredAttestation } from "./proof-session-store";
import { assertReclaimSessionProvenance, assertSdkProofSet, ReclaimProofRejectedError, type ReclaimSessionSummary } from "./reclaim-proof-set";
import type { ReclaimTrustedData } from "./reclaim-types";

/**
 * The verification of one Duolingo session, with every outside dependency injected so each refusal is a
 * unit test rather than a network call. The route wires the real Reclaim SDK, the Neon store and the
 * evidence signer. Everything the recipient could otherwise lie about comes from the SERVER's session
 * row, never from the request: which account, which gift, which phase, which day, which profile.
 */

export const MAX_PROOF_AGE_SECONDS = 10 * 60;
export const MAX_PROOF_FUTURE_SKEW_SECONDS = 60;
export const DUOLINGO_PROOF_COUNT = 2;
export const DUOLINGO_MAX_SIGNED_JSON_BYTES_ROUTE = 20_000;

export type VerificationErrorCode =
  | "UNKNOWN_SESSION"
  | "NO_PROOF_YET"
  | "PROOF_REJECTED"
  | "TEE_NOT_VERIFIED"
  | "PROOF_TOO_OLD"
  | "PROOF_IN_FUTURE"
  | "NO_BASELINE"
  | "ALREADY_RECORDED"
  | "NOT_CONFIGURED"
  | string;

/** Every refusal is typed and carries the reason: "no" without a reason is what makes people distrust a proof system. */
export class VerificationError extends Error {
  constructor(
    readonly code: VerificationErrorCode,
    message: string,
    readonly status: 400 | 409 | 503 = 400,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

export type ReclaimStatus = Readonly<{ session?: ReclaimSessionSummary }>;

export type SdkVerification = Readonly<{
  isVerified: boolean;
  isTeeAttestationVerified?: boolean;
  data?: unknown;
}>;

export type VerificationDeps = {
  loadSession(sessionId: string): Promise<ProofSession | null>;
  loadLatestEvidence(giftId: string, account: string): Promise<DuolingoEvidence | null>;
  consumeAndSaveVerification(input: {
    sessionId: string;
    evidence: DuolingoEvidence;
    attestation: StoredAttestation;
    proofs: unknown;
  }): Promise<boolean>;
  fetchStatus(sessionId: string): Promise<ReclaimStatus>;
  verifyProofs(proofs: Proof[]): Promise<SdkVerification>;
  signCheckIn(message: CheckInMessage): Promise<Hex>;
  appId: string;
  escrowAddress: Hex | undefined;
  now(): number;
};

export type VerificationResult = Readonly<{
  sessionId: string;
  giftId: string;
  phase: ProofSession["phase"];
  dayIndex: number;
  metricValue: number;
  observedAt: number;
  earnedSincePrevious: number | null;
}>;

function assertFresh(timestamps: readonly number[], now: number): void {
  for (const value of timestamps) {
    if (value > now + MAX_PROOF_FUTURE_SKEW_SECONDS) {
      throw new VerificationError("PROOF_IN_FUTURE", "The proof is dated in the future");
    }
    if (now - value > MAX_PROOF_AGE_SECONDS) {
      throw new VerificationError("PROOF_TOO_OLD", "The proof is older than ten minutes. Check in again.");
    }
  }
}

export async function verifyDuolingoSession(deps: VerificationDeps, input: { sessionId: string; account: string }): Promise<VerificationResult> {
  const { sessionId } = input;
  if (!/^[a-zA-Z0-9_-]{6,200}$/.test(sessionId)) throw new VerificationError("UNKNOWN_SESSION", "Invalid Reclaim session");
  if (!deps.escrowAddress) throw new VerificationError("NOT_CONFIGURED", "The gift contract is not configured", 503);
  if (!deps.appId) throw new VerificationError("NOT_CONFIGURED", "The Reclaim application is not configured", 503);

  const session = await deps.loadSession(sessionId);
  if (!session) throw new VerificationError("UNKNOWN_SESSION", "Unknown or expired Reclaim session");
  if (session.account.toLowerCase() !== input.account.toLowerCase()) {
    throw new VerificationError("UNKNOWN_SESSION", "Unknown or expired Reclaim session");
  }

  const status = await deps.fetchStatus(sessionId);
  const rawProofs = status.session?.proofs;
  const candidates = Array.isArray(rawProofs) ? rawProofs : rawProofs ? [rawProofs] : [];
  if (candidates.length === 0) throw new VerificationError("NO_PROOF_YET", "Reclaim has not returned a proof yet");

  let proofs: Proof[];
  try {
    // Provenance first (pinned provider and version, our app, PROOF_SUBMITTED and never AI_PROOF_SUBMITTED),
    // then shape: a proof with no teeAttestation object is the AI fallback, and it stops here.
    assertReclaimSessionProvenance({
      session: status.session,
      expected: { sessionId, appId: deps.appId, providerId: DUOLINGO_PROVIDER_ID, providerVersion: DUOLINGO_PROVIDER_VERSION },
    });
    proofs = assertSdkProofSet(candidates, { expectedCount: DUOLINGO_PROOF_COUNT, maxSignedJsonBytes: DUOLINGO_MAX_SIGNED_JSON_BYTES_ROUTE });
  } catch (error) {
    if (error instanceof ReclaimProofRejectedError) throw new VerificationError("PROOF_REJECTED", error.message);
    throw error;
  }

  const verified = await deps.verifyProofs(proofs);
  if (!verified.isVerified || !verified.isTeeAttestationVerified) {
    throw new VerificationError("TEE_NOT_VERIFIED", "The proof failed SDK or TEE verification");
  }

  const timestamps = proofs.map((proof) => Number(proof.claimData.timestampS));
  const now = deps.now();
  assertFresh(timestamps, now);

  // A session opened for a milestone is not a daily session, and a daily session without the profile the baseline
  // bound is not one either (D162): both are refused here rather than read as something they are not.
  if (session.phase === "reach") throw new VerificationError("WRONG_PHASE", "This session is not a daily check-in");
  if (!session.duolingoProfileId) throw new VerificationError("UNKNOWN_SESSION", "This session names no Duolingo profile");
  let evidence: DuolingoEvidence;
  try {
    evidence = validateDuolingoEvidence({
      data: verified.data as ReclaimTrustedData[],
      timestamps,
      providerId: DUOLINGO_PROVIDER_ID,
      policy: {
        account: session.account,
        giftId: session.giftId,
        phase: session.phase,
        dayIndex: session.dayIndex,
        expectedSessionId: sessionId,
        expectedProfileId: session.duolingoProfileId,
      },
    });
  } catch (error) {
    if (error instanceof DuolingoPolicyError) throw new VerificationError(error.code, error.message);
    throw error;
  }

  let earnedSincePrevious: number | null = null;
  if (session.phase === "check-in") {
    const previous = await deps.loadLatestEvidence(session.giftId, session.account);
    if (!previous) throw new VerificationError("NO_BASELINE", "Connect your Duolingo account before checking in");
    try {
      earnedSincePrevious = validateDuolingoProgress({ previous, current: evidence, maxCurrentAgeSeconds: MAX_PROOF_AGE_SECONDS, now }).earnedXp;
    } catch (error) {
      if (error instanceof DuolingoPolicyError) throw new VerificationError(error.code, error.message);
      throw error;
    }
  }

  const message: CheckInMessage = {
    giftId: BigInt(session.giftId),
    recipient: session.account as Hex,
    identityHash: identityPseudonym("duolingo", evidence.profileId),
    providerId: DUOLINGO_SESSION_PROVIDER_ID,
    metricValue: BigInt(evidence.totalXp),
    observedAt: BigInt(evidence.observedAt),
    nullifier: evidence.eventNullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  const signature = await deps.signCheckIn(message);

  // Validation passed; commit the result, the attestation and the raw proofs, and consume the session
  // together. A replay finds the session already consumed and is refused.
  const recorded = await deps.consumeAndSaveVerification({
    sessionId,
    evidence,
    attestation: { message: serialiseMessage(message), signature },
    proofs,
  });
  if (!recorded) throw new VerificationError("ALREADY_RECORDED", "This proof has already been recorded", 409);

  return {
    sessionId,
    giftId: session.giftId,
    phase: session.phase,
    dayIndex: session.dayIndex,
    metricValue: evidence.totalXp,
    observedAt: evidence.observedAt,
    earnedSincePrevious,
  };
}
