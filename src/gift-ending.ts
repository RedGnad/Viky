import { formatAusd, type GiftState } from "./gift-reader";
import type { MilestoneState } from "./milestone-reader";
import { opensByItsLink } from "./v2";

/**
 * The person a gift is for ends it (the audit of 1 Oct 2026, section 3.6): what a gift's status says of it, from the
 * contract's own figures. Only the second version of the two gift contracts has an ending, so both answers are nothing
 * for a gift of the first.
 *
 * `EndOffer` is what the confirmation prints and what the person's account then signs, to the unit: the contract works
 * both amounts out again and refuses if either differs (`EndTermsChanged`), so the sentence on the screen is the
 * transaction and never an estimate.
 */

export type EndOffer = Readonly<{
  /** Everything the gift has made theirs so far, taken out or not, in the coin's units and as dollars. */
  keep: string;
  keepDisplay: string;
  /** What leaves for the funder in the ending's own transaction. */
  giveBack: string;
  giveBackDisplay: string;
  /** The gift's intent counter, which the ending shares with a withdrawal. */
  nonce: string;
}>;

export type Ended = Readonly<{ atMs: number; keptDisplay: string; givenBackDisplay: string }>;

/** What ending a daily gift now would do, for the person it is for; nothing for anybody else or when it cannot be ended. */
export function dailyEndOffer(gift: GiftState, isRecipient: boolean): EndOffer | null {
  if (!opensByItsLink(gift.version) || !isRecipient || gift.recipient === null || gift.cancelled || gift.finalised) return null;
  const keep = BigInt(gift.creditedDays) * gift.perDay;
  const giveBack = gift.amount - keep - gift.refundedToFunder;
  return { keep: keep.toString(), keepDisplay: formatAusd(keep), giveBack: giveBack.toString(), giveBackDisplay: formatAusd(giveBack), nonce: gift.withdrawNonce.toString() };
}

/** A daily gift its recipient ended: when, what stayed theirs, and everything that went back over the gift's life. */
export function dailyEnded(gift: GiftState): Ended | null {
  if (!opensByItsLink(gift.version) || gift.endedAt === 0) return null;
  const kept = BigInt(gift.creditedDays) * gift.perDay;
  return { atMs: gift.endedAt * 1_000, keptDisplay: formatAusd(kept), givenBackDisplay: formatAusd(gift.amount - kept) };
}

/** What ending a milestone gift now would do: nothing was earned before the target, so the whole amount goes back. */
export function milestoneEndOffer(state: MilestoneState, isRecipient: boolean): EndOffer | null {
  if (!opensByItsLink(state.version) || !isRecipient || state.recipient === null || state.cancelled || state.settled) return null;
  const giveBack = state.amount - state.refundedToFunder;
  return { keep: "0", keepDisplay: formatAusd(0n), giveBack: giveBack.toString(), giveBackDisplay: formatAusd(giveBack), nonce: state.withdrawNonce.toString() };
}

export function milestoneEnded(state: MilestoneState): Ended | null {
  if (!opensByItsLink(state.version) || state.endedAt === 0) return null;
  return { atMs: state.endedAt * 1_000, keptDisplay: formatAusd(0n), givenBackDisplay: formatAusd(state.amount) };
}
