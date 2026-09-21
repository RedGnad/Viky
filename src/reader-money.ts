import { cookies, headers } from "next/headers";
import { CURRENCY_COOKIE, isDisplayCurrency, proposedDisplayCurrency, regionOf, type DisplayCurrency } from "./display-currency";
import { loadPreferences } from "./preferences-store";
import { currentRates, ratesUsable, type Rates } from "./rates";

/**
 * What the money on a screen needs before anything is painted, decided on the server (D160).
 *
 * The card used to be drawn for nobody and corrected in the browser: thirty dollars, in dollars, then the reader's
 * own currency a few hundred milliseconds later. Yesterday's answer was to hide the figures until they had settled,
 * which is how the founder came to see a card with a hole in it. The answer is neither: the server is told the same
 * three things the browser knows, so it prints the right figure the first time.
 *
 * The currency comes from the account when one signed in, then from the cookie this device wrote when somebody
 * pressed the key, then from the language the browser asks pages in, which is what the browser itself proposes
 * from. The rate is read here rather than fetched: `currentRates` keeps it for an hour, and the source publishes
 * once a working day.
 */

export type ReaderMoney = Readonly<{
  currency: DisplayCurrency;
  /**
   * Whether the currency was known rather than assumed: the account chose it, this device wrote it down, or the
   * request said which country its language belongs to. When it was assumed, the browser may know better (its own
   * language tag carries a country where `Accept-Language` sometimes does not) and the screens let it say so.
   */
  decided: boolean;
  rates: Rates | null;
}>;

/** The first language tag of an `Accept-Language` header: "fr-FR,fr;q=0.9" gives "fr-FR". */
export function firstLanguageTag(header: string | null): string | undefined {
  const first = (header ?? "").split(",")[0]?.split(";")[0]?.trim();
  return first && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(first) ? first : undefined;
}

/** The currency, from the strongest thing the server knows to the weakest. Unknown is the dollar, as it always was. */
export function currencyFor(
  input: Readonly<{ account: DisplayCurrency | null; kept: string | undefined; language: string | undefined }>,
): Readonly<{ currency: DisplayCurrency; decided: boolean }> {
  if (input.account) return { currency: input.account, decided: true };
  if (isDisplayCurrency(input.kept)) return { currency: input.kept, decided: true };
  return { currency: proposedDisplayCurrency(input.language), decided: regionOf(input.language) !== undefined };
}

export async function moneyForTheReader(account: string | undefined): Promise<ReaderMoney> {
  const [store, sent] = await Promise.all([cookies(), headers()]);
  const chosen = account ? await loadPreferences(account).then((kept) => kept.displayCurrency).catch(() => null) : null;
  const read = currencyFor({ account: chosen, kept: store.get(CURRENCY_COOKIE)?.value, language: firstLanguageTag(sent.get("accept-language")) });
  // A rate that cannot be read, or has not been published for three days, is not a reason to fail a page: every
  // figure falls back to the dollar and says so. Whether it may be used is decided here, once, rather than again in
  // every screen: a browser has no business asking what time it is before it may print a figure the server sent.
  const rates = await currentRates().catch(() => undefined);
  return { ...read, rates: ratesUsable(rates, Date.now()) ? rates : null };
}
