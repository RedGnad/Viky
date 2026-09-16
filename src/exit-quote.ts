import { GiftApiError } from "./gift-api";
import type { SwapQuote } from "./kuru";

/**
 * The floor bound into the signed terms comes from the quote whose bytes will be relayed, and from nowhere
 * else (D81).
 *
 * **What actually went wrong, measured rather than reasoned.** `prepare` used to bind the floor from the quote
 * the person had been shown, while fetching a second quote for the calldata. That was two quotes for one
 * signature, which is the fault this file removes. But it is **not** what the failure looked like: the two
 * numbers were identical, 9,998,810 both times. Over sixteen quotes the minimum engraved in the bytes equals
 * the minimum announced beside them, every time, so comparing those two numbers can never catch anything. An
 * earlier version of this file compared them and called it a protection, which was worse than no check at all:
 * it could not fail, so it implied a cover that did not exist.
 *
 * **What the gap really was.** The engraved minimum sits a constant 0.040 % under what the route says it will
 * deliver, so the exchange is coherent at the moment it quotes. That margin does not survive a human delay.
 * Between the quote and the relay the route moved 0.3 %, seven times the margin, and the route inside the bytes
 * could then deliver only 9,968,242 against the 9,998,810 demanded of it. The exchange refused on its own
 * internal check and the router could say nothing more than `ExchangeFailed`.
 *
 * **And the margin cannot be widened.** Asking that exchange for slippage explicitly returns a minimum equal to
 * the output, which is no margin at all, worse than its automatic 0.040 %. So there is no setting to buy safety
 * with, and no arithmetic here can make a stale route fill. What handles it is a retry: relay refuses, new
 * quote, new terms, sign again (src/client/exit.ts).
 */

/**
 * The floor to bind, and the one refusal that is honest at this step.
 *
 * @param quote the quote whose `data` will be relayed. Its own `minOut` is the only figure allowed, because a
 *   figure from anywhere else describes a route these bytes do not take.
 * @param whatTheySaw the floor the person read before they asked for this. They get at least that much or
 *   nothing moves, which is the only comparison worth making here.
 */
export function floorForTerms(quote: SwapQuote, whatTheySaw: bigint): bigint {
  const promised = BigInt(quote.minOut);
  if (promised < whatTheySaw) {
    throw new GiftApiError(
      "RATE_MOVED",
      "The rate moved, so this would pay you less than you were shown. Nothing was taken. Ask for a new quote.",
      409,
    );
  }
  return promised;
}
