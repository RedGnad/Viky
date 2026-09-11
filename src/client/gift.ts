import { getAddress, type Hex, type LocalAccount } from "viem";
import { receiveAuthorizationMessage, receiveAuthorizationTypedData, toContractAuthorization } from "../ausd-authorization";
import { contactHash } from "../contact-hash";
import { fundingNonce, withdrawIntentTypedData, type GiftParams } from "../gift-terms";
import { ApiError, getJson, postJson } from "./api";

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
  contact: string;
  /** The recipient's Duolingo username, when the funder knows it (no code needed then, D27). */
  duolingoUsername?: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  refundTo?: Hex;
};

export type CreatedGift = { giftId: string; claimUrl: string; funded: boolean };

/**
 * One passkey-derived signature: the EIP-3009 authorization whose nonce is the hash of these exact
 * terms. The server recomputes the nonce from the same inputs and refuses anything else.
 */
export async function createGift(input: CreateGiftInput): Promise<CreatedGift> {
  const escrow = escrowAddressFromEnv();
  const funder = getAddress(input.account.address);
  const params: GiftParams = {
    funder,
    refundTo: input.refundTo ? getAddress(input.refundTo) : funder,
    recipientContactHash: contactHash(input.contact),
    goalType: input.goalType,
    dailyTarget: input.dailyTarget,
    durationDays: input.durationDays,
    amount: input.amount,
    salt: randomSalt(),
  };
  const message = receiveAuthorizationMessage({ funder, escrow, amount: input.amount, nonce: fundingNonce(params) });
  const signature = await input.account.signTypedData(receiveAuthorizationTypedData(message));
  const authorization = toContractAuthorization(message, signature);
  return postJson<CreatedGift>("/api/gift/create", {
    contact: input.contact,
    duolingoUsername: input.duolingoUsername,
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
  });
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
  goalAccount: GoalAccount;
  giftId: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amountDisplay: string;
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
  todayDayIndex: number;
  startDay: number;
  endDay: number;
  withdrawNonce: string;
  recorded: Array<{ kind: string; txHash: string; blockNumber: string | null }>;
};

export function loadGiftStatus(giftId: string): Promise<GiftStatus> {
  return getJson<GiftStatus>(`/api/gift/${giftId}`);
}

export function claimGift(giftId: string, token: string): Promise<{ giftId: string; opened: boolean }> {
  return postJson(`/api/gift/claim`, { giftId, token });
}

export type CheckInOutcome = {
  phase: "baseline" | "check-in";
  dayIndex: number;
  metricValue: number;
  relayed: { hash: string; creditedDays: number } | null;
  refusal: { code: string; message: string } | null;
};

/**
 * Opens a Reclaim session for this gift, hands the person to the verification tab, then polls the verify
 * route until Reclaim has returned a proof and the server has recorded it (or refused it, with a reason).
 */
export async function runCheckIn(input: {
  giftId: string;
  phase: "baseline" | "check-in";
  dayIndex: number;
  username: string;
  openUrl: (url: string) => void;
  onWaiting?: (attempt: number) => void;
  signal?: AbortSignal;
}): Promise<CheckInOutcome> {
  const session = await postJson<{ sessionId: string; requestUrl: string }>("/api/duolingo/session", {
    giftId: input.giftId,
    phase: input.phase,
    dayIndex: input.dayIndex,
    username: input.username,
  });
  input.openUrl(session.requestUrl);
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    if (input.signal?.aborted) throw new ApiError({ status: 499, code: "CANCELLED", message: "Check-in cancelled." });
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    input.onWaiting?.(attempt);
    try {
      return await postJson<CheckInOutcome>("/api/duolingo/verify", { sessionId: session.sessionId });
    } catch (error) {
      if (error instanceof ApiError && error.code === "NO_PROOF_YET") continue;
      throw error;
    }
  }
  throw new ApiError({ status: 408, code: "TIMED_OUT", message: "The verification took too long. Please try again." });
}

/** Takes what is already the recipient's: an intent signed by their own account, submitted by the relayer. */
export async function withdrawEarned(input: { account: LocalAccount; giftId: string; amount: bigint; nonce: bigint }): Promise<{ sent: boolean }> {
  const escrow = escrowAddressFromEnv();
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 10 * 60);
  const message = { giftId: BigInt(input.giftId), to: getAddress(input.account.address), amount: input.amount, nonce: input.nonce, deadline };
  const signature = await input.account.signTypedData(withdrawIntentTypedData(escrow, message));
  return postJson("/api/gift/withdraw", {
    giftId: input.giftId,
    to: message.to,
    amount: message.amount.toString(),
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    signature,
  });
}
