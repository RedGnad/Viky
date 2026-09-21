import type { DisplayCurrency } from "./display-currency";
import { AmountError, dollarsToUnits, MAX_GIFT_UNITS, MIN_GIFT_UNITS } from "./money";
import type { Rates } from "./rates";

/**
 * A gift, typed in the currency the person reads in (D143).
 *
 * The chain holds dollars: what the contract escrows, what the terms are signed with, and what is released day by
 * day is a dollar figure, and no screen may pretend otherwise. What a person types is another matter. Wise, Revolut
 * and every remittance app people already use take the amount in the currency of whoever is paying and show the
 * other side as a dated estimate, and a funder in France who meets a dollar sign on the first screen reads "this is
 * not for me" and closes it, which is the founder's own reason for asking.
 *
 * So the card takes euros or CFA francs, this module turns them into the dollars that are signed at the day's rate
 * from the European Central Bank, and the card says that dollar figure beside the one that was typed. Nothing here
 * invents a rate: with no reading at all the card falls back to dollars, which is what is true.
 */

/** What a person may type: their own currency's figure, with at most the decimals that currency has. */
export function unitsFromTyped(typed: string, currency: DisplayCurrency, rates: Rates | undefined): bigint {
  if (currency === "USD" || !rates) return dollarsToUnits(typed);
  const decimals = currency === "EUR" ? 2 : 0;
  const shape = decimals === 0 ? /^(\d{1,9})$/ : /^(\d{1,9})(?:[.,](\d{1,2}))?$/;
  const match = shape.exec(typed.trim());
  if (!match) throw new AmountError(decimals === 0 ? "Whole francs, like 20000." : "Two decimals at most, like 30.00.");
  const amount = Number(`${match[1]}.${match[2] ?? "0"}`);
  const dollars = currency === "EUR" ? amount * rates.usdPerEur : amount / rates.xofPerUsd;
  // Cut to the cent the chain counts in, never rounded up: what is signed is never more than what was asked for.
  const units = BigInt(Math.floor(dollars * 100)) * 10_000n;
  if (units < MIN_GIFT_UNITS) throw new AmountError(smallestSaid(currency, rates));
  if (units > MAX_GIFT_UNITS) throw new AmountError(mostSaid(currency, rates));
  return units;
}

/** The same figure the other way, for a field that opens on what was chosen rather than empty. */
export function typedFromUnits(units: bigint, currency: DisplayCurrency, rates: Rates | undefined): string {
  if (currency === "USD" || !rates) {
    const cents = units / 10_000n;
    return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  }
  const dollars = Number(units) / 1_000_000;
  if (currency === "EUR") return (Math.round(dollars * rates.eurPerUsd * 100) / 100).toFixed(2);
  return String(Math.round(dollars * rates.xofPerUsd));
}

/** A figure as a person reads it: the franc is grouped, because five figures in a row are read by nobody. */
export function readableFigure(typed: string, currency: DisplayCurrency): string {
  if (currency !== "XOF") return typed;
  const whole = Number(typed);
  return Number.isFinite(whole) ? whole.toLocaleString("en-GB") : typed;
}

/**
 * The mark a figure is read with, and it stands in front of the figure in every currency (the founder, 21 Sep 2026).
 *
 * The CFA franc's name used to follow its figure, which is how it is written in prose, and on the card that put the
 * mark on the other side of the field: pressing it to change what everything is read in moved the box the amount is
 * typed in. A control keeps its place. The franc keeps a space after its letters, where a symbol needs none.
 */
export function currencyMark(currency: DisplayCurrency): Readonly<{ sign: string; gap: string }> {
  if (currency === "XOF") return { sign: "CFA", gap: " " };
  return { sign: currency === "EUR" ? "€" : "$", gap: "" };
}

/** A figure as it is read, its mark in front: "$30.00", "€26.18", "CFA 17,172". */
export function figureWithMark(figure: string, currency: DisplayCurrency): string {
  const { sign, gap } = currencyMark(currency);
  return `${sign}${gap}${figure}`;
}

/** The bound the contract holds, said in the currency the person is typing in, with the dollar it really is. */
function smallestSaid(currency: DisplayCurrency, rates: Rates): string {
  return `The smallest gift is $1.00, about ${figureWithMark(readableFigure(typedFromUnits(MIN_GIFT_UNITS, currency, rates), currency), currency)}.`;
}

function mostSaid(currency: DisplayCurrency, rates: Rates): string {
  return `During the pilot, a gift is at most $1,000, about ${figureWithMark(readableFigure(typedFromUnits(MAX_GIFT_UNITS, currency, rates), currency), currency)}.`;
}
