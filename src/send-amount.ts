import { formatAusdExact } from "./gift-reader";

/**
 * What a person types when they send money of their own, read to the last of the coin's six decimals (D75).
 *
 * Why it is not the gift's parser: a gift is typed in dollars and cents, and `dollarsToUnits` refuses anything
 * finer on purpose, because a screen that shows two decimals must not take three. Sending is the opposite case. A
 * payout service is ordered for an exact quantity and expects exactly that quantity to arrive; more or less can
 * fail the order and send it back, less what the network took. Viky used to send the whole balance, six decimals
 * and all, so no order could ever match it.
 *
 * It is read from the text rather than through a number, for the reason the gift's parser gives: a number rounds,
 * and it reads a stray keystroke like 1e3 as a thousand.
 */

export type SendAmount = Readonly<{ units: bigint; refusal?: undefined } | { units?: undefined; refusal: string }>;

/** The same amount as a field holds it: what `formatAusdExact` writes, without the dollar sign in front. */
export function exactAmountText(units: bigint): string {
  return formatAusdExact(units).slice(1);
}

const EXACT = /^(\d{1,9})(?:[.,](\d{1,6}))?$/;

export function amountToSend(text: string, holding: bigint): SendAmount {
  const match = EXACT.exec(String(text).trim());
  if (!match) return { refusal: "Type an amount like 28.56 or 28.564213, with six decimals at most." };
  const units = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
  if (units === 0n) return { refusal: "Type an amount above zero." };
  if (units > holding) return { refusal: `You have ${formatAusdExact(holding)}. Send that or less.` };
  return { units };
}
