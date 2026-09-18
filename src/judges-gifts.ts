import type { Hex } from "viem";
import { formatAusd, readGift, theirsSoFar } from "./gift-reader";
import { loadGift } from "./gift-store";
import { dailyJournal } from "./proof-journal";

/**
 * The two first gifts, which this app cannot show anybody (D99).
 *
 * They were made and opened on `viky-two.vercel.app`, before `viky.cash` served the app. A passkey is bound to the
 * hostname it was created on, for ever and by design, so the account that holds them cannot sign in here: not because
 * anything was lost, but because that is what binds a passkey to a site. A judge reading the chain would otherwise
 * find two gifts the app never mentions, and read an inconsistency where there is a hostname.
 *
 * Every number here is read at the moment the page is served: the contract for what it holds, and the day journal for
 * what settled when. Nothing about them is written down in the page.
 */

/** The host those two accounts were created on, which is the whole of why they are not visible here. */
export const EARLIER_HOST = "viky-two.vercel.app";

/** Gift numbers are the contract's own, in order, so the first two are the two that were made there. */
export const EARLIER_GIFT_IDS = ["1", "2"] as const;

export type EarlyGift = Readonly<{
  giftId: string;
  escrow: Hex;
  amountDisplay: string;
  durationDays: number;
  /** Days the contract has credited, days it has sent back, and days it has not settled yet. */
  earnedDays: number;
  returnedDays: number;
  waitingDays: number;
  /** What the person the gift is for has taken out, and what has gone back to the funder. */
  withdrawnDisplay: string;
  returnedDisplay: string;
  /** What the gift has earned in total, taken or not, and what is still waiting to go back to the funder. */
  earnedDisplay: string;
  refundableDisplay: string;
  finished: boolean;
  /** The settled days, as the public journal already publishes them. */
  days: ReadonlyArray<{ day: number; outcome: "earned" | "returned" }>;
}>;

/** What the chain says about one of them, or null when this deployment has no record of it at all. */
export async function earlyGift(giftId: string): Promise<EarlyGift | null> {
  const record = await loadGift(giftId);
  const escrow = (record?.escrow ?? process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim() ?? process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim()) as Hex | undefined;
  if (!escrow) return null;
  const [state, days] = await Promise.all([readGift(escrow, giftId), dailyJournal(giftId).catch(() => [])]);
  const settled = state.creditedDays + state.drainedDays;
  return {
    giftId,
    escrow,
    amountDisplay: formatAusd(state.amount),
    durationDays: state.durationDays,
    earnedDays: state.creditedDays,
    returnedDays: state.drainedDays,
    waitingDays: Math.max(0, state.durationDays - settled),
    withdrawnDisplay: formatAusd(state.withdrawnByRecipient),
    returnedDisplay: formatAusd(state.refundedToFunder),
    earnedDisplay: formatAusd(theirsSoFar(state)),
    refundableDisplay: formatAusd(state.refundableBalance),
    finished: state.finalised,
    days: days.map((day) => ({ day: day.day, outcome: day.outcome })),
  };
}

/** Both of them, in order, skipping any this deployment cannot read rather than inventing a line for it. */
export async function earlyGifts(ids: readonly string[] = EARLIER_GIFT_IDS): Promise<EarlyGift[]> {
  const read = await Promise.all(ids.map((giftId) => earlyGift(giftId).catch(() => null)));
  return read.filter((gift): gift is EarlyGift => gift !== null);
}
