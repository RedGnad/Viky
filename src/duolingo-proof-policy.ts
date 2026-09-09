import { encodeAbiParameters, getAddress, isAddress, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";
import type { ReclaimTrustedData } from "./reclaim-types";

/**
 * Ported from Lock-in's Duolingo proof policy. The provider, its two request hashes and every check on
 * the signed context are unchanged. What changed is the binding: a proof is bound to a gift and to a
 * phase that is either the baseline or a day index, exactly the `<giftId>:baseline` and
 * `<giftId>:<dayIndex>` messages the on-chain verifier expects.
 */

export const DUOLINGO_PROVIDER_VERSION = "1.0.8";
export const DUOLINGO_PROVIDER_ID = "cdf8cb3b-2976-4413-ab2d-693ae5028380";
export const DUOLINGO_PROVIDER_KEY = keccak256(stringToHex(`${DUOLINGO_PROVIDER_ID}@${DUOLINGO_PROVIDER_VERSION}`));
export const DUOLINGO_OWNERSHIP_REQUEST_HASH = "0xea3ca9aeaa60e89d8f4a9134f5b314a78295e7e164f75eddb6d89f911a83766e";
export const DUOLINGO_XP_REQUEST_HASH = "0x92d80894f1f9e2f3574b840e846e41a49ae7491b587da9bd96cbcccbe001c8ed";
export const DUOLINGO_MAX_DAY_INDEX = 366;

export type DuolingoPhase = "baseline" | "check-in";

export type DuolingoPolicy = {
  account: string;
  giftId: string;
  phase: DuolingoPhase;
  /** Required for a check-in: the UTC day number of the check-in inside the gift window, 0 to 366. */
  dayIndex?: number;
  expectedSessionId: string;
  expectedProfileId: string;
  /** The exact signed `contextMessage` the proof must carry; defaults to the gift and phase binding. */
  expectedContextMessage?: string;
};

export type DuolingoEvidence = {
  profileId: string;
  totalXp: number;
  identityHash: Hex;
  eventNullifier: Hex;
  observedAt: number;
  sessionId: string;
  phase: DuolingoPhase;
  dayIndex: number;
};

export class DuolingoPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DuolingoPolicyError";
  }
}

function reject(code: string, message: string): never {
  throw new DuolingoPolicyError(code, message);
}

export function duolingoProviderId(): string {
  const value = process.env.DUOLINGO_PROVIDER_ID?.trim();
  if (value && value !== DUOLINGO_PROVIDER_ID) throw new Error("DUOLINGO_PROVIDER_ID does not match the pinned provider");
  return DUOLINGO_PROVIDER_ID;
}

/** The signed context message for a phase: `<giftId>:baseline` or `<giftId>:<dayIndex>`. */
export function duolingoContextMessage(giftId: string, phase: DuolingoPhase, dayIndex?: number): string {
  if (phase === "baseline") return `${giftId}:baseline`;
  if (!Number.isInteger(dayIndex) || Number(dayIndex) < 0 || Number(dayIndex) > DUOLINGO_MAX_DAY_INDEX) {
    reject("INVALID_POLICY", "A check-in needs a day index between 0 and 366");
  }
  return `${giftId}:${dayIndex}`;
}

function contextString(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  if (typeof value !== "string" || value.length === 0) {
    return reject("INVALID_CONTEXT", `Missing signed context field ${key}`);
  }
  return value;
}

function fieldValues(data: readonly ReclaimTrustedData[], key: string): string[] {
  return data.flatMap((item) => {
    const value = item.extractedParameters[key];
    return typeof value === "string" ? [value] : [];
  });
}

function oneField(data: readonly ReclaimTrustedData[], key: string): string {
  const values = fieldValues(data, key);
  if (values.length === 0) reject("MISSING_FIELD", `Missing signed Duolingo field ${key}`);
  if (new Set(values).size !== 1) reject("CONFLICTING_FIELD", `Conflicting signed values for ${key}`);
  return values[0];
}

function proofIndexWithField(data: readonly ReclaimTrustedData[], key: string): number {
  const indexes = data.flatMap((item, index) => (typeof item.extractedParameters[key] === "string" ? [index] : []));
  if (indexes.length !== 1) reject("INVALID_PROOF_ROLE", `Expected exactly one Duolingo ${key} proof`);
  return indexes[0];
}

export function validateDuolingoEvidence(input: {
  data: readonly ReclaimTrustedData[];
  timestamps: readonly number[];
  providerId: string;
  policy: DuolingoPolicy;
}): DuolingoEvidence {
  const { data, timestamps, providerId, policy } = input;
  if (providerId !== DUOLINGO_PROVIDER_ID) {
    reject("WRONG_PROVIDER", "The proof does not use the pinned Duolingo provider");
  }
  if (data.length !== 2) reject("WRONG_PROOF_COUNT", "The Duolingo provider must return ownership and XP proofs");
  if (timestamps.length !== 2 || timestamps.some((value) => !Number.isSafeInteger(value))) {
    reject("INVALID_PROOF_TIME", "The Duolingo proof timestamps are invalid");
  }
  if (!isAddress(policy.account) || !/^\d+$/.test(policy.giftId)) {
    reject("INVALID_POLICY", "The expected account or gift is invalid");
  }
  if (!/^[1-9]\d{0,19}$/.test(policy.expectedProfileId)) {
    reject("INVALID_POLICY", "The expected Duolingo profile id is invalid");
  }
  const dayIndex = policy.phase === "baseline" ? 0 : (policy.dayIndex ?? -1);

  const expectedAddress = getAddress(policy.account).toLowerCase();
  // The phase is inside the SIGNED context, so a baseline can never be replayed as a check-in, a check-in
  // for one day as another day's, nor a proof from one gift be presented to another.
  const expectedMessage = policy.expectedContextMessage ?? duolingoContextMessage(policy.giftId, policy.phase, dayIndex);
  const providerHashes = new Set<string>();
  for (const item of data) {
    if (contextString(item.context, "contextAddress").toLowerCase() !== expectedAddress) {
      reject("WRONG_ACCOUNT", "The proof is bound to another account");
    }
    if (contextString(item.context, "contextMessage") !== expectedMessage) {
      reject("WRONG_GIFT_PHASE", "The proof is bound to another gift, day or phase");
    }
    if (contextString(item.context, "reclaimSessionId") !== policy.expectedSessionId) {
      reject("WRONG_SESSION", "The proof does not belong to this Reclaim session");
    }
    providerHashes.add(contextString(item.context, "providerHash").toLowerCase());
  }
  if (
    providerHashes.size !== 2 ||
    !providerHashes.has(DUOLINGO_OWNERSHIP_REQUEST_HASH) ||
    !providerHashes.has(DUOLINGO_XP_REQUEST_HASH)
  ) {
    reject("WRONG_REQUEST_SCHEMA", "The proof does not contain both pinned Duolingo requests");
  }

  const ownershipIndex = proofIndexWithField(data, "marker");
  const profileIndex = proofIndexWithField(data, "xp");
  if (ownershipIndex === profileIndex) reject("INVALID_PROOF_ROLE", "Duolingo ownership and XP must be separate proofs");
  if (oneField(data, "marker") !== "disable_social") {
    reject("ACCOUNT_NOT_OWNED", "The Duolingo session does not control this profile");
  }

  const profileId = oneField(data, "id");
  const totalXpRaw = oneField(data, "xp");
  if (profileId !== policy.expectedProfileId) {
    reject("ACCOUNT_NOT_OWNED", "The authenticated Duolingo account does not match the requested profile");
  }
  if (!/^[1-9]\d{0,19}$/.test(profileId) || BigInt(profileId) > (1n << 64n) - 1n) {
    reject("INVALID_PROFILE", "The Duolingo profile id is invalid");
  }
  if (!/^(?:0|[1-9]\d{0,9})$/.test(totalXpRaw)) reject("INVALID_XP", "The signed Duolingo XP is invalid");
  const totalXp = Number(totalXpRaw);
  if (!Number.isSafeInteger(totalXp) || totalXp > 2_000_000_000) {
    reject("INVALID_XP", "The signed Duolingo XP is outside the accepted range");
  }

  const identityHash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32 providerKey, uint256 profileId"), [
      DUOLINGO_PROVIDER_KEY,
      BigInt(profileId),
    ]),
  );
  // Bound to the gift AND the phase (baseline or day index), never to the XP value. One identity gets
  // exactly one baseline and one check-in per day index per gift; the escrow's nullifier set enforces it.
  const phaseLabel = policy.phase === "baseline" ? "baseline" : String(dayIndex);
  const eventNullifier = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32 identityHash, uint256 giftId, bytes32 phase"), [
      identityHash,
      BigInt(policy.giftId),
      keccak256(stringToHex(phaseLabel)),
    ]),
  );

  return {
    profileId,
    totalXp,
    identityHash,
    eventNullifier,
    observedAt: timestamps[profileIndex],
    sessionId: policy.expectedSessionId,
    phase: policy.phase,
    dayIndex,
  };
}

export type DuolingoProgress = Readonly<{
  identityHash: Hex;
  previousXp: number;
  currentXp: number;
  earnedXp: number;
  previousNullifier: Hex;
  currentNullifier: Hex;
}>;

/**
 * What only exists in the RELATION between two proofs the recipient cannot have forged, swapped or
 * reordered. The contract does the day arithmetic; this refuses a pair that is not comparable at all.
 * Each input has already passed validateDuolingoEvidence, so each is TEE-verified and gift-bound.
 */
export function validateDuolingoProgress(input: {
  previous: DuolingoEvidence;
  current: DuolingoEvidence;
  maxCurrentAgeSeconds?: number;
  now?: number;
}): DuolingoProgress {
  const { previous, current } = input;

  if (current.phase !== "check-in") {
    reject("WRONG_PHASE_ORDER", "Progress needs a check-in as its newer proof");
  }
  if (previous.phase === "check-in" && !(current.dayIndex > previous.dayIndex)) {
    reject("WRONG_PHASE_ORDER", "A check-in must come after the previous check-in's day");
  }
  // Swapping the account between the two proofs would let a recipient borrow someone else's progress.
  if (previous.identityHash !== current.identityHash) {
    reject("IDENTITY_CHANGED", "The new proof is a different Duolingo account than the baseline");
  }
  if (previous.eventNullifier === current.eventNullifier) {
    reject("REPLAYED_PROOF", "The new proof reuses the previous nullifier");
  }
  // Strictly later: equal timestamps would make a single capture serve as both ends of its own delta.
  if (!(current.observedAt > previous.observedAt)) {
    reject("NOT_AFTER_PREVIOUS", "The new proof is not strictly newer than the previous one");
  }
  // XP only ever grows on Duolingo. A drop means we are not comparing what we think we are.
  if (current.totalXp < previous.totalXp) {
    reject("XP_WENT_BACKWARDS", "The new XP is below the previous one");
  }

  const maxAge = input.maxCurrentAgeSeconds;
  if (maxAge !== undefined) {
    const now = input.now ?? Math.floor(Date.now() / 1_000);
    if (current.observedAt > now + 60) reject("PROOF_IN_FUTURE", "The new proof is dated in the future");
    if (now - current.observedAt > maxAge) reject("PROOF_TOO_OLD", "The new proof is outside the submission window");
  }

  return {
    identityHash: previous.identityHash,
    previousXp: previous.totalXp,
    currentXp: current.totalXp,
    earnedXp: current.totalXp - previous.totalXp,
    previousNullifier: previous.eventNullifier,
    currentNullifier: current.eventNullifier,
  };
}
