import type { Address } from "viem";

/**
 * Which account the app may act on, and what it may do with it.
 *
 * There are two sessions, and they are not the same length. Viky's server session is a twelve hour cookie that says
 * who this browser is; it holds no key and can sign nothing. The signing session is the key the passkey derived, held
 * in memory only, which closes after a few idle minutes and dies with the page. Keeping the key anywhere else is the
 * one thing a passkey product must not do, so a page load always loses it.
 *
 * Until 18 Sep 2026 the account was announced only when both were open, so a reload signed the person out of a
 * product they were still signed in to: the funder who reloaded, changed tab, or came back from the card page lost
 * the account in the middle of the money path. The cookie was there the whole time, and the server answered every
 * request with it. What was missing was asking.
 *
 * So: the server's cookie decides who this is, and the passkey is asked at the moment a signature is needed, never on
 * load. The one thing that is never announced is a disagreement, because a screen showing one account while the key
 * signs another is worse than showing nobody.
 */
export function announcedAccount(passkeyAccount: Address | undefined, serverAccepted: Address | undefined): Address | undefined {
  if (serverAccepted === undefined) return undefined;
  if (passkeyAccount !== undefined && passkeyAccount !== serverAccepted) return undefined;
  return serverAccepted;
}

/** What the person may do right now, for a screen to say the truth about it. */
export type SessionReach = "signed-out" | "reading" | "signing";

export function sessionReach(passkeyAccount: Address | undefined, serverAccepted: Address | undefined): SessionReach {
  const account = announcedAccount(passkeyAccount, serverAccepted);
  if (account === undefined) return "signed-out";
  return passkeyAccount === account ? "signing" : "reading";
}

/**
 * How long the open session has left, for the screen to show. Never negative and never stale: the screen
 * reads the deadline again every second, because every signature pushes it back.
 */
export function sessionRemaining(expiresAtMs: number | undefined, nowMs: number): { minutes: number; seconds: number } | undefined {
  if (expiresAtMs === undefined) return undefined;
  const left = Math.max(0, expiresAtMs - nowMs);
  return { minutes: Math.floor(left / 60_000), seconds: Math.floor((left % 60_000) / 1_000) };
}
