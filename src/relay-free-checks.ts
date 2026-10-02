import { getAddress, recoverTypedDataAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";
import { withdrawIntentTypedData } from "./gift-terms";
import { isMilestoneGiftId, milestoneWithdrawTypedData } from "./milestone-protocol";
import { dailyVersionOf, milestoneVersionOf } from "./v2";
import { endTypedData, withdrawTypedDataV2 } from "./v2-protocol";

/**
 * What a route checks for nothing before a request is counted and before the relayer is asked to pay (the review of
 * 2 Oct 2026, R-16). Server only, and it reads no key: it compares what was sent with what the contract holds and
 * recovers who signed.
 *
 * A signed intent that passes these is one the contract would take: it is the recipient's own, over exactly what is
 * sent, with the gift's own nonce, and it has not run out. Anything else is refused here, in words, and is counted
 * against nobody: neither the person who made a mistake nor everybody's count for the day.
 */

type Typed = Parameters<typeof recoverTypedDataAddress>[0];

async function signedBy(typed: Omit<Typed, "signature">, signature: Hex, account: string): Promise<boolean> {
  const signer = await recoverTypedDataAddress({ ...typed, signature } as Typed).catch(() => null);
  return signer !== null && getAddress(signer) === getAddress(account);
}

/** The nonce is the gift's own and the intent has not run out, as the contract will ask, said the way it says it. */
function assertFresh(intent: Readonly<{ nonce: bigint; deadline: bigint }>, giftNonce: bigint, nowSeconds: number): void {
  if (intent.deadline < BigInt(nowSeconds)) throw new GiftApiError("EXPIRED", "This request took too long. Please try again.", 409);
  if (intent.nonce !== giftNonce) throw new GiftApiError("STALE_REQUEST", "Please try again.", 409);
}

export type WithdrawIntent = Readonly<{ giftId: string; contract: Hex; recipient: string; to: Hex; amount: bigint; nonce: bigint; deadline: bigint; signature: Hex }>;

/** What a withdrawal's intent signs, by the contract the gift is on: each contract's own name, each version's own domain. */
export function withdrawTypedDataOf(intent: Pick<WithdrawIntent, "giftId" | "contract" | "to" | "amount" | "nonce" | "deadline">) {
  const message = { giftId: BigInt(intent.giftId), to: intent.to, amount: intent.amount, nonce: intent.nonce, deadline: intent.deadline };
  const milestone = isMilestoneGiftId(intent.giftId);
  if ((milestone ? milestoneVersionOf(intent.contract) : dailyVersionOf(intent.contract)) === 2) return withdrawTypedDataV2(milestone ? "milestone" : "daily", intent.contract, message);
  return milestone ? milestoneWithdrawTypedData(intent.contract, message) : withdrawIntentTypedData(intent.contract, message);
}

/** A withdrawal the contract would take: the gift's nonce, a deadline still ahead, and the recipient's own signature. */
export async function assertWithdrawStands(intent: WithdrawIntent, giftNonce: bigint, nowSeconds: number = Math.floor(Date.now() / 1_000)): Promise<void> {
  assertFresh(intent, giftNonce, nowSeconds);
  if (!(await signedBy(withdrawTypedDataOf(intent), intent.signature, intent.recipient))) throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
}

export type EndIntent = Readonly<{ giftId: string; contract: Hex; recipient: string; keep: bigint; giveBack: bigint; nonce: bigint; deadline: bigint; signature: Hex }>;

/** An ending the contract would take, checked the same way. */
export async function assertEndStands(intent: EndIntent, giftNonce: bigint, nowSeconds: number = Math.floor(Date.now() / 1_000)): Promise<void> {
  assertFresh(intent, giftNonce, nowSeconds);
  const typed = endTypedData(isMilestoneGiftId(intent.giftId) ? "milestone" : "daily", intent.contract, { giftId: BigInt(intent.giftId), keep: intent.keep, giveBack: intent.giveBack, nonce: intent.nonce, deadline: intent.deadline });
  if (!(await signedBy(typed, intent.signature, intent.recipient))) throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
}
