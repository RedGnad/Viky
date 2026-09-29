import { getAddress, type Hex, type LocalAccount } from "viem";
import {
  receiveAuthorizationMessage,
  receiveAuthorizationTypedData,
  toContractAuthorization,
  transferAuthorizationMessage,
  transferAuthorizationTypedData,
} from "../ausd-authorization";
import { AUSD, movesOnASignature, type Coin } from "../coins";
import { NO_CONTACT_HASH } from "../contact-hash";
import { fundingNonce, giftSalt, withdrawIntentTypedData, type GiftParams } from "../gift-terms";
import { ApiError, getJson, postJson } from "./api";
import { isMilestoneGiftId, milestoneWithdrawTypedData } from "../milestone-protocol";
import type { MilestoneStatus } from "../milestone-view";

/** Browser-side flows of a gift. Every step that moves money is signed by the person's own account. */

export function escrowAddressFromEnv(): Hex {
  const value = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("The gift contract is not configured");
  return getAddress(value);
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export type CreateGiftInput = {
  account: LocalAccount;
  /** The recipient's Duolingo username, when the funder knows it (no code needed then, D27). */
  duolingoUsername?: string;
  /** The one course a day is counted on, chosen from that profile's own courses (U1). */
  course?: string;
  /** Words for people, stored beside the link and never signed into the terms (src/gift-names.ts). */
  recipientName?: string;
  funderName?: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  refundTo?: Hex;
};

export type CreatedGift = { giftId: string; claimUrl: string; funded: boolean };

/**
 * Whether a public profile goes by this name on the condition's source, how that source spells it, and the courses it
 * carries with the one it says is current, for a source that holds several (U1).
 */
export function checkSourceName(
  path: string,
  name: string,
): Promise<{ username: string; courses?: readonly { id: string; title: string; xp: number }[]; currentCourseId?: string | null }> {
  return getJson(`${path}?username=${encodeURIComponent(name)}`);
}

/** The body of a creation request, signed once and sent as many times as it takes (D87). */
export type GiftRequest = Readonly<{
  duolingoUsername?: string;
  /** The random half of the salt. The rest of it is the account and the course, so the server recomputes it (D102). */
  saltSeed: Hex;
  /** The one course a day is counted on, when the funder chose one (U1). */
  course?: string;
  recipientName?: string;
  funderName?: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: string;
  refundTo: string;
  salt: Hex;
  authorization: { validAfter: string; validBefore: string; nonce: Hex; v: number; r: Hex; s: Hex };
}>;

/**
 * One passkey-derived signature: the EIP-3009 authorization whose nonce is the hash of these exact
 * terms. The server recomputes the nonce from the same inputs and refuses anything else.
 */
export async function prepareGift(input: CreateGiftInput): Promise<GiftRequest> {
  const escrow = escrowAddressFromEnv();
  const funder = getAddress(input.account.address);
  // The salt is what carries the account and the course into what the funder signs (D102). Its random half is sent
  // with the request so the server rebuilds exactly this salt, or refuses to make the gift.
  const saltSeed = randomSalt();
  const params: GiftParams = {
    funder,
    refundTo: input.refundTo ? getAddress(input.refundTo) : funder,
    // No contact is asked for any more: it protected nothing and left a fingerprint on a public ledger (D72).
    recipientContactHash: NO_CONTACT_HASH,
    goalType: input.goalType,
    dailyTarget: input.dailyTarget,
    durationDays: input.durationDays,
    amount: input.amount,
    salt: giftSalt({ account: input.duolingoUsername, course: input.course, seed: saltSeed }),
  };
  const message = receiveAuthorizationMessage({ funder, escrow, amount: input.amount, nonce: fundingNonce(params) });
  const signature = await input.account.signTypedData(receiveAuthorizationTypedData(message));
  const authorization = toContractAuthorization(message, signature);
  return {
    duolingoUsername: input.duolingoUsername,
    course: input.course,
    saltSeed,
    recipientName: input.recipientName,
    funderName: input.funderName,
    goalType: params.goalType,
    dailyTarget: params.dailyTarget,
    durationDays: params.durationDays,
    amount: params.amount.toString(),
    refundTo: params.refundTo,
    salt: params.salt,
    authorization: {
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      nonce: authorization.nonce,
      v: authorization.v,
      r: authorization.r,
      s: authorization.s,
    },
  };
}

/** Sends a signed creation. The same request sent again finds its creation on the server rather than paying twice. */
export function submitGift(request: GiftRequest): Promise<CreatedGift> {
  return postJson<CreatedGift>("/api/gift/create", request);
}

export async function createGift(input: CreateGiftInput): Promise<CreatedGift> {
  return submitGift(await prepareGift(input));
}

/** The recipient's account for the public mode (D27); the code is only ever sent to the signed-in recipient. */
export type GoalAccount = {
  username: string | null;
  source: "funder" | "recipient" | null;
  bound: boolean;
  code: string | null;
  codeExpiresAt: string | null;
};

export type PublicOutcome =
  | { kind: "bound"; giftId: string; totalXp: number; hash: string }
  | { kind: "counted"; giftId: string; totalXp: number; creditedDays: number; hash: string }
  | { kind: "already"; giftId: string; reason: string }
  | { kind: "refused"; giftId: string; code: string; message: string; totalXp?: number };

export function nameGoalAccount(giftId: string, username: string): Promise<{ giftId: string; username: string; code: string; expiresAt: string }> {
  return postJson(`/api/gift/${giftId}/account`, { username });
}

export function bindGoalAccount(giftId: string): Promise<PublicOutcome> {
  return postJson(`/api/gift/${giftId}/bind`, {});
}

export function countNow(giftId: string): Promise<PublicOutcome> {
  return postJson(`/api/gift/${giftId}/count`, {});
}

export type GiftStatus = {
  kind: "daily";
  youAreTheRecipient: boolean;
  youAreTheFunder: boolean;
  catchUpSeconds: number;
  escrow: Hex;
  goalAccount: GoalAccount;
  giftId: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: string;
  amountDisplay: string;
  perDay: string;
  perDayDisplay: string;
  opened: boolean;
  connected: boolean;
  cancelled: boolean;
  finished: boolean;
  creditedDays: number;
  missedDays: number;
  daysLeft: number;
  earned: string;
  earnedDisplay: string;
  alreadyTheirsDisplay: string;
  returnedDisplay: string;
  takenDisplay: string;
  days: Array<{ day: number; outcome: "earned" | "returned" }>;
  lastReturnAtMs: number | null;
  createdAtChain: number;
  claimedAtChain: number;
  withdrawNonce: string;
  todayDayIndex: number;
  startDay: number;
  endDay: number;
  recorded: Array<{ kind: string; txHash: string; blockNumber: string | null }>;
  /** Given only to whoever holds the link, or to the funder or the recipient signed in. */
  names: { recipientName: string | null; funderName: string | null } | null;
};

/** A gift as the list of the account's gifts describes it, which is what a card draws on. */
export type GiftSummary = {
  giftId: string;
  /** "reader" is neither of the gift's two people: a judge opening a link, and anybody else the link reached (D99). */
  role: "funder" | "recipient" | "reader";
  goalType: number;
  goalUsername: string | null;
  usernameSource: "funder" | "recipient" | null;
  recipientName: string | null;
  funderName: string | null;
  /** How long a day stays catchable on the contract that holds this gift, so the card's days are drawn as the page's. */
  catchUpSeconds: number;
  days: Array<{ day: number; outcome: "earned" | "returned" }>;
  fundedAt: number;
  startDay: number;
  endDay: number;
  amountDisplay: string;
  perDayDisplay: string;
  durationDays: number;
  creditedDays: number;
  missedDays: number;
  opened: boolean;
  counting: boolean;
  finished: boolean;
  cancelled: boolean;
  earnedDisplay: string;
  theirsDisplay: string;
  returnedDisplay: string;
  /**
   * What the gift holds for its recipient right now, in the coin's units, and "0" to anybody else (D208): money
   * already theirs, still in the contract, which Home's way out takes first.
   */
  takeable: string;
  /** Present on a milestone gift, whose card draws the climb rather than days (C2). */
  milestone?: MilestoneStatus;
  /** On a reached gift: whether this account has had its moment (src/reached-seen-store.ts). */
  reachedSeen?: boolean;
};

/** Every gift of the signed-in account, newest first, as funder or recipient. */
export function loadMyGifts(): Promise<{ account: string; gifts: GiftSummary[] }> {
  return getJson("/api/gifts/mine");
}

/** Whether this account has had the moment of this reached gift, and the one write that says it has. */
export function loadReachedSeen(giftId: string): Promise<{ seen: boolean }> {
  return getJson(`/api/gift/${giftId}/reached-seen`);
}

export function markReachedSeen(giftId: string): Promise<{ seen: boolean }> {
  return postJson(`/api/gift/${giftId}/reached-seen`, {});
}

/** The link's key, when the page was opened from it, is what lets the names come back with the gift. */
export function loadGiftStatus(giftId: string, linkKey?: string | null): Promise<GiftStatus> {
  return getJson<GiftStatus>(`/api/gift/${giftId}${linkKey ? `?t=${encodeURIComponent(linkKey)}` : ""}`);
}

export function claimGift(giftId: string, token: string): Promise<{ giftId: string; opened: boolean }> {
  return postJson(`/api/gift/claim`, { giftId, token });
}

/**
 * A link again for a gift nobody has opened, asked for by the account that made it. The key is replaced, so the link
 * that was lost stops working: the screen says that before the button is pressed.
 */
export function giftLinkAgain(giftId: string): Promise<{ claimUrl: string }> {
  return postJson(`/api/gift/${giftId}/link`, {});
}

/** What a shown proof ended as: a day of a daily gift, or a milestone reached (D162). */
export type ShownProofOutcome =
  | {
      kind: "daily";
      phase: "baseline" | "check-in";
      dayIndex: number;
      metricValue: number;
      relayed: { hash: string; creditedDays: number } | null;
      refusal: { code: string; message: string } | null;
    }
  | {
      kind: "reached";
      giftId: string;
      metricValue: string;
      /** What was shown, in the words the person reads back: "14.00 / 20", "Passed", or the number itself (D174). */
      shown: string;
      observedAt: number;
      hash: string;
    }
  /** A first proof from a university with no pin yet (D312): held for review, nothing relayed. */
  | { kind: "held"; giftId: string; message: string };

/**
 * Opens a Reclaim session for this gift's condition, hands the person to the verification tab, then polls the
 * verify route until Reclaim has returned a proof and the server has recorded it (or refused it, with a reason).
 * The source is the condition's, not this function's: a daily gift names the account it binds, a milestone names
 * nothing and takes its one proof.
 */
export async function runShownProof(input: {
  giftId: string;
  conditionId: string;
  phase: "baseline" | "check-in" | "reach";
  dayIndex?: number;
  username?: string;
  openUrl: (url: string) => void;
  onWaiting?: (attempt: number) => void;
  signal?: AbortSignal;
}): Promise<ShownProofOutcome> {
  const session = await postJson<{ sessionId: string; requestUrl: string }>("/api/proof/session", {
    giftId: input.giftId,
    conditionId: input.conditionId,
    phase: input.phase,
    dayIndex: input.dayIndex ?? 0,
    ...(input.username ? { username: input.username } : {}),
  });
  input.openUrl(session.requestUrl);
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    if (input.signal?.aborted) throw new ApiError({ status: 499, code: "CANCELLED", message: "Cancelled." });
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    input.onWaiting?.(attempt);
    try {
      return await postJson<ShownProofOutcome>("/api/proof/verify", { sessionId: session.sessionId });
    } catch (error) {
      if (error instanceof ApiError && error.code === "NO_PROOF_YET") continue;
      throw error;
    }
  }
  throw new ApiError({ status: 408, code: "TIMED_OUT", message: "The verification took too long. Please try again." });
}

/** Takes what is already the recipient's: an intent signed by their own account, submitted by the relayer. */
export async function withdrawEarned(input: { account: LocalAccount; giftId: string; escrow: Hex; amount: bigint; nonce: bigint }): Promise<{ sent: boolean }> {
  const escrow = input.escrow;
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 10 * 60);
  const message = { giftId: BigInt(input.giftId), to: getAddress(input.account.address), amount: input.amount, nonce: input.nonce, deadline };
  // Each contract signs under its own name, so the gift's number decides the domain (C2).
  const typedData = isMilestoneGiftId(input.giftId) ? milestoneWithdrawTypedData(escrow, message) : withdrawIntentTypedData(escrow, message);
  const signature = await input.account.signTypedData(typedData);
  return postJson("/api/gift/withdraw", {
    giftId: input.giftId,
    to: message.to,
    amount: message.amount.toString(),
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    signature,
  });
}

/**
 * Sends someone's own AUSD where they choose, with one signature and nothing else. Their account never makes
 * a contract call and never needs any MON, which on Monad is not a nicety: an account below the 10 MON
 * reserve cannot make a contract call at all (D53).
 */
export async function sendOwnMoney(input: { account: LocalAccount; to: Hex; amount: bigint; coin?: Coin }): Promise<{ sent: boolean; reference: string; sentAtMs: number }> {
  // Defaults to what a gift holds. Since the way out exists an account can hold a second stablecoin too, and
  // each one is signed under its own domain: a signature made under the wrong name or version is simply
  // refused by the token, so the coin decides the domain rather than a constant (D77).
  const coin = input.coin ?? AUSD;
  if (!movesOnASignature(coin)) {
    throw new Error(`${coin.symbol} is the network's own coin and is sent from the person's own account`);
  }
  const message = transferAuthorizationMessage({
    from: getAddress(input.account.address),
    to: getAddress(input.to),
    value: input.amount,
    nonce: randomSalt(),
  });
  const signature = await input.account.signTypedData(transferAuthorizationTypedData(message, coin));
  return postJson("/api/send", {
    coin: coin.address,
    to: message.to,
    value: message.value.toString(),
    validAfter: message.validAfter.toString(),
    validBefore: message.validBefore.toString(),
    nonce: message.nonce,
    signature,
  });
}
