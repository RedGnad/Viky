import { amountIn, currencyOf } from "./currencies";
import { eurosNeededOn } from "./gift-amount";
import type { WayIn } from "./rails";
import type { Rates } from "./rates";

/**
 * The pay sheet's figures (the founder's mockup pay-sheet-2026-10-03, validated 3 Oct 2026): one money, the one the
 * gift was typed in, and figures that add up to what the card pays, to the cent.
 *
 * The card pays what the card service is asked for: to the cent where its page takes cents, a whole number of euros
 * otherwise. The account covers the rest, so its part is what is left once the card's figure and its fee are known:
 * the gift, plus the fee, less the card. When the card brings more than the gift and its fee, the margin a rate needs
 * or a whole euro, what is left over stays in the account. Either way the figures add up: the gift, less the account's
 * part, plus the fee, plus what stays, is the card's figure. Since 9 Oct 2026 they are said in one line under the
 * card's button: the part of the gift the card pays, its fee, and what stays.
 */

/** How many of a currency one euro buys, by the day's rates; the euro itself and the two CFA francs are fixed. */
export function perEuro(code: string, rates: Rates | undefined): number | undefined {
  if (code === "EUR") return 1;
  const value = rates?.eurPer[code];
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** An amount as the sheet writes every one: its sign and its own decimals, and never "about". "€19.00", "12 000 FCFA". */
export function moneyIn(amount: number, code: string): string {
  return amountIn(amount, code);
}

/** Rounded to the decimals a currency has, so a sum of written figures is the written sum. */
export function toDecimals(amount: number, code: string): number {
  const scale = 10 ** currencyOf(code).decimals;
  return Math.round(amount * scale) / scale;
}

/**
 * The gift in the money it was typed in: the figure typed, exactly, when it was typed in that money; otherwise the
 * dollars that will be signed, in that money at the day's rate, to its own decimals.
 */
export function giftTyped(input: Readonly<{ typedAmount?: string; typedIn?: string; units: bigint; code: string; rates: Rates | undefined }>): number | undefined {
  if (input.typedIn === input.code && input.typedAmount !== undefined) {
    const typed = Number(input.typedAmount.trim().replace(",", "."));
    if (Number.isFinite(typed) && typed > 0) return toDecimals(typed, input.code);
  }
  return heldIn(input.units, input.code, input.rates);
}

export type CardSum = Readonly<{
  code: string;
  gift: number;
  /** What the account puts in, subtracted on the sheet: zero when it puts in nothing. */
  fromAccount: number;
  fee: number;
  /** What the card brings beyond the gift and its fee, which stays in the account. */
  stays: number;
  /** What the card pays, in the sheet's money; exactly `cardEuros` when that money is the euro. */
  card: number;
  cardEuros: number;
}>;

/** The lines when the card pays: nothing when the sheet's money has no rate today. */
export function cardSum(input: Readonly<{ code: string; gift: number; cardEuros: number; feeEuros: number; rates: Rates | undefined }>): CardSum | undefined {
  const rate = perEuro(input.code, input.rates);
  if (rate === undefined) return undefined;
  const card = toDecimals(input.cardEuros * rate, input.code);
  const fee = toDecimals(input.feeEuros * rate, input.code);
  const rest = toDecimals(input.gift + fee - card, input.code);
  return { code: input.code, gift: input.gift, card, fee, cardEuros: input.cardEuros, fromAccount: rest > 0 ? rest : 0, stays: rest < 0 ? toDecimals(-rest, input.code) : 0 };
}

/**
 * The smallest round gift a card can pay for (the founder, 9 Oct 2026). A gift that needs less of the card than the
 * service's smallest payment used to be paid at that floor, the rest left in the account: five euros asked for a gift
 * of three. The sheet now offers no card under the floor, and proposes this amount: the first round figure of the
 * sheet's money, above the gift as it is, whose card payment reaches the floor. Round is the floor's own size in that
 * money: a euro or a dollar where five euros are a handful, a thousand francs where they are three thousand.
 *
 * Nothing without the day's rates, and nothing when forty steps do not reach the floor, which no real fee allows.
 */
export function smallestGiftByCard(input: Readonly<{ way: WayIn; code: string; gift: number; heldUnits: bigint; rates: Rates | undefined }>): number | undefined {
  const rate = perEuro(input.code, input.rates);
  const usdPerEur = input.rates?.usdPerEur;
  if (rate === undefined || !(usdPerEur && usdPerEur > 0)) return undefined;
  const step = 10 ** Math.floor(Math.log10(Math.max(1, input.way.smallestEur * rate)));
  for (let rung = Math.floor(input.gift / step) + 1, tried = 0; tried < 40; rung += 1, tried += 1) {
    const gift = toDecimals(rung * step, input.code);
    const units = BigInt(Math.round((gift / rate) * usdPerEur * 1_000_000));
    const needed = units > input.heldUnits ? eurosNeededOn(units - input.heldUnits, input.way, usdPerEur) : 0;
    if (needed !== undefined && needed >= input.way.smallestEur) return gift;
  }
  return undefined;
}

/** Dollars in the sheet's money at the day's rate, to its decimals: what the account holds, or a gift not typed in it. */
export function heldIn(units: bigint, code: string, rates: Rates | undefined): number | undefined {
  const dollars = Number(units) / 1_000_000;
  if (code === "USD") return toDecimals(dollars, "USD");
  const euro = perEuro(code, rates);
  const usdPerEur = rates?.usdPerEur;
  if (euro === undefined || !(usdPerEur && usdPerEur > 0)) return undefined;
  return toDecimals((dollars / usdPerEur) * euro, code);
}

/**
 * One writing of money on the way to a gift (the founder, 4 Oct 2026): what the person typed is what they read, on
 * the sheet that pays and on every screen after it, the wait, the gift being made, the card that says it is not made
 * yet. Somebody who typed 45 euros read "$50.51" from the wait on. The exact dollars are said where the gift made
 * says them already ("About €45.00… Exactly $50.51, at the rate of…"), and nowhere before.
 *
 * The figure kept with the gift is the one the pay sheet showed, in the sheet's own money. A gift kept without one
 * (written before this, or by a card nobody typed on) is said in dollars, which is what it holds.
 */
export function giftAsTyped(gift: Readonly<{ typedAmount?: string; typedIn?: string }>, dollars: string): string {
  if (gift.typedAmount !== undefined && gift.typedIn) {
    const typed = Number(gift.typedAmount.trim().replace(",", "."));
    try {
      if (Number.isFinite(typed) && typed > 0) return moneyIn(toDecimals(typed, gift.typedIn), gift.typedIn);
    } catch {
      // A money this build does not know: the dollars below.
    }
  }
  return dollars;
}

/**
 * The money those screens write everything else in: the one the gift was typed in, when the day's rate for it was
 * read; dollars otherwise. What the account holds, what arrived, what is left to pay are dollars said in it.
 */
export function moneyTypedIn(gift: Readonly<{ typedAmount?: string; typedIn?: string }>, rates: Rates | undefined): string {
  return gift.typedAmount !== undefined && gift.typedIn && gift.typedIn !== "USD" && perEuro(gift.typedIn, rates) !== undefined && rates?.usdPerEur ? gift.typedIn : "USD";
}

/** Dollars held, said in that money: "€8.24", or the dollars themselves when it is the dollar or no rate was read. */
export function dollarsSaidIn(units: bigint, code: string, rates: Rates | undefined, dollars: string): string {
  if (code === "USD") return dollars;
  const read = heldIn(units, code, rates);
  return read === undefined ? dollars : moneyIn(read, code);
}
