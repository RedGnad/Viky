import { currencyOf, figureIn, markOf } from "./currencies";
import type { Rates } from "./rates";

/**
 * The pay sheet's figures (the founder's mockup pay-sheet-2026-10-03, validated 3 Oct 2026): one money, the one the
 * gift was typed in, and lines that add up to what the card pays, to the cent.
 *
 * The card pays a whole number of euros: that is what the card service is asked for. The account covers the rest, so
 * its part is what is left once the card's figure and its fee are known: the gift, plus the fee, less the card. When
 * the card brings more than the gift and its fee, a service's floor or the margin a coin that moves needs, what is left
 * over stays in the account, on a line of its own. Either way the lines add up: the gift, less the account's part, plus
 * the fee, plus what stays, is the card's figure.
 */

/** How many of a currency one euro buys, by the day's rates; the euro itself and the two CFA francs are fixed. */
export function perEuro(code: string, rates: Rates | undefined): number | undefined {
  if (code === "EUR") return 1;
  const value = rates?.eurPer[code];
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** An amount as the sheet writes every one: its sign and its own decimals, and never "about". "€19.00", "F CFA 12,000". */
export function moneyIn(amount: number, code: string): string {
  const { sign, gap } = markOf(code);
  return `${sign}${gap}${figureIn(amount, code)}`;
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

/** Dollars in the sheet's money at the day's rate, to its decimals: what the account holds, or a gift not typed in it. */
export function heldIn(units: bigint, code: string, rates: Rates | undefined): number | undefined {
  const dollars = Number(units) / 1_000_000;
  if (code === "USD") return toDecimals(dollars, "USD");
  const euro = perEuro(code, rates);
  const usdPerEur = rates?.usdPerEur;
  if (euro === undefined || !(usdPerEur && usdPerEur > 0)) return undefined;
  return toDecimals((dollars / usdPerEur) * euro, code);
}
