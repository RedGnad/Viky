import { getAddress, isAddress } from "viem";
import { readAccountAuthSession, type AccountAuthSession } from "./account-auth-server";
import { GiftApiError } from "./gift-api";

/**
 * Dev pages and dev routes are the operator's tools for the first mainnet run (KT1): one of them moves
 * the relayer's MON. They answer only when dev pages are switched on AND the signed-in account is one of
 * the operator's own accounts (VIKY_OPERATOR_ACCOUNTS, comma separated). Everyone else gets a plain 404,
 * so nothing reveals that the pages exist. Removed entirely once KT1's crypto half is done.
 */

export function operatorAccounts(value = process.env.VIKY_OPERATOR_ACCOUNTS): ReadonlySet<string> {
  const accounts = new Set<string>();
  for (const part of (value ?? "").split(",")) {
    const candidate = part.trim().toLowerCase();
    if (isAddress(candidate)) accounts.add(getAddress(candidate));
  }
  return accounts;
}

export function devPagesEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.VIKY_DEV_PAGES === "1" && operatorAccounts(environment.VIKY_OPERATOR_ACCOUNTS).size > 0;
}

export function isOperator(account: string | null | undefined, value = process.env.VIKY_OPERATOR_ACCOUNTS): boolean {
  const candidate = account?.trim().toLowerCase();
  if (!candidate || !isAddress(candidate)) return false;
  return operatorAccounts(value).has(getAddress(candidate));
}

/** For dev routes: the operator's session, or a 404 for anyone else. */
export function requireOperator(request: Request): AccountAuthSession {
  if (!devPagesEnabled()) throw new GiftApiError("NOT_FOUND", "Not found", 404);
  let session: AccountAuthSession;
  try {
    session = readAccountAuthSession(request);
  } catch {
    throw new GiftApiError("NOT_FOUND", "Not found", 404);
  }
  if (!isOperator(session.account)) throw new GiftApiError("NOT_FOUND", "Not found", 404);
  return session;
}

/**
 * For dev pages (server components): true only for the operator's signed-in browser. The session cookie
 * is read the same way the routes read it, from a request rebuilt out of the incoming headers.
 */
export async function operatorCanSeeDevPages(): Promise<boolean> {
  if (!devPagesEnabled()) return false;
  return operatorIsSignedIn();
}

/**
 * Whether the browser asking is signed in as one of the operator's accounts, whatever the dev pages' switch says. The
 * looks laboratory alone opens on it (the founder, 4 Oct 2026: he judges each screen and each movement on viky.cash,
 * from his operator account): it draws example data and moves nothing, so it does not need the switch that opens the
 * pages which move money, and those stay shut where that switch is off.
 */
export async function operatorIsSignedIn(): Promise<boolean> {
  if (operatorAccounts().size === 0) return false;
  const { headers } = await import("next/headers");
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!host) return false;
  const proto = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const request = new Request(`${proto}://${host}/`, { headers: { cookie: incoming.get("cookie") ?? "" } });
  try {
    return isOperator(readAccountAuthSession(request).account);
  } catch {
    return false;
  }
}

/**
 * The design gallery, which is a different thing from the operator's pages and needs a different door.
 *
 * The operator lock exists because those pages move money, and it has a side effect nobody wanted: nothing
 * can photograph a screen behind it, so the only captures anybody could take were of the six pages a signed
 * out visitor sees. That is not a product. This page renders example data with no working control on it, so
 * it needs no account, and it is off unless this is explicitly switched on, which production never does.
 */
export function galleryOpen(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.VIKY_DESIGN_GALLERY === "1";
}
