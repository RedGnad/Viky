import { bitrefillConfigured, refillCountries } from "./bitrefill";
import { countryCode } from "./rail-country";
import { cardRailRestricted, euroRailCountries } from "./rail-availability";
import { CARD_PAYOUT_CLOSED } from "./use-money";

/**
 * Every country where at least one way out works (D274, the founder's decision of 27 Sep 2026): the list a person picks
 * where they live from, in Me and under "Use your money". The union of what each service publishes, read live and held
 * for a day, never copied into the repository:
 * - Ramp's payout methods and their countries (`euroRailCountries`, D96);
 * - Mercuryo's own list of countries (`GET https://api.mercuryo.io/v1.6/lib/countries`, no key, read 27 Sep 2026),
 *   less where it will not sell (`cardRailRestricted`) and where it pays no card (the EEA and the United States, D72);
 * - Bitrefill's phone top-ups (`refillCountries`), when its key is configured.
 * Server only. A service that could not be read adds nothing and is said so in `unread`.
 *
 * Mercuryo's list also carries each country's calling prefix, sent with the list, which is how a number already known
 * can propose a country in the browser (never replace one chosen; `countryOfNumber` in src/client/account-country.ts).
 */
const MERCURYO_COUNTRIES = "https://api.mercuryo.io/v1.6/lib/countries";
const HELD_FOR_MS = 24 * 60 * 60 * 1_000;
const FAILURE_HELD_FOR_MS = 5 * 60 * 1_000;

export type OutCountries = Readonly<{ countries: readonly string[]; prefixes: Readonly<Record<string, string>>; unread: readonly string[] }>;

let held: { at: number; value: OutCountries; complete: boolean } | undefined;

async function mercuryoCountries(): Promise<{ codes: readonly string[]; prefixes: Record<string, string> } | null> {
  try {
    const response = await fetch(MERCURYO_COUNTRIES, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) return null;
    const codes: string[] = [];
    const prefixes: Record<string, string> = {};
    for (const row of body.data as { code?: unknown; phone_prefix?: unknown }[]) {
      const code = countryCode(typeof row.code === "string" ? row.code : null);
      if (!code) continue;
      codes.push(code);
      if (typeof row.phone_prefix === "string" && /^\d{1,4}$/.test(row.phone_prefix)) prefixes[code] = row.phone_prefix;
    }
    return codes.length > 0 ? { codes, prefixes } : null;
  } catch {
    return null;
  }
}

export async function outCountries(now = Date.now()): Promise<OutCountries> {
  if (held && held.at <= now && now - held.at < (held.complete ? HELD_FOR_MS : FAILURE_HELD_FOR_MS)) return held.value;
  const [ramp, mercuryo, restricted, bitrefill] = await Promise.all([
    euroRailCountries(now),
    mercuryoCountries(),
    cardRailRestricted(now),
    bitrefillConfigured() ? refillCountries().catch(() => null) : Promise.resolve(null),
  ]);
  const union = new Set<string>(ramp ?? []);
  // Mercuryo's countries count only when its restrictions were read too: without them, a country it refuses could be offered.
  const refused = restricted ?? [];
  const cardRead = mercuryo !== null && restricted !== null;
  for (const code of cardRead ? mercuryo.codes : []) {
    if (!refused.includes(code) && !CARD_PAYOUT_CLOSED.includes(code)) union.add(code);
  }
  for (const code of bitrefill ?? []) union.add(code);
  const unread = [ramp ? null : "Ramp", cardRead ? null : "Mercuryo", bitrefill || !bitrefillConfigured() ? null : "Bitrefill"].filter((name): name is string => name !== null);
  const value: OutCountries = { countries: [...union].sort(), prefixes: mercuryo?.prefixes ?? {}, unread };
  held = { at: now, value, complete: unread.length === 0 };
  return value;
}
