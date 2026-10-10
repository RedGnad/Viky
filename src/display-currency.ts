import type { Rates } from "./rates";
import { PRODUCT_LOCALE } from "./moments";
import { amountIn, currencyOf, figureIn, isCurrencyCode, markOf, NO_BREAK, NOT_OFFERED, perDollar } from "./currencies";
import { formatAusd } from "./gift-reader";

/**
 * One display currency per account, and how a dollar figure is said in it.
 *
 * The gift stays in dollars on chain. The person reads it in the currency their device proposes, never asked
 * by a question, and may change it on the account page (decision 1 of the design pass, 17 Sep 2026, after
 * PayPal's primary currency: one per account, proposed, changeable). Every converted figure carries "about" and
 * the date of the rate, and the dollar stays readable beside it wherever a gesture is irreversible.
 *
 * The device gives a language tag, not a country: `fr-FR` names France, `fr` names nobody. So the country the
 * connection comes from proposes first, and the language's region where the connection says nothing; with neither the
 * dollar shows, which is the honest default rather than a guess. The first proposal is kept on the device, and written
 * on the account when one is made, so it does not change under a person who travels (the founder, 1 Oct 2026).
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

/** The six states of the Central African monetary union, whose franc the BEAC issues, fixed to the euro like the BCEAO's. */
const CENTRAL_CFA_FRANC_AREA: ReadonlySet<string> = new Set(["CM", "CF", "TD", "CG", "GQ", "GA"]);

/** Four states that use the euro by a monetary agreement with the Union, and two that use it without one. */
const EURO_BY_AGREEMENT: ReadonlySet<string> = new Set(["AD", "MC", "SM", "VA", "ME", "XK"]);

/**
 * The currency a country's own law names, for the countries whose currency Viky could offer: those in the central
 * bank's daily file and the two CFA francs (src/currencies.ts). A fact of each country, changed by law and years
 * apart, like the euro area above; whether the currency is offered today is not written here, it is asked.
 */
const OWN_CURRENCY: Readonly<Record<string, string>> = {
  AU: "AUD", BR: "BRL", CA: "CAD", CH: "CHF", LI: "CHF", CZ: "CZK", DK: "DKK", FO: "DKK", GL: "DKK", GB: "GBP", GG: "GBP", IM: "GBP", JE: "GBP",
  HK: "HKD", HU: "HUF", ID: "IDR", IN: "INR", IS: "ISK", JP: "JPY", KR: "KRW", MX: "MXN", MY: "MYR", NO: "NOK", NZ: "NZD", PH: "PHP", PL: "PLN",
  RO: "RON", SE: "SEK", SG: "SGD", TH: "THB", TR: "TRY", US: "USD", ZA: "ZAR",
};

/** The currency of a country, by its two letters, or nothing for a country whose currency Viky could not offer. */
export function currencyOfCountry(country: string | null | undefined): DisplayCurrency | undefined {
  const code = country?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return undefined;
  if (EURO_AREA.has(code) || EURO_BY_AGREEMENT.has(code)) return "EUR";
  if (CFA_FRANC_AREA.has(code)) return "XOF";
  if (CENTRAL_CFA_FRANC_AREA.has(code)) return "XAF";
  return OWN_CURRENCY[code];
}

/** The region of a language tag, upper case, or nothing: "fr-FR" gives FR, "fr" gives nothing. */
export function regionOf(languageTag: string | undefined): string | undefined {
  if (!languageTag) return undefined;
  const parts = languageTag.trim().split(/[-_]/);
  const region = parts.slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
  return region?.toUpperCase();
}

/**
 * What is proposed, never asked (the founder, 1 Oct 2026): the currency of the country the connection comes from,
 * and where that is not known, of the region the device's language names. Measured in production before this:
 * "fr-FR" and "en-FR" read in euros, but "fr" alone, "en-US" and "en-GB" read in dollars in France, because a language
 * is not a place. The two may disagree, a phone in English in Dakar: the connection decides and nothing is asked.
 *
 * A country whose currency is not offered reads dollars: `mayRead` says which are, asked of the rails and the rate
 * file by whoever calls this. `decided` says a place was known at all; without one the dollar is an assumption, and a
 * device that knows better may say so.
 */
export function proposedCurrency(
  signals: Readonly<{ country?: string | null; language?: string }>,
  mayRead: (code: string) => boolean = isDisplayCurrency,
): Readonly<{ currency: DisplayCurrency; decided: boolean }> {
  const fromConnection = signals.country?.trim().toUpperCase();
  const place = fromConnection && /^[A-Z]{2}$/.test(fromConnection) ? fromConnection : regionOf(signals.language);
  if (!place) return { currency: "USD", decided: false };
  const own = currencyOfCountry(place);
  return { currency: own && mayRead(own) ? own : "USD", decided: true };
}

/** What the device's language alone proposes. Dollars whenever it names no place, or a place whose currency is not offered. */
export function proposedDisplayCurrency(languageTag: string | undefined, mayRead?: (code: string) => boolean): DisplayCurrency {
  return proposedCurrency({ language: languageTag }, mayRead).currency;
}

/** A currency somebody may read in: one the runtime knows, and not one the product does not offer (src/currencies.ts). */
export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return isCurrencyCode(value) && !NOT_OFFERED.has(value);
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
 * Euros keep two decimals. The CFA franc has no subunit in use, so it is a whole number, written as the people who
 * count in it write it: its thousands a space apart and its letters after it (src/currencies.ts, 5 Oct 2026).
 */
export function aboutInDisplayCurrency(units: bigint, currency: DisplayCurrency, rates: Rates | undefined): string | undefined {
  const rate = perDollar(currency, rates);
  if (currency === "USD" || !rates || rate === undefined) return undefined;
  const amount = (Number(units) / DOLLAR_UNITS) * rate;
  // By its code where nothing else names it ("9.54 EUR"), and a franc amount as francs are written ("6 249 FCFA").
  return `about ${currencyOf(currency).after ? amountIn(amount, currency) : `${figureIn(amount, currency)} ${currency}`} (rate of ${rateDateInWords(rates.date)})`;
}

/** The one line a screen prints when it wanted to convert and could not. */
export const SHOWN_IN_DOLLARS = "Shown in dollars: the exchange rate could not be read today.";

/**
 * The amount at display size, which is the one thing a person opens Viky to read (the art direction brief of 17 Sep
 * 2026, section 8): at that size, the symbol and the number and nothing else, on one line. "about", the rate's date and
 * the dollars go in the caption under it, which `aboutInDisplayCurrency` and the screen's own words carry.
 *
 * The CFA franc has no symbol in use, so its letters follow the number; it has no subunit either, so it is whole.
 */
export type DisplayFigure = Readonly<{
  /** What the display size shows, "€9.54" or "6 000 FCFA". */
  text: string;
  /** The number itself, so an amount that changed can count up to it. */
  value: number;
  /** What stands in front of the number, what stands after it, and what parts its thousands: the pieces a count-up writes each figure with. */
  symbol: string;
  decimals: number;
  after: string;
  thousands: string;
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
  const mark = markOf(code);
  return {
    // A sign in front stands against its figure at this size, as it always has; the franc's letters follow theirs.
    text: mark.after ? amountIn(value, code) : `${money.sign}${figureIn(value, code)}`,
    value,
    symbol: mark.after ? "" : money.sign,
    decimals: money.decimals,
    after: mark.after ? `${mark.gap}${mark.sign}` : "",
    thousands: mark.after ? NO_BREAK : ",",
    rateDate: code === "USD" ? undefined : rateDateInWords(rates!.date),
  };
}

/**
 * An amount led by the reader's own currency, the exact dollars under it (the founder, 29 Sep 2026): the figure a person
 * reads first is the one they count in, with "about" before it, because the account holds dollars and a conversion is
 * never exact; the dollars are the caption, which is what is really held and what an irreversible gesture moves.
 * When the reader counts in dollars, or no usable rate exists, the dollars lead alone and nothing is "about".
 */
export type LedAmount = Readonly<{
  /** The figure a person reads first, with its sign: "€7.53", "4 940 FCFA", or the dollars themselves. */
  lead: string;
  /** Whether `lead` is a conversion, so the screen says "about" before it and the exact dollars under it. */
  converted: boolean;
  /** The dollars held, exact to the cent: "$8.57". */
  exact: string;
  /** The rate's day in words, when converted. */
  rateDate: string | undefined;
}>;

export function ledAmount(units: bigint, currency: DisplayCurrency, rates: Rates | undefined): LedAmount {
  const figure = figureInDisplayCurrency(units, currency, rates);
  const exact = formatAusd(units);
  if (!figure.rateDate) return { lead: exact, converted: false, exact, rateDate: undefined };
  // Written as its currency is: "€7.53" with nothing between, "4 940 FCFA" with its letters after it.
  return { lead: amountIn(figure.value, currency), converted: true, exact, rateDate: figure.rateDate };
}

/** A led amount inside a sentence: "about €21.67" when converted, the exact dollars otherwise; "About" to open one. */
export function spokenAmount(amount: LedAmount, first = false): string {
  return amount.converted ? `${first ? "About" : "about"} ${amount.lead}` : amount.lead;
}

/**
 * An amount as a screen shows it, with the count of the smallest pieces its figure is written in: 1529 for "€15.29",
 * 8766 for "8 766 FCFA", and the dollar cut to the cent where nothing converts. The pieces are read from the figure
 * itself, so they are the ones that are printed and no others.
 */
export type ShownAmount = Readonly<{ text: string; pieces: number; code: string }>;

export function amountAsShown(units: bigint, currency: DisplayCurrency, rates: Rates | undefined): ShownAmount {
  const led = ledAmount(units, currency, rates);
  if (!led.converted) return { text: led.lead, pieces: Number(units / 10_000n), code: "USD" };
  const figure = figureInDisplayCurrency(units, currency, rates);
  return { text: led.lead, pieces: Number(figureIn(figure.value, currency).replace(/\D/g, "")), code: currency };
}

/** So many of a currency's smallest pieces, written as that currency is: the dollar as the balance writes it. */
function piecesInWords(pieces: number, code: string): string {
  return code === "USD" ? formatAusd(BigInt(pieces) * 10_000n) : amountIn(pieces / 10 ** currencyOf(code).decimals, code);
}

/**
 * The figures of a screen add up as they are shown (the founder, 10 Oct 2026): what is left of one amount once another
 * leaves it is the first as it is shown less the second as it is shown, never a third figure worked out from the units
 * and rounded on its own, which read a cent under the two it stood beside. Never under nothing.
 */
export function leftAsShown(of: ShownAmount, less: ShownAmount): string {
  return piecesInWords(Math.max(0, of.pieces - less.pieces), of.code);
}

/**
 * What an amount is over a face value written in the currency the amount is shown in, so that "a €10 card and €0.61
 * of fees" add up to the €10.61 above them: the fee a rail names is one part of what a thing costs over its face
 * value, and the rate it was changed at is the other. `null` where nothing is over, and `undefined` where the face
 * value is in another currency, which no sum crosses: the caller then says the fee it knows.
 */
export function overFaceAsShown(amount: ShownAmount, face: number, faceCurrency: string): string | null | undefined {
  if (faceCurrency !== amount.code || !Number.isFinite(face)) return undefined;
  const over = amount.pieces - Math.round(face * 10 ** currencyOf(amount.code).decimals);
  return over > 0 ? piecesInWords(over, amount.code) : null;
}

/**
 * How a screen that spends the balance says the account's money (the founder, 10 Oct 2026): an amount as the balance
 * says its own, what stays of that balance once the amount leaves it, and the amount with its pieces, for a sum made
 * on the figures themselves.
 */
export type SpendMoney = Readonly<{ say: (units: bigint) => string; stays: (units: bigint) => string; shown: (units: bigint) => ShownAmount }>;

export function spendMoney(balanceUnits: bigint, currency: DisplayCurrency, rates: Rates | undefined): SpendMoney {
  const shown = (units: bigint) => amountAsShown(units, currency, rates);
  return { say: (units) => shown(units).text, stays: (units) => leftAsShown(shown(balanceUnits), shown(units)), shown };
}
