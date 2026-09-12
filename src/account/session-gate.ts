import type { Address } from "viem";

/**
 * Which account the app may act on. A passkey opens the signing session first and Viky's server accepts
 * the browser a moment later, so for an instant the passkey knows an account the server does not. A screen
 * that learns about it in between asks the server for this person's gifts with no session, is refused, and
 * keeps that refusal on screen with nothing to retry. That is what shipped on 11 Sep 2026 and what a
 * screenshot caught. The account is announced only when both sides name the same one.
 */
export function announcedAccount(passkeyAccount: Address | undefined, serverAccepted: Address | undefined): Address | undefined {
  if (passkeyAccount === undefined || serverAccepted === undefined) return undefined;
  return passkeyAccount === serverAccepted ? passkeyAccount : undefined;
}
