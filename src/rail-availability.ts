import { countryCode, type RailReach } from "./rail-country";
import { MERCURYO_CLOSED_IN, swapperIntegratorId, WAY_IN_CHAIN_COIN, WAY_IN_EMBEDDED, WAY_IN_GIFT_COIN, WAY_OUT_CARD, WAY_OUT_EURO, WAYS_OUT, type WayOut } from "./rails";

/**
 * Whether a rail serves a country, asked of that rail at the moment it matters (R1). Server only.
 *
 * No country list is written here, and none is copied from a rail into the repository. Each service publishes what it
 * serves and changes it without telling anybody: one of these lists changed on 15 Sep 2026. So the question is asked
 * again, live, and the answer lives for a few minutes at most.
 *
 * What was measured on 18 Sep 2026, and what these two reads mean:
 *
 * - The euro rail publishes its payout methods with the countries each one covers, with no key and no account:
 *   `GET https://api.ramp.network/api/host-api/v3/payout-methods` answered SEPA in 35 countries (fr among them, not sn,
 *   not ci, not us), CARD in 119 (fr and gb, not sn, not ci, not us), an American bank transfer in us, PIX in br and
 *   SPEI in mx. A country in none of them is a country it pays nobody in.
 * - The card rail publishes what it will not sell, per coin and per country:
 *   `GET https://api.mercuryo.io/v1.6/lib/currencies` carries, for `{currency: "MON", network: "MONAD"}`,
 *   `restricted_countries_offramp: ["gb"]` and `restricted_countries_onramp: ["gb"]`. Its other limit, that it pays no
 *   card in France, the rest of the EEA or the United States, is published in its help centre and not in this answer,
 *   so it stays where it is: written in that rail's own conditions, on its card, with its date.
 *
 * A read that fails answers "unknown", never "does not serve": a service we cannot reach must not cost somebody the
 * way out they actually have.
 */

const RAMP_PAYOUT_METHODS = "https://api.ramp.network/api/host-api/v3/payout-methods";
/**
 * The countries the euro rail sells in, published without a key: `GET /host-api/countries` in Ramp's REST API v1
 * reference (docs.rampnetwork.com/rest-api-reference), one `CountryInfo` per country with `code`, `name`,
 * `cardPaymentsEnabled` and `mainCurrencyCode`. Read 25 Sep 2026: 107 countries, fr, de, be, ch, gb and us among
 * them, sn and ci absent, `cardPaymentsEnabled` true for every one. This is the answer D101 said could not be read:
 * it is the buying list, not the payout one, and it needs no key.
 */
const RAMP_COUNTRIES = "https://api.ramp.network/api/host-api/countries";
/** The euro rail's asset list, where what a gift holds is `MONAD_AUSD`, `enabled` and not `hidden` (D101, D125). */
const RAMP_ASSETS = "https://api.ramp.network/api/host-api/v3/assets?currencyCode=EUR";
const MERCURYO_CURRENCIES = "https://api.mercuryo.io/v1.6/lib/currencies";
/**
 * The route Swapper's own widget asks its card quotes of, with no key (read in its script, 1 Oct 2026): a country's
 * card services answer what 20 EUR buys, or an empty list where none of them sells there. What the card buys is what
 * the widget buys for a gift on Monad, USDC on Polygon, which Swapper then changes (`WAY_IN_EMBEDDED`).
 */
const SWAPPER_QUOTE = "https://swapper.finance/api/onramp/quote";

/** Long enough that a screen and its reload ask once, short enough that a change is met within minutes. */
const HELD_FOR_MS = 10 * 60 * 1_000;
/** A read that failed is held far shorter: one bad minute at a service must not leave every screen guessing for ten. */
const FAILURE_HELD_FOR_MS = 30 * 1_000;

type Held<T> = { at: number; value: T };
let rampCountries: Held<readonly string[] | null> | undefined;
let rampMethods: Held<readonly PayoutMethod[] | null> | undefined;
let cardRestricted: Held<readonly string[] | null> | undefined;
let rampCurrencies: Held<readonly string[] | null> | undefined;
let cardCurrencies: Held<readonly string[] | null> | undefined;
let rampBuyCountries: Held<readonly string[] | null> | undefined;
let rampSellsGiftCoin: Held<boolean | null> | undefined;
const swapperQuoted = new Map<string, Held<boolean | null>>();

/** Held only while it is both recent and not from the future: a clock that moved must not freeze an old answer. */
function stillGood(held: Held<unknown> | undefined, now: number): boolean {
  if (held === undefined || held.at > now) return false;
  return now - held.at < (held.value === null ? FAILURE_HELD_FOR_MS : HELD_FOR_MS);
}

async function readJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** Every country the euro rail pays in, by any of its methods, or nothing when its list could not be read. */
export async function euroRailCountries(now = Date.now()): Promise<readonly string[] | null> {
  if (stillGood(rampCountries, now)) return rampCountries!.value;
  const body = await readJson(RAMP_PAYOUT_METHODS);
  const methods = Array.isArray(body) ? body : null;
  const countries = methods
    ? methods.flatMap((method) => {
        const list = (method as { countries?: unknown }).countries;
        return Array.isArray(list) ? list.map((one) => countryCode(String(one))).filter((one): one is string => one !== null) : [];
      })
    : null;
  const value = countries && countries.length > 0 ? Array.from(new Set(countries)) : null;
  rampCountries = { at: now, value };
  return value;
}

/**
 * Every currency the two rails can put money into somebody's hands in, asked of them rather than written here
 * (D152, the rule of D39 applied to what a screen reads in). The euro rail publishes it per payout method, the card
 * rail as one list. Either one silent is `null`, and the caller decides what to do with half an answer.
 */
export async function euroRailCurrencies(now = Date.now()): Promise<readonly string[] | null> {
  if (stillGood(rampCurrencies, now)) return rampCurrencies!.value;
  const body = await readJson(RAMP_PAYOUT_METHODS);
  const methods = Array.isArray(body) ? body : null;
  const codes = methods
    ? methods.flatMap((method) => {
        const list = (method as { currencies?: unknown }).currencies;
        return Array.isArray(list) ? list.map((one) => String(one).toUpperCase()).filter((one) => /^[A-Z]{3}$/.test(one)) : [];
      })
    : null;
  const value = codes && codes.length > 0 ? Array.from(new Set(codes)) : null;
  rampCurrencies = { at: now, value };
  return value;
}

export async function cardRailCurrencies(now = Date.now()): Promise<readonly string[] | null> {
  if (stillGood(cardCurrencies, now)) return cardCurrencies!.value;
  const body = await readJson(MERCURYO_CURRENCIES);
  const fiat = (body as { data?: { fiat?: unknown } } | null)?.data?.fiat;
  const codes = Array.isArray(fiat) ? fiat.map((one) => String(one).toUpperCase()).filter((one) => /^[A-Z]{3}$/.test(one)) : null;
  const value = codes && codes.length > 0 ? Array.from(new Set(codes)) : null;
  cardCurrencies = { at: now, value };
  return value;
}

/** Every country the euro rail sells in, from its own list, or nothing when that list could not be read. */
export async function euroRailBuyCountries(now = Date.now()): Promise<readonly string[] | null> {
  if (stillGood(rampBuyCountries, now)) return rampBuyCountries!.value;
  const body = await readJson(RAMP_COUNTRIES);
  const countries = Array.isArray(body)
    ? body
        .filter((one) => (one as { cardPaymentsEnabled?: unknown }).cardPaymentsEnabled !== false)
        .map((one) => countryCode(String((one as { code?: unknown }).code)))
        .filter((one): one is string => one !== null)
    : null;
  const value = countries && countries.length > 0 ? Array.from(new Set(countries)) : null;
  rampBuyCountries = { at: now, value };
  return value;
}

/**
 * Whether the euro rail is selling what a gift holds just now: its asset list carries the coin on the chain, enabled
 * and not hidden. False is that rail's own pause, true is its own yes, and nothing means the list could not be read.
 */
export async function euroRailSellsGiftCoin(now = Date.now()): Promise<boolean | null> {
  if (stillGood(rampSellsGiftCoin, now)) return rampSellsGiftCoin!.value;
  const body = await readJson(RAMP_ASSETS);
  const assets = (body as { assets?: unknown } | null)?.assets;
  const value = Array.isArray(assets)
    ? assets.some((one) => {
        const asset = one as { symbol?: unknown; chain?: unknown; enabled?: unknown; hidden?: unknown };
        return asset.symbol === WAY_IN_GIFT_COIN.delivers.coin && String(asset.chain).toUpperCase() === WAY_IN_GIFT_COIN.delivers.network.toUpperCase() && asset.enabled === true && asset.hidden !== true;
      })
    : null;
  rampSellsGiftCoin = { at: now, value };
  return value;
}

/** The countries the card rail will not sell the chain's coin in, or nothing when its list could not be read. */
export async function cardRailRestricted(now = Date.now()): Promise<readonly string[] | null> {
  if (stillGood(cardRestricted, now)) return cardRestricted!.value;
  const body = await readJson(MERCURYO_CURRENCIES);
  const currencies = (body as { data?: { config?: { crypto_currencies?: unknown } } } | null)?.data?.config?.crypto_currencies;
  const monad = Array.isArray(currencies)
    ? (currencies.find((one) => (one as { currency?: unknown }).currency === "MON" && (one as { network?: unknown }).network === "MONAD") as
        | { restricted_countries_offramp?: unknown }
        | undefined)
    : undefined;
  const list = monad?.restricted_countries_offramp;
  const value = Array.isArray(list) ? list.map((one) => countryCode(String(one))).filter((one): one is string => one !== null) : null;
  cardRestricted = { at: now, value };
  return value;
}

/** One way the bank service pays, as it publishes it: its own name for the method, its currencies, its countries. */
export type PayoutMethod = Readonly<{ name: string; currencies: readonly string[]; countries: readonly string[] }>;

/** The bank service's payout methods, from its own list, or nothing when that list could not be read. */
export async function euroRailMethods(now = Date.now()): Promise<readonly PayoutMethod[] | null> {
  if (stillGood(rampMethods, now)) return rampMethods!.value;
  const body = await readJson(RAMP_PAYOUT_METHODS);
  const value = Array.isArray(body)
    ? body.flatMap((one) => {
        const method = one as { name?: unknown; currencies?: unknown; countries?: unknown };
        if (typeof method.name !== "string" || !Array.isArray(method.currencies) || !Array.isArray(method.countries)) return [];
        return [{ name: method.name, currencies: method.currencies.map((code) => String(code).toUpperCase()), countries: method.countries.map((code) => String(code).toLowerCase()) }];
      })
    : null;
  rampMethods = { at: now, value: value && value.length > 0 ? value : null };
  return rampMethods.value;
}

/**
 * How the bank service pays in one country, by its own list (the audit of 1 Oct 2026: "a transfer in euros to your
 * IBAN" was said to an account in the United States, which it pays by an American bank transfer in dollars). A method
 * that pays a bank account comes before the card, since the card is called "Your bank" on the screen. Read 1 Oct 2026:
 * SEPA in euros in 35 countries, `AMERICAN_BANK_TRANSFER` in dollars in the United States, PIX in Brazil, SPEI in
 * Mexico, and a card in 119 countries.
 */
export function payoutMethodFor(country: string | null, methods: readonly PayoutMethod[] | null): Readonly<{ method: string; currency: string }> | null {
  const asked = countryCode(country);
  if (!asked || !methods) return null;
  const offered = methods.filter((method) => method.countries.includes(asked));
  const chosen = offered.find((method) => method.name !== "CARD") ?? offered[0];
  if (!chosen || chosen.currencies.length === 0) return null;
  // A method that pays in several currencies names none for one country: the euro when it is among them, else the first.
  const currency = chosen.currencies.length === 1 ? chosen.currencies[0] : chosen.currencies.includes("EUR") ? "EUR" : chosen.currencies[0];
  return { method: chosen.name, currency };
}

/**
 * What each way out says about that country, read live, with "unknown" whenever nothing could be read.
 *
 * The card service's own list of countries it serves nobody in comes first, as it does for adding money (the audit of
 * 1 Oct 2026): its currencies endpoint restricts selling in the United Kingdom alone, so a person in Mali was offered
 * the card, had their money changed for it, and was refused on its page.
 */
export async function reachOfWaysOut(country: string | null): Promise<Readonly<Record<string, RailReach>>> {
  const asked = countryCode(country);
  if (!asked) return Object.fromEntries(WAYS_OUT.map((way) => [way.name, "unknown" as RailReach]));
  const [euro, restricted] = await Promise.all([euroRailCountries(), cardRailRestricted()]);
  const reach: Record<string, RailReach> = {};
  reach[WAY_OUT_EURO.name] = euro === null ? "unknown" : euro.includes(asked) ? "serves" : "does-not";
  reach[WAY_OUT_CARD.name] = MERCURYO_CLOSED_IN.includes(asked) ? "does-not" : restricted === null ? "unknown" : restricted.includes(asked) ? "does-not" : "serves";
  for (const way of WAYS_OUT) reach[way.name] ??= "unknown";
  return reach;
}

/**
 * The ways in, each asked of its own rail (D101, D239):
 *
 * - The rail that sells what a gift holds publishes the countries it sells in (`RAMP_COUNTRIES`, read 25 Sep 2026)
 *   and whether it is selling that coin at all (`RAMP_ASSETS`). A country not on its list is "does-not"; a coin it has
 *   switched off is "paused", wherever the person is; a list that could not be read says nothing. D101 believed no
 *   such answer could be read without a key: its quote endpoint asks for one, its countries endpoint does not.
 * - The rail that sells the chain's coin publishes what it will not sell, per coin and per country, in the same
 *   answer as its payouts (`restricted_countries_onramp`, `["gb"]` for MON on MONAD on 18 Sep 2026).
 */
/**
 * Whether any card service behind Swapper quotes 20 EUR in this country, or nothing when its route could not be read.
 * Asked only while Swapper's id is set: without it Swapper is offered to nobody, and nothing is asked of it.
 */
export async function swapperQuotesIn(country: string, now = Date.now()): Promise<boolean | null> {
  const held = swapperQuoted.get(country);
  if (stillGood(held, now)) return held!.value;
  let value: boolean | null = null;
  try {
    const response = await fetch(SWAPPER_QUOTE, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ sourceAmount: "20", sourceCurrencyCode: "EUR", destinationCurrencyCode: "USDC_POLYGON", countryCode: country.toUpperCase(), paymentMethodType: "CREDIT_DEBIT_CARD" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const quotes = response.ok ? ((await response.json()) as { quotes?: unknown }).quotes : undefined;
    if (Array.isArray(quotes)) value = quotes.length > 0;
  } catch {
    value = null;
  }
  swapperQuoted.set(country, { at: now, value });
  return value;
}

export async function reachOfWaysIn(country: string | null): Promise<Readonly<Record<string, RailReach>>> {
  const asked = countryCode(country);
  const reach: Record<string, RailReach> = { [WAY_IN_GIFT_COIN.name]: "unknown", [WAY_IN_CHAIN_COIN.name]: "unknown" };
  if (swapperIntegratorId()) {
    const quoted = asked ? await swapperQuotesIn(asked) : null;
    reach[WAY_IN_EMBEDDED.name] = quoted === null ? "unknown" : quoted ? "serves" : "does-not";
  }
  const [countries, selling] = await Promise.all([asked ? euroRailBuyCountries() : null, euroRailSellsGiftCoin()]);
  if (asked && countries !== null) reach[WAY_IN_GIFT_COIN.name] = countries.includes(asked) ? "serves" : "does-not";
  if (reach[WAY_IN_GIFT_COIN.name] !== "does-not" && selling === false) reach[WAY_IN_GIFT_COIN.name] = "paused";
  if (!asked) return reach;
  const body = await readJson(MERCURYO_CURRENCIES);
  const currencies = (body as { data?: { config?: { crypto_currencies?: unknown } } } | null)?.data?.config?.crypto_currencies;
  const monad = Array.isArray(currencies)
    ? (currencies.find((one) => (one as { currency?: unknown }).currency === "MON" && (one as { network?: unknown }).network === "MONAD") as
        | { restricted_countries_onramp?: unknown }
        | undefined)
    : undefined;
  const list = monad?.restricted_countries_onramp;
  if (Array.isArray(list)) {
    reach[WAY_IN_CHAIN_COIN.name] = list.map((one) => countryCode(String(one))).includes(asked) ? "does-not" : "serves";
  }
  return reach;
}

export type { WayOut };
