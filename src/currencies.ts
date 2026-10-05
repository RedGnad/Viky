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

/** The shape of a currency a screen draws: the code, its sign, its name, what it counts in, and which side of a figure its sign stands on. */
export type Currency = Readonly<{ code: string; sign: string; name: string; decimals: number; after: boolean }>;

const LOCALE = "en-GB";

/** A space a line never breaks at: between the thousands of a franc figure, and between that figure and its letters. */
export const NO_BREAK = "\u00a0";

/**
 * How the two CFA francs are written where they are spent, and what they are called (the founder, 5 Oct 2026). The
 * one exception to "asked of `Intl`", written down because `Intl`'s answer is not how they are written.
 *
 * `Intl` gives "F CFA 5,000" for one and "FCFA 5,000" for the other, the letters in front, and names them "West
 * African CFA Franc" and "Central African CFA Franc": in a list sorted by name the first stood on the last line,
 * after the US dollar, and the founder took it for gone. The people who count in them read "5 000 FCFA", the letters
 * after the figure and its thousands a space apart: Orange Money's own price list in Côte d'Ivoire ("100 FCFA",
 * "5000 FCFA") and Wave's terms there ("(200 000) FCFA"), both read that day, and neither says XOF or XAF anywhere.
 * So both are written "FCFA" after the figure, and both are called "CFA franc".
 *
 * One name for the two, and one line in the list (`asRead`; the founder, 5 Oct 2026, the same day: "since the two are
 * at the same rate, is it really useful to have both?"). They are two currencies, West Africa's and Central
 * Africa's, and a note of one is not taken in the other's countries; but here a currency is only what amounts are
 * read in, and the two read alike to the franc: the same letters and the same figure, both fixed to the euro at the
 * same parity. Where money is paid out, the currency is the country's own and never this choice (src/switch.ts,
 * src/phone-order.ts). Named apart, "(West Africa)" and "(Central Africa)" also took a second line on a phone.
 */
const WRITTEN_AFTER: Readonly<Record<string, Readonly<{ sign: string; name: string }>>> = {
  XOF: { sign: "FCFA", name: "CFA franc" },
  XAF: { sign: "FCFA", name: "CFA franc" },
};

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
 * table: "$", "€", "₹". Several currencies share a sign, which is why a list never shows one alone. The two CFA
 * francs are the exception written above.
 */
export function currencyOf(code: string): Currency {
  const written = WRITTEN_AFTER[code];
  // A franc has no subunit in use: it is counted whole.
  if (written) return { code, sign: written.sign, name: written.name, decimals: 0, after: true };
  const format = new Intl.NumberFormat(LOCALE, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" });
  const sign = format.formatToParts(1).find((part) => part.type === "currency")?.value ?? code;
  let name = code;
  try {
    name = new Intl.DisplayNames([LOCALE], { type: "currency" }).of(code) ?? code;
  } catch {
    // A runtime without the currency names says the code, which is still true.
  }
  return { code, sign, name, decimals: format.resolvedOptions().maximumFractionDigits ?? 2, after: false };
}

/**
 * The sign a figure is written with, whether it stands away from the figure, and on which side. Read off what `Intl`
 * formats, "€26.18" with nothing between them and "CHF 26.18" with a space, but for the francs written after their
 * figure (`WRITTEN_AFTER`). On a control that opens the list of currencies the sign keeps its place in front whatever
 * the currency (the founder, 21 Sep 2026: a control keeps its place); in a written amount it stands where `after` says.
 */
export function markOf(code: string): Readonly<{ sign: string; gap: string; after: boolean }> {
  const written = WRITTEN_AFTER[code];
  if (written) return { sign: written.sign, gap: NO_BREAK, after: true };
  const parts = new Intl.NumberFormat(LOCALE, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(1);
  const at = parts.findIndex((part) => part.type === "currency");
  const sign = at >= 0 ? parts[at].value : code;
  const between = at >= 0 && parts[at + 1]?.type === "literal" ? parts[at + 1].value : "";
  return { sign, gap: between.trim() === "" ? between : "", after: false };
}

/**
 * A figure in a currency, grouped and with that currency's own decimals, and no sign: the sign is drawn beside it.
 * A franc figure keeps its thousands a space apart, a space no line breaks at.
 */
export function figureIn(amount: number, code: string): string {
  const { decimals, after } = currencyOf(code);
  const figure = amount.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return after ? figure.replace(/,/g, NO_BREAK) : figure;
}

/** A figure with its currency's sign, each on its own side: "€26.18", "CHF 26.18", "5 000 FCFA". */
export function written(figure: string, code: string): string {
  const { sign, gap, after } = markOf(code);
  return after ? `${figure}${gap}${sign}` : `${sign}${gap}${figure}`;
}

/** An amount as it is written in its currency: grouped, with its decimals and its sign. */
export function amountIn(amount: number, code: string): string {
  return written(figureIn(amount, code), code);
}

/**
 * What a currency is called beside a figure when no sign is drawn: its letters where it is written by them ("FCFA"),
 * its code otherwise ("EUR"), which is how a payout service's own page names what it pays in.
 */
export function lettersOf(code: string): string {
  return WRITTEN_AFTER[code]?.sign ?? code;
}

/**
 * An amount a payout service names in its own currency, as a line of a screen says it: "20 EUR" by its code, grouped
 * in English, and a franc amount as francs are written, "5 000 FCFA".
 */
export function amountByItsLetters(amount: number, code: string): string {
  if (WRITTEN_AFTER[code]) return amountIn(amount, code);
  return `${new Intl.NumberFormat("en-US").format(amount)} ${code}`;
}

/**
 * The currencies of a list as a person reads them, one line each: currencies that read alike, by the same name, the
 * same sign and the same figure, stand on one line. That is the two CFA francs and nothing else, since nothing else
 * shares a name; and it holds only while their rates agree, which is asked of the day's rates rather than assumed.
 * Within a line the codes keep the order they are written down in above, West Africa's first.
 */
export function asRead(offered: readonly string[], rates: Rates | undefined): readonly (readonly string[])[] {
  const lines = new Map<string, string[]>();
  for (const code of offered) {
    const { name, sign } = currencyOf(code);
    const reading = `${name}|${sign}|${rates ? (perDollar(code, rates) ?? code) : ""}`;
    lines.set(reading, [...(lines.get(reading) ?? []), code]);
  }
  const written = Object.keys(WRITTEN_AFTER);
  return [...lines.values()].map((codes) => (codes.length > 1 ? [...codes].sort((left, right) => written.indexOf(left) - written.indexOf(right)) : codes));
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
