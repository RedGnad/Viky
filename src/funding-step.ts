/**
 * What the funder's screen should do next while it watches for a card payment. Pulled out of the component
 * so the decision can be tested: the screen turns real money into a gift without anyone tapping again, and
 * a wrong branch here either converts money that has not arrived or leaves a payment sitting for ever.
 *
 * Every amount is in the units the chain uses, and nothing here touches the chain: it is a decision about
 * two balances, and nothing else.
 */

/** What stays behind to pay for the conversion itself. */
export const CONVERSION_RESERVE = 200_000_000_000_000_000n;
/** Below this, an arriving balance is dust left over from something else, not a card payment. */
export const ARRIVAL_FLOOR = 50_000_000_000_000_000n;

export type FundingStep =
  | { do: "give" }
  | { do: "convert"; amount: bigint }
  | { do: "wait"; sawSomething: boolean };

export function nextFundingStep(input: { held: bigint; arriving: bigint; wanted: bigint }): FundingStep {
  // Enough already: the gift can be made, and nothing else should be converted.
  if (input.held >= input.wanted) return { do: "give" };
  // Something arrived, and enough of it that converting leaves more than it costs.
  if (input.arriving > ARRIVAL_FLOOR + CONVERSION_RESERVE) {
    return { do: "convert", amount: input.arriving - CONVERSION_RESERVE };
  }
  // Nothing worth acting on. `sawSomething` only changes what the person is told, never what is done.
  return { do: "wait", sawSomething: input.arriving > 0n };
}
