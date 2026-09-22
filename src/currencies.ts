import type { Rates } from "./rates";

/**
 * Which currencies a person may read Viky in, and what each one is called, written nowhere (D152).
 *
 * The rule is D39's, the one `rails.ts` already lives by: no list of somebody else's business is kept in this
 * repository, because it changes without telling us. A currency is offered when both of these are true, and asked
 * fresh of each source:
 *
 * - **somebody can be paid in it**: the union of the euro rail's payout methods and of the card rail's fiat list;
 * - **we can convert into it honestly**: it is in the European Central Bank's daily file, plus the two CFA francs,
 *   which are fixed to the euro by treaty rather than published daily.
 *
 * Measured on 21 Sep 2026: 71 payable, 32 with a rate, 31 offered. The yuan has a rate and no rail, and must never
 * appear; a test holds that. When a source is silent, the three the product has always read in are offered instead,
 * because they are proven rather than guessed, and never a longer list written by hand.
 *
 * What a currency is called, what its sign is and how many decimals it has are not written here either: they are
 * asked of `Intl`, which the browser and the server both carry.
 */

/** What is offered when a source says nothing: the three the product was built on, and no more. */
export const CURRENCIES_WHEN_SILENT: readonly string[] = ["USD", "EUR", "XOF"];

/**
 * Currencies Viky does not offer, whatever the rails and the rate file say. The funder's decision of 22 Sep 2026,
 * which is the only kind of entry this list takes: a rail's silence is read from the rail, and a rate's absence
 * from the file, but a currency the product chooses not to propose can only be written down.
 */
export const NOT_OFFERED: ReadonlySet<string> = new Set(["ILS"]);

/** The shape of a currency a screen draws: the code, its sign, its name, and what it counts in. */
export type Currency = Readonly<{ code: string; sign: string; name: string; decimals: number }>;

const LOCALE = "en-GB";

/**
 * A code that names a currency, asked of the runtime rather than of a list here: `Intl.supportedValuesOf` carries
 * the ones ICU knows. `Intl.NumberFormat` cannot answer this, because it accepts any three well-formed letters and
 * formats "ZZZ 1.00" without blinking.
 */
let known: ReadonlySet<string> | undefined;
export function isCurrencyCode(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return false;
  known ??= new Set(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : []);
  return known.size === 0 || known.has(value);
}

/**
 * The sign a currency is written with where it is spent, its name, and its decimals, from `Intl` rather than from a
 * table: "$", "€", "₹", "F CFA". Several currencies share a sign, which is why a list never shows one alone.
 */
export function currencyOf(code: string): Currency {
  const format = new Intl.NumberFormat(LOCALE, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" });
  const sign = format.formatToParts(1).find((part) => part.type === "currency")?.value ?? code;
  let name = code;
  try {
    name = new Intl.DisplayNames([LOCALE], { type: "currency" }).of(code) ?? code;
  } catch {
    // A runtime without the currency names says the code, which is still true.
  }
  return { code, sign, name, decimals: format.resolvedOptions().maximumFractionDigits ?? 2 };
}

/**
 * The sign a figure is written with, and whether that sign stands away from the figure. Both are the source's own
 * answer, read off what `Intl` formats: "€26.18" has nothing between them, "CHF 26.18" and "F CFA 17,172" have a
 * space. Nothing here decides how a currency is written; it reads how it is written.
 */
export function markOf(code: string): Readonly<{ sign: string; gap: string }> {
  const parts = new Intl.NumberFormat(LOCALE, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(1);
  const at = parts.findIndex((part) => part.type === "currency");
  const sign = at >= 0 ? parts[at].value : code;
  const between = at >= 0 && parts[at + 1]?.type === "literal" ? parts[at + 1].value : "";
  return { sign, gap: between.trim() === "" ? between : "" };
}

/** A figure in a currency, grouped and with that currency's own decimals, and no sign: the sign is drawn beside it. */
export function figureIn(amount: number, code: string): string {
  const { decimals } = currencyOf(code);
  return amount.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** How many of a currency one dollar buys, through the euro, which is the unit the file is written in. */
export function perDollar(code: string, rates: Rates | undefined): number | undefined {
  if (code === "USD") return 1;
  const perEuro = rates?.eurPer[code];
  if (!rates || perEuro === undefined || !Number.isFinite(perEuro) || perEuro <= 0) return undefined;
  return perEuro * rates.eurPerUsd;
}

/**
 * The currencies offered: what somebody can be paid in, that we can also convert into. Sorted by name, because that
 * is how a person reads a list, and the code is what the screen compares.
 */
export function offeredCurrencies(payable: readonly string[] | null, rates: Rates | undefined): readonly string[] {
  if (!payable || payable.length === 0 || !rates) return CURRENCIES_WHEN_SILENT;
  const offered = payable.filter((code) => isCurrencyCode(code) && !NOT_OFFERED.has(code) && perDollar(code, rates) !== undefined);
  // The dollar is what the chain holds, so it is offered whatever a rail says about paying it out.
  if (!offered.includes("USD")) offered.push("USD");
  if (offered.length < CURRENCIES_WHEN_SILENT.length) return CURRENCIES_WHEN_SILENT;
  return offered.sort((left, right) => currencyOf(left).name.localeCompare(currencyOf(right).name, LOCALE));
}
