import { getAddress, type Hex } from "viem";
import { fetchPublicProfile, PublicProfileError, reclaimPublicProfileDeps, type PublicProfile, type PublicProfileDeps } from "./duolingo-public";
import { displayNameHasCode, DUOLINGO_PUBLIC_PROVIDER_ID, DUOLINGO_PUBLIC_PROVIDER_LABEL } from "./duolingo-public-terms";
import { contractRefusal } from "./gift-api";
import { ATTESTATION_TTL_SECONDS, identityPseudonym, serialiseMessage, signCheckIn, type CheckInMessage } from "./gift-attestation";
import { checkInDayIndex, readGift, utcDayOf } from "./gift-reader";
import { relayCheckIn } from "./gift-relay";
import { loadGift, loadRelayed, markBound, type GiftRecord } from "./gift-store";
import { consumeAndSaveVerification, saveProofSession } from "./proof-session-store";
import { escrowOf, RelayerError } from "./relayer";

/**
 * The public mode (D27): one attested read of the recipient's public Duolingo profile becomes one
 * check-in attestation, with nobody signing in anywhere. `bind` is the first read (it proves control
 * when the recipient named the account, and opens the window); `count` is the daily read the keeper
 * runs. Every outcome is typed, refusals included, so the screen and the keeper log say why.
 */

export type PublicCheckInPurpose = "bind" | "count";

export type PublicCheckInOutcome =
  | Readonly<{ kind: "bound"; giftId: string; totalXp: number; hash: Hex }>
  | Readonly<{ kind: "counted"; giftId: string; totalXp: number; creditedDays: number; hash: Hex }>
  | Readonly<{ kind: "already"; giftId: string; reason: "counted_today" | "not_bound" | "not_opened" | "no_account" | "already_bound" | "finished" | "cancelled" }>
  | Readonly<{ kind: "refused"; giftId: string; code: string; message: string; totalXp?: number }>;

export type PublicCheckInDeps = {
  profile: () => Promise<PublicProfileDeps>;
  now: () => number;
};

const defaultDeps: PublicCheckInDeps = { profile: reclaimPublicProfileDeps, now: () => Math.floor(Date.now() / 1_000) };

function refusal(giftId: string, code: string, message: string, totalXp?: number): PublicCheckInOutcome {
  return { kind: "refused", giftId, code, message, totalXp };
}

async function countedToday(giftId: string, nowSeconds: number): Promise<boolean> {
  const today = utcDayOf(nowSeconds);
  const relayed = await loadRelayed(giftId);
  // The relayed rows carry the session id, which the public mode stamps with the UTC day.
  return relayed.some((entry) => entry.kind === "check-in" && entry.sessionId?.startsWith(`public:${giftId}:count:${today}:`));
}

export async function runPublicCheckIn(input: { giftId: string; purpose: PublicCheckInPurpose; force?: boolean }, deps: PublicCheckInDeps = defaultDeps): Promise<PublicCheckInOutcome> {
  const { giftId, purpose } = input;
  const record: GiftRecord | null = await loadGift(giftId);
  if (!record || !record.recipient) return { kind: "already", giftId, reason: "not_opened" };
  if (!record.goalUsername) return { kind: "already", giftId, reason: "no_account" };
  if (purpose === "bind" && record.boundAt) return { kind: "already", giftId, reason: "already_bound" };
  if (purpose === "count" && !record.boundAt) return { kind: "already", giftId, reason: "not_bound" };

  const escrow = escrowOf(record);
  const onChain = await readGift(escrow, giftId);
  if (onChain.cancelled) return { kind: "already", giftId, reason: "cancelled" };
  if (onChain.finalised) return { kind: "already", giftId, reason: "finished" };
  const now = deps.now();
  if (purpose === "count" && !input.force && (await countedToday(giftId, now))) return { kind: "already", giftId, reason: "counted_today" };
  if (purpose === "bind" && record.usernameSource === "recipient") {
    if (!record.bindingCode || !record.bindingCodeExpiresAt || record.bindingCodeExpiresAt.getTime() < now * 1_000) {
      return refusal(giftId, "CODE_EXPIRED", "The code has expired. Ask for a new one.");
    }
  }

  let profile: PublicProfile;
  try {
    profile = await fetchPublicProfile(record.goalUsername, await deps.profile());
  } catch (error) {
    if (error instanceof PublicProfileError) {
      const messages: Record<string, string> = {
        INVALID_USERNAME: "That does not look like a Duolingo username.",
        PROFILE_NOT_FOUND: "No public Duolingo profile has that username. Check the spelling, and that the profile is public.",
        FETCH_FAILED: "Duolingo could not be read just now. Try again in a minute.",
        PROOF_INVALID: "The reading could not be verified. Try again in a minute.",
        PROOF_MISMATCH: "The reading could not be verified. Try again in a minute.",
        NOT_CONFIGURED: "Counting is not switched on yet.",
      };
      return refusal(giftId, error.code, messages[error.code] ?? error.message);
    }
    throw error;
  }

  if (purpose === "bind" && record.usernameSource === "recipient" && !displayNameHasCode(profile.displayName, record.bindingCode ?? "")) {
    return refusal(giftId, "CODE_NOT_IN_NAME", `The code is not in that profile's name yet (it reads "${profile.displayName}"). Add it, wait a moment, and try again.`);
  }

  const recipient = getAddress(record.recipient);
  const message: CheckInMessage = {
    giftId: BigInt(giftId),
    recipient,
    identityHash: identityPseudonym(DUOLINGO_PUBLIC_PROVIDER_LABEL, profile.profileId),
    providerId: DUOLINGO_PUBLIC_PROVIDER_ID,
    metricValue: BigInt(profile.totalXp),
    observedAt: BigInt(profile.observedAt),
    nullifier: profile.nullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  const signature = await signCheckIn(message, escrow);
  const sessionId = `public:${giftId}:${purpose}:${utcDayOf(now)}:${profile.nullifier.slice(2, 18)}`;
  await saveProofSession({
    sessionId,
    account: recipient.toLowerCase(),
    giftId,
    goalType: record.goalType,
    phase: purpose === "bind" ? "baseline" : "check-in",
    dayIndex: checkInDayIndex(onChain, now),
    duolingoUsername: profile.username,
    duolingoProfileId: profile.profileId,
  });
  await consumeAndSaveVerification({
    sessionId,
    evidence: { source: "zkfetch", username: profile.username, profileId: profile.profileId, displayName: profile.displayName, totalXp: profile.totalXp, streak: profile.streak, observedAt: profile.observedAt },
    attestation: { message: serialiseMessage(message), signature },
    proofs: profile.proof,
  });

  try {
    const relayed = await relayCheckIn(sessionId, escrow);
    if (purpose === "bind") {
      await markBound(giftId, profile.profileId);
      return { kind: "bound", giftId, totalXp: profile.totalXp, hash: relayed.hash };
    }
    return { kind: "counted", giftId, totalXp: profile.totalXp, creditedDays: relayed.creditedDays, hash: relayed.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") {
      const mapped = contractRefusal(error.contractError);
      return refusal(giftId, mapped?.code ?? error.contractError ?? "REFUSED", mapped?.message ?? "The contract refused this reading.", profile.totalXp);
    }
    throw error;
  }
}
