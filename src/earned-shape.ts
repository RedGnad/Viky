import type { Hex } from "viem";

/**
 * What one gift holds for its recipient right now, as the way out reads it (D208): the gift, its contract, the amount
 * in the coin's units, and the withdrawal nonce the contract expects next. No server code here: the browser reads it.
 */
export type EarnedInGift = Readonly<{ giftId: string; escrow: Hex; earned: string; nonce: string }>;

/** The sum of what the gifts hold, in the coin's units. */
export function totalEarned(gifts: readonly Pick<EarnedInGift, "earned">[]): bigint {
  return gifts.reduce((sum, gift) => sum + BigInt(gift.earned), 0n);
}
