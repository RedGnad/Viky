import type { Hex } from "viem";

/**
 * The decisions the way out makes before anything is signed. Kept here, away from the routes, because each
 * one is a rule somebody could get wrong quietly: what floor we are bound to, how long a signature stays
 * alive, and whether a second attempt may make new terms or must reuse the ones already signed.
 */

/** Wei of the coin a payout service is owed. One MON is 1e18. */
const ONE = 1_000_000_000_000_000_000n;
/** The screen shows four decimals, so that is the precision we can promise without rounding in our favour. */
const SHOWN_STEP = ONE / 10_000n;

/**
 * The floor is what the screen showed, not what the exchange offered.
 *
 * The person reads a figure, orders exactly that much at the payout service, and comes back. Between the two
 * the rate moves. If we signed for the exchange's own floor, which is its quote less its slippage, they could
 * be delivered less than the order they placed expects, and the money would sit at a service waiting for an
 * amount that never came. So the figure is truncated to what is displayed, and that truncated figure is what
 * the signature binds: at least what they were shown, or nothing at all and their money stays where it is.
 */
export function shownFloor(output: bigint): bigint {
  if (output <= 0n) return 0n;
  return (output / SHOWN_STEP) * SHOWN_STEP;
}

/** The same figure as the screen prints it, so the two can never disagree. */
export function floorInWords(floor: bigint): string {
  const whole = floor / ONE;
  const fraction = (floor % ONE) / SHOWN_STEP;
  return `${whole}.${fraction.toString().padStart(4, "0")}`;
}

/**
 * The least a payout service will take.
 *
 * Measured at their own limits endpoint on 14 Sep 2026 (`/v1.6/lib/limits/sell`, MON on MONAD to EUR):
 * 879.889249290954315600 is their minimum and 513,493.669141047227556 their maximum. This is not a detail of
 * ours to soften: below it the order cannot be placed at all, so the person must be told before they start
 * rather than after they have read a figure and left Viky. At the rate of that day it is close to twenty one
 * dollars, which is more than some whole gifts (D60).
 */
export const PAYOUT_MINIMUM = 879_889_249_290_954_315_600n;
export const PAYOUT_MAXIMUM = 513_493_669_141_047_227_556_000n;

/**
 * How long a prepared way out stays alive. Long enough to read a screen, sign, and be relayed twice if the
 * first attempt fails; short enough that somebody who walks away is not held back for long, because a
 * signature they made is spendable until it expires.
 */
export const EXIT_WINDOW_SECONDS = 15 * 60;

export type OpenExit = Readonly<{
  id: string;
  amount: bigint;
  payoutTo: Hex;
  minOut: bigint;
  /** Set once the person has signed. Until then the terms are words: no signature exists to spend. */
  signature: Hex | null;
}>;

export type ExitWish = Readonly<{ amount: bigint; payoutTo: Hex; minOut: bigint }>;

export type ExitPlan =
  | { kind: "reuse"; id: string }
  | { kind: "replace"; discard?: string }
  | { kind: "blocked"; id: string };

/**
 * What a second attempt may do.
 *
 * Reuse is the point. A relay can fail for reasons that have nothing to do with the person (a refused
 * estimate, an RPC that dropped the transaction), and the obvious reaction, quote again and ask for another
 * signature, would leave two live authorizations for the same money. Only one of them needs to land for them
 * to be paid; if both land they are paid twice out of their own account. So the same terms and the same
 * signature are relayed again, and the token itself refuses the second landing because a nonce is spent once.
 *
 * Terms that were never signed are nothing at all and may be thrown away. Terms that were signed hold the
 * person to them until they expire, which is why the window is short.
 */
export function planExit(open: OpenExit | null, wish: ExitWish): ExitPlan {
  if (!open) return { kind: "replace" };
  const same =
    open.amount === wish.amount &&
    open.minOut === wish.minOut &&
    open.payoutTo.toLowerCase() === wish.payoutTo.toLowerCase();
  if (same) return { kind: "reuse", id: open.id };
  if (open.signature) return { kind: "blocked", id: open.id };
  return { kind: "replace", discard: open.id };
}
