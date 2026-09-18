import { formatAusd } from "./gift-reader";

/**
 * How the way out names an amount (D104): the money a person understands first, and the exact quantity a payout
 * service asks for second.
 *
 * Two ways out, two different numbers behind one screen. The bank service buys a dollar coin, so the number ready to
 * send **is** dollars: 9.99 means $9.99. The card service buys the chain's own coin, so the number ready to send is a
 * quantity of that: the capture of 18 Sep 2026 shows 138.43 of it, worth about $3.24. Writing "$138.43" there would
 * have been false by a factor of forty, on the one screen nothing can be taken back from.
 *
 * So: the amount a person reads, decides on and is asked to confirm is always dollars, with "about" whenever it came
 * from a conversion. The exact quantity is never gone, because the service asks for it: it is said once, under the
 * action, in the words of `CASH_OUT.exactQuantity`.
 *
 * When no price answers, no dollar figure is invented. The quantity leads then, and it is never left bare: the same
 * line under it says what it is and whose counting it follows, with `CASH_OUT.worthLater` beside it saying the value
 * in dollars will come when the price does.
 */

export type ExitAmount = Readonly<{
  /** What a person reads and decides on: "$9.99", "about $3.24", or the quantity itself when no price answered. */
  lead: string;
  /** The exact quantity the service asks for, when that is not the dollars themselves. */
  exact?: string;
  /** True when `lead` came from a conversion, so "about" is on it and the price's own line belongs beside it. */
  converted: boolean;
  /** True when no price answered: the screen says so rather than naming a figure it cannot stand behind. */
  unpriced: boolean;
}>;

export function exitAmount(input: Readonly<{ number: string; native: boolean; worth?: bigint }>): ExitAmount {
  // The bank rail: the coin the service buys is a dollar, so the number ready to send is the amount in dollars.
  if (!input.native) return { lead: `$${input.number}`, converted: false, unpriced: false };
  // The card rail with no price: the quantity leads, because inventing dollars for it would be worse than saying
  // plainly that the value is not known yet. It is never alone on the screen (`exactQuantity`, `worthLater`).
  if (input.worth === undefined) return { lead: input.number, exact: input.number, converted: false, unpriced: true };
  return { lead: `about ${formatAusd(input.worth)}`, exact: input.number, converted: true, unpriced: false };
}
