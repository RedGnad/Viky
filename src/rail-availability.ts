import { countryCode, type RailReach } from "./rail-country";
import { WAY_IN, WAY_OUT_CARD, WAY_OUT_EURO, WAYS_OUT, type WayOut } from "./rails";

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
const MERCURYO_CURRENCIES = "https://api.mercuryo.io/v1.6/lib/currencies";

/** Long enough that a screen and its reload ask once, short enough that a change is met within minutes. */
const HELD_FOR_MS = 10 * 60 * 1_000;
/** A read that failed is held far shorter: one bad minute at a service must not leave every screen guessing for ten. */
const FAILURE_HELD_FOR_MS = 30 * 1_000;

type Held<T> = { at: number; value: T };
let rampCountries: Held<readonly string[] | null> | undefined;
let cardRestricted: Held<readonly string[] | null> | undefined;

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

/** What each way out says about that country, read live, with "unknown" whenever nothing could be read. */
export async function reachOfWaysOut(country: string | null): Promise<Readonly<Record<string, RailReach>>> {
  const asked = countryCode(country);
  if (!asked) return Object.fromEntries(WAYS_OUT.map((way) => [way.name, "unknown" as RailReach]));
  const [euro, restricted] = await Promise.all([euroRailCountries(), cardRailRestricted()]);
  const reach: Record<string, RailReach> = {};
  reach[WAY_OUT_EURO.name] = euro === null ? "unknown" : euro.includes(asked) ? "serves" : "does-not";
  reach[WAY_OUT_CARD.name] = restricted === null ? "unknown" : restricted.includes(asked) ? "does-not" : "serves";
  for (const way of WAYS_OUT) reach[way.name] ??= "unknown";
  return reach;
}

/**
 * The way in, asked the same way: the one rail that adds money publishes what it will not sell, and the payment step
 * says so rather than sending somebody to a page that will refuse them. Nothing is hidden here either.
 */
export async function reachOfWayIn(country: string | null): Promise<RailReach> {
  const asked = countryCode(country);
  if (!asked) return "unknown";
  const body = await readJson(MERCURYO_CURRENCIES);
  const currencies = (body as { data?: { config?: { crypto_currencies?: unknown } } } | null)?.data?.config?.crypto_currencies;
  const monad = Array.isArray(currencies)
    ? (currencies.find((one) => (one as { currency?: unknown }).currency === "MON" && (one as { network?: unknown }).network === "MONAD") as
        | { restricted_countries_onramp?: unknown }
        | undefined)
    : undefined;
  const list = monad?.restricted_countries_onramp;
  if (!Array.isArray(list)) return "unknown";
  return list.map((one) => countryCode(String(one))).includes(asked) ? "does-not" : "serves";
}

/** The name of the rail money is added through, so a screen can say it without importing the register twice. */
export const WAY_IN_NAME = WAY_IN.name;

export type { WayOut };
