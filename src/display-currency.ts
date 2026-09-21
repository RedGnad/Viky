import type { Rates } from "./rates";
import { PRODUCT_LOCALE } from "./moments";
import { currencyOf, figureIn, isCurrencyCode, perDollar } from "./currencies";

/**
 * One display currency per account, and how a dollar figure is said in it.
 *
 * The gift stays in dollars on chain. The person reads it in the currency their device proposes, never asked
 * by a question, and may change it on the account page (decision 1 of the design pass, 17 Sep 2026, after
 * PayPal's primary currency: one per account, proposed, changeable). Every converted figure carries "about" and
 * the date of the rate, and the dollar stays readable beside it wherever a gesture is irreversible.
 *
 * The device gives a language tag, not a country: `fr-FR` names France, `fr` names nobody. Only a tag with a
 * region proposes anything; without one the dollar shows, which is the honest default rather than a guess.
 */

/**
 * Any currency the two rails pay in and the rate file can convert into (D152, `src/currencies.ts`). It was three,
 * written here; it is thirty-one today and whatever they answer tomorrow, so what is written here is the shape of a
 * code and nothing about which ones exist.
 */
export type DisplayCurrency = string;

/**
 * The euro area, twenty-one countries since Bulgaria joined on 1 January 2026, read on the ECB's own page
 * (https://www.ecb.europa.eu/euro/changeover/bulgaria/html/index.en.html, 17 Sep 2026). A list of countries is
 * kept here, unlike in src/rails.ts, because membership of a currency changes by treaty and years apart, not by
 * a help-centre edit.
 */
const EURO_AREA: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

/**
 * The eight states of the West African Monetary Union, whose common currency the BCEAO issues, read on the
 * BCEAO's own presentation page (https://www.bceao.int/en/content/presentation-bceao, 17 Sep 2026).
 */
const CFA_FRANC_AREA: ReadonlySet<string> = new Set(["BJ", "BF", "CI", "GW", "ML", "NE", "SN", "TG"]);

/**
 * Where a device writes the currency it reads in, so the server can read it too and print the right figure in the
 * first byte (D160). A cookie rather than storage, because a cookie is the one thing a browser sends by itself.
 */
export const CURRENCY_COOKIE = "viky.currency";

/** The region of a language tag, upper case, or nothing: "fr-FR" gives FR, "fr" gives nothing. */
export function regionOf(languageTag: string | undefined): string | undefined {
  if (!languageTag) return undefined;
  const parts = languageTag.trim().split(/[-_]/);
  const region = parts.slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
  return region?.toUpperCase();
}

/** What the device proposes. Dollars whenever the device says nothing usable. */
export function proposedDisplayCurrency(languageTag: string | undefined): DisplayCurrency {
  const region = regionOf(languageTag);
  if (!region) return "USD";
  if (EURO_AREA.has(region)) return "EUR";
  if (CFA_FRANC_AREA.has(region)) return "XOF";
  return "USD";
}

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return isCurrencyCode(value);
}

/** Six decimals of a dollar coin, which is what both stablecoins carry. */
const DOLLAR_UNITS = 1_000_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "16 Sep 2026", from the ECB's "2026-09-16", written as every other date in Viky is written (the cards beside
 * it say "16 Sep 2026"). Not through the locale, which gives "Sept" and would put two conventions on one screen.
 */
export function rateDateInWords(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1] ?? ""} ${year}`.replace(/\s+/g, " ").trim();
}

/** "17 Sep 2026 at 02:05", for a confirmation: the date a person can quote, and the time in their own clock. */
export function whenInWords(atMs: number): string {
  const at = new Date(atMs);
  // The reader's own clock, in the product's one language (`PRODUCT_LOCALE`), so the server and the browser write
  // the same sentence: a time said in two languages is a page React throws away (D147).
  const time = at.toLocaleTimeString(PRODUCT_LOCALE, { hour: "numeric", minute: "2-digit" });
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()} at ${time}`;
}

/**
 * A dollar amount in the display currency, with "about" and the rate's date, or nothing when the currency is
 * the dollar itself or no usable rate exists. The caller prints the dollar figure beside it or alone.
 *
 * Euros keep two decimals. The CFA franc has no subunit in use, so it is a whole number, with English grouping
 * because the sentences around it are English.
 */
export function aboutInDisplayCurrency(units: bigint, currency: DisplayCurrency, rates: Rates | undefined): string | undefined {
  const rate = perDollar(currency, rates);
  if (currency === "USD" || !rates || rate === undefined) return undefined;
  const amount = (Number(units) / DOLLAR_UNITS) * rate;
  return `about ${figureIn(amount, currency)} ${currency} (rate of ${rateDateInWords(rates.date)})`;
}

/** The one line a screen prints when it wanted to convert and could not. */
export const SHOWN_IN_DOLLARS = "Shown in dollars: the exchange rate could not be read today.";

/**
 * The amount at display size, which is the one thing a person opens Viky to read (the art direction brief of 17 Sep
 * 2026, section 8): at that size, the symbol and the number and nothing else, on one line. "about", the rate's date and
 * the dollars go in the caption under it, which `aboutInDisplayCurrency` and the screen's own words carry.
 *
 * The CFA franc has no symbol in use, so its name follows the number; it has no subunit either, so it is whole.
 */
export type DisplayFigure = Readonly<{
  /** What the display size shows, "€9.54" or "6,000 CFA". */
  text: string;
  /** The number itself, so an amount that changed can count up to it. */
  value: number;
  symbol: string;
  decimals: number;
  after: string;
  /** Set when the figure is converted, so the caption can say "about" and name the rate's day. */
  rateDate: string | undefined;
}>;

export function figureInDisplayCurrency(units: bigint, currency: DisplayCurrency, rates: Rates | undefined): DisplayFigure {
  const dollars = Number(units) / DOLLAR_UNITS;
  const rate = perDollar(currency, rates);
  // Whatever cannot be converted is the dollar itself, which is what the chain holds and what is always true.
  const code = currency === "USD" || rate === undefined || !rates ? "USD" : currency;
  const money = currencyOf(code);
  const value = code === "USD" ? dollars : dollars * (rate ?? 1);
  return {
    text: `${money.sign}${figureIn(value, code)}`,
    value,
    symbol: money.sign,
    decimals: money.decimals,
    after: "",
    rateDate: code === "USD" ? undefined : rateDateInWords(rates!.date),
  };
}
