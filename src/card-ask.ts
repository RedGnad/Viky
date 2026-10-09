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

/**
 * The USDC a quote is asked for: what the account is short of, and the one part in a hundred the rule allows for the
 * change into what a gift holds (`DOLLAR_COIN_ALLOWANCE`). In the millionths an account counts in, rounded up.
 */
export function usdcToAsk(shortfallUnits: bigint): bigint {
  return shortfallUnits <= 0n ? 0n : (shortfallUnits * 100n + 98n) / 99n;
}

/**
 * What a screen knows of what the card is asked: still being asked of Rampnow; an amount, quoted by Rampnow in the
 * money the screen is read in, or worked out by the rule in the way's own currency; under the service's smallest
 * payment, with that floor; or nothing to say, when the rule needs a rate that was not read.
 */
export type CardAskState =
  | Readonly<{ state: "asking" }>
  | Readonly<{ state: "ask"; ask: CardAsk; quoted: boolean }>
  | Readonly<{ state: "under"; floor: CardAsked }>
  | Readonly<{ state: "none" }>;

/** By the rule alone: the offer's euros said in the way's currency, or its floor when the gift is under it. */
export function askOfTheRule(offer: Readonly<{ way: WayIn; euros: number | undefined; atFloor: boolean }>, usdPerEur: number | undefined): CardAskState {
  if (offer.atFloor) {
    const floor = floorOf(offer.way, usdPerEur);
    return floor ? { state: "under", floor } : { state: "none" };
  }
  const ask = offer.euros ? askByRule(offer.way, offer.euros, usdPerEur) : undefined;
  return ask ? { state: "ask", ask, quoted: false } : { state: "none" };
}

/** What Rampnow answered, as the route gives it (src/rampnow-quote.ts), or that it was not waited for any longer. */
export type QuoteSaid =
  | Readonly<{ state: "quoted"; quote: CardAsk & Readonly<{ arrives: number }> }>
  | Readonly<{ state: "under"; currency: string; smallest: number }>
  | Readonly<{ state: "none"; because?: string }>
  | "late";

/**
 * From Rampnow's answer: its quote, in the currency it was asked in; its floor when the gift is under it; and the
 * rule whenever it gives no quote, because no key is set, a card does not pay in that currency, or it did not answer.
 */
export function askOfTheQuote(said: QuoteSaid, rule: CardAskState): CardAskState {
  if (said === "late" || said.state === "none") return rule;
  if (said.state === "under") return { state: "under", floor: { currency: said.currency, amount: said.smallest } };
  const { currency, amount, fee } = said.quote;
  return { state: "ask", ask: { currency, amount, fee }, quoted: true };
}

/**
 * What a screen that must be paid asks of the card, whatever the gift needs: under the service's smallest payment, the
 * smallest payment itself, since what is over stays in the account (the screen that waits, where the gift is fixed).
 */
export function askToPay(state: CardAskState): CardAsked | undefined {
  if (state.state === "ask") return { currency: state.ask.currency, amount: state.ask.amount };
  if (state.state === "under") return state.floor;
  return undefined;
}
