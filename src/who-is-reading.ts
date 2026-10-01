import { cookies, headers } from "next/headers";
import type { Address } from "viem";
import { ACCOUNT_AUTH_COOKIE_NAME, normalizedOrigin, readAccountAuthSessionFrom } from "./account-auth-server";
import { isZone, ZONE_COOKIE } from "./moments";

/**
 * The account this browser is signed in as, read from the session cookie while a page renders (D156, D160).
 *
 * A route reads the same session from its `Request`; a page has no request of its own, so it reads the cookie jar.
 * Every server component that draws somebody's own screen asks this, and the answer is what lets the screen be
 * theirs in its first byte instead of becoming theirs once the browser has asked.
 *
 * Nothing here throws: a page for a gift is a page anybody may open, and a cookie that expired or was never sent is
 * simply nobody.
 */
export async function signedInAccount(): Promise<Address | undefined> {
  try {
    const [store, sent] = await Promise.all([cookies(), headers()]);
    const host = sent.get("x-forwarded-host") ?? sent.get("host");
    if (!host) return undefined;
    const proto = sent.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
    return readAccountAuthSessionFrom(store.get(ACCOUNT_AUTH_COOKIE_NAME)?.value ?? null, normalizedOrigin(`${proto}://${host}`)).account;
  } catch {
    return undefined;
  }
}

/**
 * The clock this reader keeps, from the cookie their browser wrote, or UTC (D160). UTC rather than this machine's
 * own zone on purpose: the browser starts from the same answer, so the first render of a device that has never been
 * here says exactly what the server said, and corrects itself once rather than throwing the page away.
 */
export async function zoneOfTheReader(): Promise<string> {
  try {
    const kept = (await cookies()).get(ZONE_COOKIE)?.value;
    const named = kept ? decodeURIComponent(kept) : undefined;
    return isZone(named) ? named : "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Where this page is being served from, so an address built on the server (a preview's image, the same link opened in
 * the phone's own browser) is one that can be fetched and opened.
 */
export async function originOfThePage(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "viky.cash";
  const proto = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Which browser asks for this page, as it names itself. */
export async function browserOfTheReader(): Promise<string> {
  try {
    return (await headers()).get("user-agent") ?? "";
  } catch {
    return "";
  }
}
