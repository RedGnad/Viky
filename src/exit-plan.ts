import type { Hex } from "viem";

/**
 * The decisions the way out makes before anything is signed: how long a signature stays alive, and whether a
 * second attempt may make new terms or must reuse the ones already signed.
 *
 * It used to hold two more things, and both are gone with form C (D76), which is worth saying because their
 * absence is the point rather than a tidying up.
 *
 * The floor no longer has to match a figure printed on a screen. Under the old order the person read a figure,
 * left Viky, ordered exactly that much at the payout service, and only then signed, so the floor had to be
 * truncated to the decimals shown or the order would expect money that never came. The order is the other way
 * round now: the swap happens first, the USDC that actually arrived is read off the chain, and the order is
 * placed for that figure. Nothing is promised before it exists, so the floor is only what it says it is,
 * protection against the rate moving while the transaction is in flight.
 *
 * And the smallest payout is no longer a constant. It is published in euros, it moves with the rate, and it
 * belongs to the payout service, so it is asked of them at the moment it is needed (src/ramp.ts).
 */

/**
 * How long a prepared way out stays alive. Long enough to read a screen, sign, and be relayed twice if the
 * first attempt fails; short enough that somebody who walks away is not held back for long, because a
 * signature they made is spendable until it expires.
 */
export const EXIT_WINDOW_SECONDS = 15 * 60;

export type OpenExit = Readonly<{
  id: string;
  amount: bigint;
  /** The coin that must come back, zero meaning the chain's own (D77). */
  tokenOut: Hex;
  minOut: bigint;
  /** Set once the person has signed. Until then the terms are words: no signature exists to spend. */
  signature: Hex | null;
}>;

export type ExitWish = Readonly<{ amount: bigint; tokenOut: Hex; minOut: bigint }>;

export type ExitPlan =
  | { kind: "reuse"; id: string }
  | { kind: "replace"; discard?: string }
  | { kind: "blocked"; id: string };

/**
 * What a second attempt may do.
 *
 * Reuse is the point. A relay can fail for reasons that have nothing to do with the person (a refused
 * estimate, an RPC that dropped the transaction), and the obvious reaction, quote again and ask for another
 * signature, would leave two live authorizations for the same money. Only one of them needs to land for their
 * account to be debited; if both land they are debited twice. So the same terms and the same signature are
 * relayed again, and the token itself refuses the second landing because a nonce is spent once.
 *
 * Terms that were never signed are nothing at all and may be thrown away. Terms that were signed hold the
 * person to them until they expire, which is why the window is short.
 */
export function planExit(open: OpenExit | null, wish: ExitWish): ExitPlan {
  if (!open) return { kind: "replace" };
  // The coin counts as part of "the same thing". Somebody who asked for one payout service and then chose the
  // other wants different terms, and reusing a signature made for the first would send them the wrong coin.
  const same =
    open.amount === wish.amount &&
    open.minOut === wish.minOut &&
    open.tokenOut.toLowerCase() === wish.tokenOut.toLowerCase();
  if (same) return { kind: "reuse", id: open.id };
  if (open.signature) return { kind: "blocked", id: open.id };
  return { kind: "replace", discard: open.id };
}
