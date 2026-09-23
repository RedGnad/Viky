import type { Hex } from "viem";
import type { Proof } from "@reclaimprotocol/js-sdk";
import { MAX_PROOF_AGE_SECONDS, MAX_PROOF_FUTURE_SKEW_SECONDS, VerificationError, verifyDuolingoSession, type ReclaimStatus, type SdkVerification, type VerificationDeps } from "./duolingo-verification";
import type { MilestoneReading } from "./milestone-store";
import type { MilestoneProofMessage } from "./milestone-protocol";
import type { ProvedReading } from "./milestone-relay";
import type { ProofSession, StoredAttestation } from "./proof-session-store";
import { assertReclaimSessionProvenance, assertSdkProofSet, ReclaimProofRejectedError } from "./reclaim-proof-set";
import type { ReclaimTrustedData } from "./reclaim-types";
import { shownConditionById, type ShownEntry, type ShownProvider } from "./shown-conditions";
import type { MilestoneRecord } from "./milestone-store";
import { ShownProofError, validateShownEvidence, type ShownEvidence } from "./shown-proof";
import { ATTESTATION_TTL_SECONDS } from "./gift-terms";

/**
 * The verification of one shown-proof session, whichever condition it was opened for (D162).
 *
 * A daily session is verified exactly as it always was: that path knows the Duolingo profile a baseline bound and
 * the XP since the previous proof, and nothing here changes it. A milestone session is the new path: one proof,
 * read by the condition's own `read`, turned into the same `Proof` attestation a certificate reading produces and
 * relayed to the milestone contract, which checks it again. Every outside dependency is injected, so each refusal is
 * a unit test rather than a network call, and the browser only ever says "session X finished".
 */

export const SHOWN_MAX_SIGNED_JSON_BYTES = 20_000;

export type ShownVerificationDeps = VerificationDeps & {
  /** Signs the proof attestation with the evidence signer and sends it to the milestone contract. */
  prove(input: { contract: Hex; message: MilestoneProofMessage }): Promise<ProvedReading>;
  /** Writes the reading to the gift's history, before and after the contract answers. */
  record(reading: MilestoneReading): Promise<void>;
  /** The milestone gift's recipient and contract, read from the contract itself, or nothing when it is not a milestone. */
  milestoneOf(giftId: string): Promise<{ contract: Hex; recipient: Hex; opened: boolean; settled: boolean } | null>;
  /** Records the milestone proof against the session so a replay is refused; the daily path has its own. */
  consumeShownSession(input: { sessionId: string; evidence: ShownEvidence; attestation: StoredAttestation; proofs: unknown }): Promise<boolean>;
  /** The milestone gift's own record (its condition, its portal), or nothing when it has none. */
  milestoneRecordOf(giftId: string): Promise<MilestoneRecord | null>;
};

export type ShownOutcome =
  | Readonly<{ kind: "daily"; sessionId: string; giftId: string; phase: "baseline" | "check-in"; dayIndex: number; metricValue: number; observedAt: number; earnedSincePrevious: number | null }>
  | Readonly<{
      kind: "reached";
      sessionId: string;
      giftId: string;
      metricValue: string;
      /** What was shown, in the words the person reads back: "14.00 / 20", "Passed", or the number itself (D174). */
      shown: string;
      observedAt: number;
      hash: Hex;
    }>;

function assertFresh(timestamps: readonly number[], now: number): void {
  for (const at of timestamps) {
    if (at > now + MAX_PROOF_FUTURE_SKEW_SECONDS) throw new VerificationError("PROOF_IN_FUTURE", "The proof is dated in the future");
    if (now - at > MAX_PROOF_AGE_SECONDS) throw new VerificationError("PROOF_TOO_OLD", "The proof is older than ten minutes. Show it again.");
  }
}

function serialise(message: MilestoneProofMessage): Record<string, string | number> {
  return Object.fromEntries(Object.entries(message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])) as Record<string, string | number>;
}

export async function verifyShownSession(deps: ShownVerificationDeps, input: { sessionId: string; account: string }): Promise<ShownOutcome> {
  const { sessionId } = input;
  if (!/^[a-zA-Z0-9_-]{6,200}$/.test(sessionId)) throw new VerificationError("UNKNOWN_SESSION", "Invalid Reclaim session");
  const session = await deps.loadSession(sessionId);
  if (!session || session.account.toLowerCase() !== input.account.toLowerCase()) throw new VerificationError("UNKNOWN_SESSION", "Unknown or expired Reclaim session");
  const entry = shownConditionById(session.conditionId);
  if (!entry) throw new VerificationError("UNKNOWN_CONDITION", "This session is for a condition Viky does not know");

  if (entry.kind === "daily") {
    const result = await verifyDuolingoSession(deps, input);
    // The daily path refuses a "reach" session before it reads anything, so what comes back is one of its two phases.
    return { kind: "daily", ...result, phase: result.phase as "baseline" | "check-in" };
  }
  return verifyMilestoneShown(deps, entry, session);
}

async function verifyMilestoneShown(deps: ShownVerificationDeps, entry: ShownEntry, session: ProofSession): Promise<ShownOutcome> {
  if (!deps.appId) throw new VerificationError("NOT_CONFIGURED", "The Reclaim application is not configured", 503);
  if (session.phase !== "reach") throw new VerificationError("WRONG_PHASE", "A milestone takes one proof that reaches it");
  // What this gift's proof must come from, and what the funder signed it against: the condition's own, or the gift's
  // (a university gift reads both off the portal it was made on, D165).
  const record = await deps.milestoneRecordOf(session.giftId);
  const provider: ShownProvider = (entry.providerOf && record ? await entry.providerOf(record) : null) ?? {
    providerId: entry.condition.providerId,
    providerVersion: entry.condition.providerVersion,
    requestHashes: entry.condition.requestHashes,
    read: entry.condition.read,
    // A provider of ours not registered yet (D176): the condition's own row is empty, and it says so.
    ...(entry.notRegistered ? { missing: { code: "NOT_CONFIGURED", message: entry.notRegistered } } : {}),
  };
  // A gift naming no portal, a portal proved for enrolment and not for its results page (D174), or a provider not
  // registered yet (D176): each by its name.
  if (!provider.providerId) throw new VerificationError(provider.missing?.code ?? "NO_PORTAL", provider.missing?.message ?? "This gift names no portal a proof could come from");
  const subject = (entry.subjectOf && record ? entry.subjectOf(record) : null) ?? entry.subject;
  if (!subject) throw new VerificationError("NOT_CONFIGURED", "This condition has no subject to sign", 503);

  const status: ReclaimStatus = await deps.fetchStatus(session.sessionId);
  const rawProofs = status.session?.proofs;
  const candidates = Array.isArray(rawProofs) ? rawProofs : rawProofs ? [rawProofs] : [];
  if (candidates.length === 0) throw new VerificationError("NO_PROOF_YET", "Reclaim has not returned a proof yet");

  let proofs: Proof[];
  try {
    // Provenance first (pinned provider and version, our app, PROOF_SUBMITTED and never AI_PROOF_SUBMITTED), then
    // shape: a proof with no teeAttestation object is the AI fallback, and it stops here.
    assertReclaimSessionProvenance({
      session: status.session,
      expected: { sessionId: session.sessionId, appId: deps.appId, providerId: provider.providerId, providerVersion: provider.providerVersion },
    });
    proofs = assertSdkProofSet(candidates, { expectedCount: entry.condition.proofCount, maxSignedJsonBytes: SHOWN_MAX_SIGNED_JSON_BYTES });
  } catch (error) {
    if (error instanceof ReclaimProofRejectedError) throw new VerificationError("PROOF_REJECTED", error.message);
    throw error;
  }

  const verified: SdkVerification = await deps.verifyProofs(proofs);
  if (!verified.isVerified || !verified.isTeeAttestationVerified) throw new VerificationError("TEE_NOT_VERIFIED", "The proof failed SDK or TEE verification");

  const timestamps = proofs.map((proof) => Number(proof.claimData.timestampS));
  const now = deps.now();
  assertFresh(timestamps, now);

  let evidence: ShownEvidence;
  try {
    evidence = validateShownEvidence({
      condition: { ...entry.condition, providerId: provider.providerId, providerVersion: provider.providerVersion, requestHashes: provider.requestHashes, read: provider.read },
      data: verified.data as ReclaimTrustedData[],
      timestamps,
      policy: { account: session.account, giftId: session.giftId, phase: "reach", expectedSessionId: session.sessionId },
    });
  } catch (error) {
    if (error instanceof ShownProofError) throw new VerificationError(error.code, error.message);
    throw error;
  }

  const gift = await deps.milestoneOf(session.giftId);
  if (!gift) throw new VerificationError("UNKNOWN_GIFT", "This gift is not one a proof can be shown for");
  if (!gift.opened) throw new VerificationError("NOT_OPENED", "Open the gift before showing a proof");
  if (gift.settled) throw new VerificationError("ALREADY_SETTLED", "This gift is already settled", 409);
  if (gift.recipient.toLowerCase() !== session.account.toLowerCase()) throw new VerificationError("NOT_RECIPIENT", "Only the person the gift is for can show a proof");

  const message: MilestoneProofMessage = {
    giftId: BigInt(session.giftId),
    recipient: gift.recipient,
    // The subject the funder signed: constant per condition, or the gift's portal (D162, D165); never a name.
    identityHash: subject,
    providerId: entry.condition.attestationProviderId,
    metricValue: evidence.reading.metricValue,
    // A possession, like a certificate whose page gives no date: the day it was shown is the event the contract
    // dates, and the condition's words say so. When a provider gives the day itself, it is that day instead.
    eventAt: BigInt(evidence.reading.eventAt ?? evidence.observedAt),
    observedAt: BigInt(evidence.observedAt),
    nullifier: evidence.nullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  const proved = await deps.prove({ contract: gift.contract, message });
  await deps.record({
    giftId: session.giftId,
    purpose: "reach",
    attested: true,
    username: "",
    playerId: evidence.reading.accountKey,
    rating: Number(evidence.reading.metricValue),
    ratedAt: Number(message.eventAt),
    observedAt: evidence.observedAt,
    nullifier: evidence.nullifier,
    outcome: proved.happened === "reached" ? "reached" : "notYet",
    txHash: proved.hash,
    proofs,
  });
  const recorded = await deps.consumeShownSession({ sessionId: session.sessionId, evidence, attestation: { message: serialise(message), signature: "0x" }, proofs });
  if (!recorded) throw new VerificationError("ALREADY_RECORDED", "This proof has already been recorded", 409);
  return {
    kind: "reached",
    sessionId: session.sessionId,
    giftId: session.giftId,
    metricValue: evidence.reading.metricValue.toString(),
    shown: evidence.reading.inWords ?? evidence.reading.metricValue.toString(),
    observedAt: evidence.observedAt,
    hash: proved.hash,
  };
}
