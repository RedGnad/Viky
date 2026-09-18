/**
 * The amount a funder typed, turned into the units the contract holds. Read from the text rather than
 * through a number, because a number lies here: `Number("20.999") * 100` rounds up to 2100 and would take
 * a dollar more than the person wrote, and `Number("1e3")` reads a stray keystroke as a thousand dollars.
 * A screen that shows two decimals accepts two decimals, and refuses anything else instead of guessing.
 */

/** The contract's own floor, `MIN_AMOUNT` in GiftEscrow: one dollar. */
export const MIN_GIFT_UNITS = 1_000_000n;

/**
 * The pilot's ceiling, a thousand dollars (mitigation b, 19 Sep 2026). Both contracts keep their own `MAX_AMOUNT` of
 * one hundred thousand and neither is redeployed: this is a bound we hold above them, so it can be raised or dropped
 * by changing one line rather than by moving money to a new contract. Every screen parses an amount through here, so
 * the field refuses it before anything is signed, and the create routes refuse it again where it counts.
 */
export const MAX_GIFT_UNITS = 1_000_000_000n;

/** Said under the field and on the amount step, in the same words, because it is the same rule. */
export const PILOT_CAP_SENTENCE = "During the pilot, a gift is at most $1,000.";

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

const AMOUNT = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

export function dollarsToUnits(text: string): bigint {
  const match = AMOUNT.exec(String(text).trim());
  if (!match) throw new AmountError("Enter an amount like 20 or 20.50");
  const units = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(2, "0")) * 10_000n;
  if (units < MIN_GIFT_UNITS) throw new AmountError("The smallest gift is $1.00");
  if (units > MAX_GIFT_UNITS) throw new AmountError(PILOT_CAP_SENTENCE);
  return units;
}
