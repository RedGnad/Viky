import { upToTheCent } from "./euro-cents";
import { serviceChargeEur } from "./gift-amount";
import type { CardAsked, WayIn } from "./rails";

/**
 * What a card is asked for, in the currency its service's page is opened in (9 Oct 2026). Every page was opened in
 * euros; Rampnow's can be opened in another currency, the one its own quote was given in or dollars, so the amount, its
 * fee and its floor are said in the currency the card is charged in, whichever it is.
 *
 * By the rule, the euros a gift needs are worked out as they always were (src/gift-amount.ts), and said in the way's
 * own currency at the day's rate: nothing changes for a way paid in euros, and a way paid in dollars is asked the same
 * money, written in dollars to the cent. The fee is the service's published one, in euros, at that same rate.
 */

/** What a card is asked for, and what its service keeps of it: both in the currency the card is charged in. */
export type CardAsk = CardAsked & Readonly<{ fee: number }>;

/** The currency a way's page is opened in when nothing quotes it: the euro, unless the way says dollars. */
export function paidIn(way: WayIn): "EUR" | "USD" {
  return way.paidIn ?? "EUR";
}

/** How many of that currency a euro is at the day's rate; nothing for dollars when no rate was read. */
function perEuroOf(way: WayIn, usdPerEur: number | undefined): number | undefined {
  if (paidIn(way) === "EUR") return 1;
  return usdPerEur !== undefined && usdPerEur > 0 ? usdPerEur : undefined;
}

/**
 * What the card is asked by the rule, from the euros the gift needs on this way (`WayInOffer.euros`): those euros and
 * the service's fee on them, or the same in dollars to the cent. Nothing when the way is paid in dollars and no rate
 * was read.
 */
export function askByRule(way: WayIn, euros: number, usdPerEur: number | undefined): CardAsk | undefined {
  const rate = perEuroOf(way, usdPerEur);
  if (rate === undefined || !(euros > 0)) return undefined;
  const fee = serviceChargeEur(euros, way.fee) * rate;
  return paidIn(way) === "EUR" ? { currency: "EUR", amount: euros, fee } : { currency: "USD", amount: upToTheCent(euros * rate), fee };
}

/**
 * A way's smallest payment, in the currency its page is opened in: its published floor in euros; or, in dollars, that
 * floor at the day's rate to the dollar above (the founder's rule of 9 Oct 2026). Rampnow's own floor is five euros
 * at its own rate, 5.62 dollars that day: a whole dollar above ours is never under it.
 */
export function floorOf(way: WayIn, usdPerEur: number | undefined): CardAsked | undefined {
  const rate = perEuroOf(way, usdPerEur);
  if (rate === undefined) return undefined;
  return paidIn(way) === "EUR" ? { currency: "EUR", amount: way.smallestEur } : { currency: "USD", amount: Math.ceil(way.smallestEur * rate - 1e-9) };
}
