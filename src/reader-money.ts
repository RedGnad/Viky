import { cookies, headers } from "next/headers";
import { offeredCurrencies } from "./currencies";
import { CURRENCY_COOKIE, isDisplayCurrency, proposedCurrency, type DisplayCurrency } from "./display-currency";
import { loadPreferences } from "./preferences-store";
import { cardRailCurrencies, euroRailCurrencies } from "./rail-availability";
import { currentRates, ratesUsable, type Rates } from "./rates";

/**
 * What the money on a screen needs before anything is painted, decided on the server (D160).
 *
 * The card used to be drawn for nobody and corrected in the browser: thirty dollars, in dollars, then the reader's
 * own currency a few hundred milliseconds later. Yesterday's answer was to hide the figures until they had settled,
 * which is how the founder came to see a card with a hole in it. The answer is neither: the server is told the same
 * three things the browser knows, so it prints the right figure the first time.
 *
 * The currency comes from the account when one signed in, then from the cookie this device wrote, when somebody
 * pressed the key or when a first proposal was kept, then from a proposal: the country the connection comes from, and
 * the language the browser asks pages in where the connection says nothing. The rate is read here rather than fetched: `currentRates` keeps it for an hour, and the source publishes
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
  /** Whether the currency is a proposal made now, from the connection or the language: the device then keeps it. */
  proposed: boolean;
  rates: Rates | null;
}>;

/** The first language tag of an `Accept-Language` header: "fr-FR,fr;q=0.9" gives "fr-FR". */
export function firstLanguageTag(header: string | null): string | undefined {
  const first = (header ?? "").split(",")[0]?.split(";")[0]?.trim();
  return first && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(first) ? first : undefined;
}

/**
 * The currency, from the strongest thing the server knows to the weakest: what the account chose, what this device
 * kept, then a proposal, from the connection's country and then the language's region. Unknown is the dollar, as it
 * always was. `proposed` says the answer is a proposal made now, which the device then keeps (the founder, 1 Oct 2026).
 */
export function currencyFor(
  input: Readonly<{ account: DisplayCurrency | null; kept: string | undefined; country?: string | null; language: string | undefined; mayRead?: (code: string) => boolean }>,
): Readonly<{ currency: DisplayCurrency; decided: boolean; proposed: boolean }> {
  if (input.account) return { currency: input.account, decided: true, proposed: false };
  if (isDisplayCurrency(input.kept)) return { currency: input.kept, decided: true, proposed: false };
  const proposal = proposedCurrency({ country: input.country, language: input.language }, input.mayRead);
  return { ...proposal, proposed: proposal.decided };
}

/** How long the rails are waited for before a proposal is made from the three currencies the product was built on. */
const RAILS_WAIT_MS = 1_500;

/** The currencies offered now, for a proposal: what the rails pay in, that the rate file converts. Never slower than the wait. */
async function offeredNow(rates: Rates | undefined): Promise<ReadonlySet<string>> {
  const silent = new Promise<null>((resolve) => setTimeout(() => resolve(null), RAILS_WAIT_MS));
  const asked = Promise.all([euroRailCurrencies(), cardRailCurrencies()]).then(
    ([euro, card]) => (euro || card ? [...new Set([...(euro ?? []), ...(card ?? [])])] : null),
    () => null,
  );
  return new Set(offeredCurrencies(await Promise.race([asked, silent]), rates));
}

/** The country the connection comes from, as the platform reads it: two letters, or nothing off the platform. */
const connectionCountry = (value: string | null): string | null => (value && /^[A-Za-z]{2}$/.test(value.trim()) && value.trim().toUpperCase() !== "XX" ? value.trim().toUpperCase() : null);

export async function moneyForTheReader(account: string | undefined): Promise<ReaderMoney> {
  const [store, sent] = await Promise.all([cookies(), headers()]);
  const chosen = account ? await loadPreferences(account).then((kept) => kept.displayCurrency).catch(() => null) : null;
  const kept = store.get(CURRENCY_COOKIE)?.value;
  // A rate that cannot be read, or has not been published for three days, is not a reason to fail a page: every
  // figure falls back to the dollar and says so. Whether it may be used is decided here, once, rather than again in
  // every screen: a browser has no business asking what time it is before it may print a figure the server sent.
  const rates = await currentRates().catch(() => undefined);
  const usable = ratesUsable(rates, Date.now()) ? rates : undefined;
  // What is offered is asked only when a proposal is about to be made: an account's choice and a device's kept
  // currency need nothing of the rails.
  const offered = chosen || isDisplayCurrency(kept) ? null : await offeredNow(usable);
  const read = currencyFor({
    account: chosen,
    kept,
    country: connectionCountry(sent.get("x-vercel-ip-country")),
    language: firstLanguageTag(sent.get("accept-language")),
    mayRead: offered ? (code) => offered.has(code) : undefined,
  });
  return { ...read, rates: usable ?? null };
}

/**
 * The currency a person is reading in as a request arrives, for a route: the same decision the page was drawn with,
 * and nothing of the rates. It is what a gift keeps of its funder when it is made.
 */
export async function readingCurrency(account: string | undefined): Promise<DisplayCurrency> {
  return (await moneyForTheReader(account)).currency;
}
