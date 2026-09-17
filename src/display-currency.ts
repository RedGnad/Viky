import type { Rates } from "./rates";

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

export type DisplayCurrency = "USD" | "EUR" | "XOF";

export const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = ["USD", "EUR", "XOF"];

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
  return typeof value === "string" && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
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
  // The hour as the reader's clock writes it: "5:58 AM" in English, "05:58" in French, never "05:58 AM".
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  if (currency === "USD" || !rates) return undefined;
  const dollars = Number(units) / DOLLAR_UNITS;
  const when = rateDateInWords(rates.date);
  if (currency === "EUR") {
    const euros = dollars * rates.eurPerUsd;
    return `about ${euros.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR (rate of ${when})`;
  }
  const francs = Math.round(dollars * rates.xofPerUsd);
  return `about ${francs.toLocaleString("en-GB")} CFA francs (rate of ${when})`;
}

/** The one line a screen prints when it wanted to convert and could not. */
export const SHOWN_IN_DOLLARS = "Shown in dollars: the exchange rate could not be read today.";
