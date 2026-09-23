/**
 * What this device last saw of a gift, in a cookie, so the server draws the starting state of an arrival rather than
 * its end (the fix to #154, the chain written in DECISIONS): the settled days of each gift, the money on Home and on a
 * gift's card, and where a climb stood. Numbers only, keyed by what they are about; no name and no amount of anybody
 * else's travels, and the address a money figure is keyed by is the reader's own, which the session cookie beside it
 * already carries.
 *
 * Bounded: the forty most recently written entries are kept, so a device that opens many gifts never grows a header.
 */
export const SEEN_COOKIE = "viky.seen";
export const SEEN_MAX_ENTRIES = 40;
export const SEEN_MAX_AGE_SECONDS = 365 * 86_400;

export type Seen = Readonly<Record<string, number>>;

/** The key as the cookie carries it: the long local prefix is dropped, since everything in this cookie is seen. */
export function seenKey(key: string): string {
  return key.startsWith("viky.seen.") ? key.slice("viky.seen.".length) : key;
}

export function seenFromCookie(raw: string | null | undefined): Seen {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && key.length <= 120) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** The cookie's value with one entry written last, the oldest dropped past the bound. */
export function seenCookieWith(seen: Seen, key: string, value: number): string {
  const entries = Object.entries(seen).filter(([name]) => name !== key);
  entries.push([key, value]);
  const kept = entries.slice(-SEEN_MAX_ENTRIES);
  return encodeURIComponent(JSON.stringify(Object.fromEntries(kept)));
}
