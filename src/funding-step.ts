/**
 * What the funder's screen should do next while it watches for a card payment. Pulled out of the component
 * so the decision can be tested: the screen turns real money into a gift without anyone tapping again, and
 * a wrong branch here either converts money that has not arrived or leaves a payment sitting for ever.
 *
 * Every amount is in the units the chain uses, and nothing here touches the chain: it is a decision about
 * two balances, and nothing else.
 */

/**
 * What stays behind after the conversion, and it is not a gas reserve: Monad holds 10 MON per account, and
 * an account that ends below it cannot make a contract call (D53, D56). Leaving 0.2 MON behind, as this did,
 * risked a conversion that the chain refuses and euros stuck as MON. Eleven costs about $0.26 of a 25 EUR
 * purchase, measured on 14 Sep 2026 at 0.0232 AUSD per MON, and it leaves the account able to act again.
 */
export const CONVERSION_RESERVE = 11_000_000_000_000_000_000n;
/** Below this much above the reserve, an arriving balance is not a card payment worth converting. */
export const ARRIVAL_FLOOR = 1_000_000_000_000_000_000n;

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
