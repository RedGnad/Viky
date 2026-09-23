import { getAddress, isAddress, keccak256, stringToHex, type Hex } from "viem";
import { DUOLINGO_MAX_DAY_INDEX } from "./duolingo-proof-policy";
import type { ReclaimTrustedData } from "./reclaim-types";

/**
 * A proof the person shows from their own account (D162, the second nature of a condition).
 *
 * The connected flow ported from Lock-In knew one source, Duolingo, by name: its provider, its two request hashes,
 * its fields, its phases. Nothing on a screen ever called it. This is the same flow with the source taken out of
 * it: what a session is sealed with, what a proof must carry to be about this gift and this person, and what is
 * read from it, described once per condition here and checked the same way for every one.
 *
 * What stays exactly as it was, because it is what makes a proof worth anything:
 * - the context is SIGNED by the attestor and sealed by the server: the account as `contextAddress`, and
 *   `<giftId>:<phase>` as `contextMessage`, so a proof cannot be moved between accounts, gifts or phases;
 * - the Reclaim session id is in the context too, so a proof cannot be moved between sessions;
 * - the provider and its version are pinned, and every request the provider makes is pinned by its hash;
 * - a proof without a TEE attestation is the AI fallback, and it is refused before this is ever read.
 */

/** One phase of a gift: the baseline that binds the account, a day's check-in, or the one proof a milestone takes. */
export type ShownPhase = "baseline" | "check-in" | "reach";

/** What a condition says about the proof it takes, and nothing about any screen. */
export type ShownCondition = Readonly<{
  /** The register's own id (src/conditions.ts). */
  conditionId: string;
  /** The Reclaim provider, pinned by id and version: a new version is a new decision. */
  providerId: string;
  providerVersion: string;
  /** The hash of every request the provider makes, so a proof read with other requests is refused. */
  requestHashes: readonly string[];
  /** How many proofs one session returns: one per request. */
  proofCount: number;
  /** The phases this condition goes through: a milestone takes one proof, a daily gift a baseline and check-ins. */
  phases: readonly ShownPhase[];
  /**
   * The provider's own id every attestation for this condition carries, `viky:provider:<x>-shown:v1`, so a proof
   * shown for one condition can never settle a gift made on another. Registered on the contract as the goal's.
   */
  attestationProviderId: Hex;
  /**
   * What the extracted fields say, in the condition's own terms: the number the contract compares, and the event
   * the page itself dates, when it dates one. Refuses with a code when the fields are not what the provider promised.
   */
  read: (fields: Readonly<Record<string, string>>) => ShownReading;
}>;

export type ShownReading = Readonly<{
  metricValue: bigint;
  /** The day the source itself says the thing happened, in seconds, or nothing when the page does not say. */
  eventAt: number | null;
  /** What identifies the account the proof was shown from, when the provider extracts something that does. */
  accountKey: string | null;
  /**
   * What was shown, in the words the person reads back ("14.00 / 20", "Passed"): the number alone when the
   * condition's own scale is the number, as a TOEFL score is (D174).
   */
  inWords?: string;
}>;

export class ShownProofError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ShownProofError";
  }
}

export function refuseShown(code: string, message: string): never {
  throw new ShownProofError(code, message);
}

/** What a session is sealed with: the gift and the phase, and for a check-in the day, exactly as before. */
export function shownContextMessage(giftId: string, phase: ShownPhase, dayIndex = 0): string {
  if (!/^\d{1,78}$/.test(giftId)) refuseShown("INVALID_POLICY", "The gift is invalid");
  if (phase === "check-in") {
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > DUOLINGO_MAX_DAY_INDEX) refuseShown("INVALID_POLICY", "A check-in needs a day index between 0 and 366");
    return `${giftId}:${dayIndex}`;
  }
  return `${giftId}:${phase}`;
}

export type ShownPolicy = Readonly<{
  account: string;
  giftId: string;
  phase: ShownPhase;
  dayIndex?: number;
  expectedSessionId: string;
}>;

export type ShownEvidence = Readonly<{
  conditionId: string;
  reading: ShownReading;
  /** The attestor's own time of the read: the earliest of the proofs, which is when the page was seen. */
  observedAt: number;
  /** One proof, one use: the gift, the phase and the session, hashed. */
  nullifier: Hex;
  sessionId: string;
  phase: ShownPhase;
  dayIndex: number;
}>;

function contextString(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  return typeof value === "string" ? value : "";
}

/**
 * Whether the trusted part of a verified proof set is about this gift, this person, this session and this
 * condition, and what it says. Every refusal is typed, because "no" without a reason is what makes people distrust
 * a proof system, and every one of them is a unit test.
 */
export function validateShownEvidence(input: {
  condition: ShownCondition;
  data: readonly ReclaimTrustedData[];
  timestamps: readonly number[];
  policy: ShownPolicy;
}): ShownEvidence {
  const { condition, data, timestamps, policy } = input;
  if (!condition.phases.includes(policy.phase)) refuseShown("WRONG_PHASE", `${condition.conditionId} has no ${policy.phase} phase`);
  if (data.length !== condition.proofCount) refuseShown("WRONG_PROOF_COUNT", `The provider must return ${condition.proofCount} proof(s)`);
  if (timestamps.length !== condition.proofCount || timestamps.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    refuseShown("INVALID_PROOF_TIME", "The proof timestamps are invalid");
  }
  if (!isAddress(policy.account)) refuseShown("INVALID_POLICY", "The expected account is invalid");
  const dayIndex = policy.phase === "check-in" ? (policy.dayIndex ?? -1) : 0;
  const expectedAddress = getAddress(policy.account).toLowerCase();
  const expectedMessage = shownContextMessage(policy.giftId, policy.phase, dayIndex);

  const seenHashes = new Set<string>();
  const fields: Record<string, string> = {};
  for (const item of data) {
    if (contextString(item.context, "contextAddress").toLowerCase() !== expectedAddress) refuseShown("WRONG_ACCOUNT", "The proof is bound to another account");
    if (contextString(item.context, "contextMessage") !== expectedMessage) refuseShown("WRONG_GIFT_PHASE", "The proof is bound to another gift, day or phase");
    if (contextString(item.context, "reclaimSessionId") !== policy.expectedSessionId) refuseShown("WRONG_SESSION", "The proof does not belong to this Reclaim session");
    seenHashes.add(contextString(item.context, "providerHash").toLowerCase());
    for (const [key, value] of Object.entries(item.extractedParameters)) {
      if (key in fields && fields[key] !== value) refuseShown("CONFLICTING_FIELDS", `The proofs disagree on ${key}`);
      fields[key] = value;
    }
  }
  const expectedHashes = new Set(condition.requestHashes.map((hash) => hash.toLowerCase()));
  if (seenHashes.size !== expectedHashes.size || [...expectedHashes].some((hash) => !seenHashes.has(hash))) {
    refuseShown("WRONG_REQUEST_SCHEMA", "The proof does not contain the pinned requests");
  }

  const reading = condition.read(fields);
  const phaseLabel = policy.phase === "check-in" ? String(dayIndex) : policy.phase;
  const nullifier = keccak256(stringToHex(`viky:shown:v1:${condition.conditionId}:${policy.giftId}:${phaseLabel}:${policy.expectedSessionId}`));
  return {
    conditionId: condition.conditionId,
    reading,
    observedAt: Math.min(...timestamps),
    nullifier,
    sessionId: policy.expectedSessionId,
    phase: policy.phase,
    dayIndex,
  };
}
