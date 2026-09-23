import { getAddress, keccak256, stringToHex, type Hex } from "viem";
import type { PublicCheckInOutcome, PublicCheckInPurpose } from "./duolingo-public-checkin";
import { displayNameHasCode } from "./duolingo-public-terms";
import { contractRefusal } from "./gift-api";
import { ATTESTATION_TTL_SECONDS, identityPseudonym, serialiseMessage, signCheckIn, type CheckInMessage } from "./gift-attestation";
import { checkInDayIndex, readGift, utcDayOf, type GiftState } from "./gift-reader";
import { relayCheckIn } from "./gift-relay";
import { loadGift, loadRelayed, markBound, type GiftRecord } from "./gift-store";
import { dayStartIso, GITHUB_PROVIDER_ID, GITHUB_PROVIDER_LABEL, GithubReadError, readGithub, type GithubReading } from "./github-contributions";
import { consumeAndSaveVerification, saveProofSession } from "./proof-session-store";
import { escrowOf, RelayerError } from "./relayer";

/**
 * A GitHub gift's two readings, in the public mode's own shape (D27, D166): `bind` is the first read, which proves
 * control when the person named the account (the code in the profile's name or bio) and opens the window; `count` is
 * the daily read the keeper runs. The number carried is the calendar's total since the first moment of the day the
 * account was connected, so it can only grow, and the contract credits days from it exactly as it does from a
 * Duolingo experience total. Every outcome is typed, refusals included.
 */

export type GithubCheckInDeps = Readonly<{
  read: (login: string, span: { from: string; to: string }) => Promise<GithubReading>;
  onChain: (escrow: Hex, giftId: string) => Promise<GiftState>;
  sign: (message: CheckInMessage, escrow: Hex) => Promise<Hex>;
  relay: (sessionId: string, escrow: Hex) => Promise<{ hash: Hex; creditedDays: number }>;
  now: () => number;
}>;

export const liveGithubCheckInDeps: GithubCheckInDeps = {
  read: (login, span) => readGithub(login, span),
  onChain: readGift,
  sign: signCheckIn,
  relay: relayCheckIn,
  now: () => Math.floor(Date.now() / 1_000),
};

function refusal(giftId: string, code: string, message: string, xp?: number): PublicCheckInOutcome {
  return { kind: "refused", giftId, code, message, xp };
}

/** The session id's prefix for a day's count, so a second run on the same day finds the first. */
export function githubSessionPrefix(giftId: string, purpose: PublicCheckInPurpose, nowSeconds: number): string {
  return `github:${giftId}:${purpose}:${utcDayOf(nowSeconds)}:`;
}

async function countedToday(giftId: string, nowSeconds: number): Promise<boolean> {
  const prefix = githubSessionPrefix(giftId, "count", nowSeconds);
  const relayed = await loadRelayed(giftId);
  return relayed.some((entry) => entry.kind === "check-in" && entry.sessionId?.startsWith(prefix));
}

/** Whether the profile carries the code, in its name or in its bio: both are the person's own to edit. */
export function profileHasCode(user: { name: string; bio: string }, code: string): boolean {
  return displayNameHasCode(user.name, code) || displayNameHasCode(user.bio, code);
}

/** The span read: from the first moment of the day the account was connected (or today, when connecting) to now. */
export function spanOf(record: Pick<GiftRecord, "boundAt">, purpose: PublicCheckInPurpose, nowSeconds: number): { from: string; to: string } {
  const bound = purpose === "count" && record.boundAt ? record.boundAt.getTime() : nowSeconds * 1_000;
  return { from: dayStartIso(bound), to: new Date(nowSeconds * 1_000).toISOString().replace(/\.\d{3}Z$/, "Z") };
}

/** Unique per reading, which is what the contract asks of a nullifier: no attestor's identifier stands behind this read. */
export function githubNullifier(giftId: string, purpose: PublicCheckInPurpose, nowSeconds: number, total: number): Hex {
  return keccak256(stringToHex(`viky:github:${giftId}:${purpose}:${nowSeconds}:${total}`));
}

/** The contract's refusals that the shared table says in the lesson's words, said here about a contribution. */
const CONTRACT_WORDS: Record<string, string> = {
  NOT_ENOUGH_PROGRESS: "Not enough yet for a full day. One more contribution and it counts.",
  PROGRESS_WENT_BACKWARDS: "GitHub counts fewer contributions than last time: something was removed. Nothing was changed.",
};

const MESSAGES: Record<string, string> = {
  INVALID_USERNAME: "That does not look like a GitHub name.",
  NO_SUCH_USER: "No GitHub account goes by that name. Check the spelling.",
  SOURCE_UNAVAILABLE: "GitHub could not be read just now. Try again in a minute.",
  NOT_CONFIGURED: "Counting is not switched on yet.",
};

export async function runGithubCheckIn(input: { giftId: string; purpose: PublicCheckInPurpose; force?: boolean }, deps: GithubCheckInDeps = liveGithubCheckInDeps): Promise<PublicCheckInOutcome> {
  const { giftId, purpose } = input;
  const record: GiftRecord | null = await loadGift(giftId);
  if (!record || !record.recipient) return { kind: "already", giftId, reason: "not_opened" };
  if (!record.goalUsername) return { kind: "already", giftId, reason: "no_account" };
  if (purpose === "bind" && record.boundAt) return { kind: "already", giftId, reason: "already_bound" };
  if (purpose === "count" && !record.boundAt) return { kind: "already", giftId, reason: "not_bound" };

  const escrow = escrowOf(record);
  const onChain = await deps.onChain(escrow, giftId);
  if (onChain.cancelled) return { kind: "already", giftId, reason: "cancelled" };
  if (onChain.finalised) return { kind: "already", giftId, reason: "finished" };
  const now = deps.now();
  if (purpose === "count" && !input.force && (await countedToday(giftId, now))) return { kind: "already", giftId, reason: "counted_today" };
  if (purpose === "bind" && record.usernameSource === "recipient") {
    if (!record.bindingCode || !record.bindingCodeExpiresAt || record.bindingCodeExpiresAt.getTime() < now * 1_000) {
      return refusal(giftId, "CODE_EXPIRED", "The code has expired. Ask for a new one.");
    }
  }

  const span = spanOf(record, purpose, now);
  let reading: GithubReading;
  try {
    reading = await deps.read(record.goalUsername, span);
  } catch (error) {
    if (error instanceof GithubReadError) return refusal(giftId, error.code, MESSAGES[error.code] ?? error.message);
    throw error;
  }
  const { user, contributions } = reading;
  if (purpose === "bind" && record.usernameSource === "recipient" && !profileHasCode(user, record.bindingCode ?? "")) {
    return refusal(giftId, "CODE_NOT_IN_NAME", `The code is not in that profile's name or bio yet (the name reads "${user.name}"). Add it, wait a moment, and try again.`);
  }

  const recipient = getAddress(record.recipient);
  const nullifier = githubNullifier(giftId, purpose, now, contributions.total);
  const message: CheckInMessage = {
    giftId: BigInt(giftId),
    recipient,
    identityHash: identityPseudonym(GITHUB_PROVIDER_LABEL, user.databaseId),
    providerId: GITHUB_PROVIDER_ID,
    metricValue: BigInt(contributions.total),
    observedAt: BigInt(now),
    nullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  const signature = await deps.sign(message, escrow);
  const sessionId = `${githubSessionPrefix(giftId, purpose, now)}${nullifier.slice(2, 18)}`;
  await saveProofSession({
    sessionId,
    conditionId: "github-daily",
    account: recipient.toLowerCase(),
    giftId,
    goalType: record.goalType,
    phase: purpose === "bind" ? "baseline" : "check-in",
    dayIndex: checkInDayIndex(onChain, now),
    // The session row's two account columns, named for the first source that used them: here the login and GitHub's
    // numeric id of the account.
    duolingoUsername: user.login,
    duolingoProfileId: user.databaseId,
  });
  await consumeAndSaveVerification({
    sessionId,
    evidence: {
      source: "github-graphql",
      login: user.login,
      databaseId: user.databaseId,
      displayName: user.name,
      contributionsFrom: contributions.from,
      contributionsTo: contributions.to,
      total: contributions.total,
      days: contributions.days,
      observedAt: now,
    },
    attestation: { message: serialiseMessage(message), signature },
    // No proof stands behind this reading: it is Viky's own read of GitHub's API, signed on Viky's word (D166).
    proofs: null,
  });

  try {
    const relayed = await deps.relay(sessionId, escrow);
    if (purpose === "bind") {
      await markBound(giftId, user.databaseId);
      return { kind: "bound", giftId, xp: contributions.total, hash: relayed.hash };
    }
    return { kind: "counted", giftId, xp: contributions.total, creditedDays: relayed.creditedDays, hash: relayed.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") {
      const mapped = contractRefusal(error.contractError);
      const code = mapped?.code ?? error.contractError ?? "REFUSED";
      return refusal(giftId, code, CONTRACT_WORDS[code] ?? mapped?.message ?? "The contract refused this reading.", contributions.total);
    }
    throw error;
  }
}
