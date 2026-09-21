import { cookies, headers } from "next/headers";
import type { Address } from "viem";
import { ACCOUNT_AUTH_COOKIE_NAME, normalizedOrigin, readAccountAuthSessionFrom } from "./account-auth-server";

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
