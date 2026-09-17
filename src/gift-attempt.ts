import type { GiftRequest } from "./client/gift";

/**
 * The creation a funder's page last sent, kept for the tab so "Try again" sends the same signed request (D87).
 *
 * The server finds a creation by its authorization's nonce, the hash of the exact terms and a random salt. Signing
 * again draws a new salt, so a retry that signs again is a new gift to the server: if the first one's money had moved
 * and only its record failed, a second signature could pay for the same gift twice. So the page signs once per set of
 * terms, keeps the request, and sends it again until the server says it is made, or refuses the terms themselves.
 * Browser safe.
 */

export const GIFT_ATTEMPT_KEY = "viky.giftAttempt";

export type AttemptTerms = Readonly<{
  account: string;
  username: string;
  recipientName: string;
  funderName: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: string;
}>;

export type KeptAttempt = Readonly<{ terms: AttemptTerms; request: GiftRequest }>;

function sameTerms(a: AttemptTerms, b: AttemptTerms): boolean {
  return (
    a.account.toLowerCase() === b.account.toLowerCase() &&
    a.username === b.username &&
    a.recipientName === b.recipientName &&
    a.funderName === b.funderName &&
    a.goalType === b.goalType &&
    a.dailyTarget === b.dailyTarget &&
    a.durationDays === b.durationDays &&
    a.amount === b.amount
  );
}

/** The request kept for exactly these terms, or nothing: other terms, another account, or anything unreadable. */
export function attemptFor(kept: unknown, terms: AttemptTerms): GiftRequest | undefined {
  if (!kept || typeof kept !== "object") return undefined;
  const value = kept as Partial<KeptAttempt>;
  if (!value.terms || !value.request || typeof value.request !== "object" || !value.request.authorization) return undefined;
  return sameTerms(value.terms, terms) ? value.request : undefined;
}

/**
 * Whether a refusal ends the kept request. Refusals about the terms themselves, or a gift already made, do: nothing
 * more can come of that request. Anything that says "not now" keeps it: in progress, being recorded, a closed
 * session, a busy source, too many attempts, or no answer at all.
 */
export function forgetsAttempt(code: string | undefined): boolean {
  if (!code) return false;
  return !["IN_PROGRESS", "BEING_RECORDED", "SIGN_IN_REQUIRED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", "QUOTE_UNAVAILABLE", "NOT_CONFIGURED"].includes(code);
}
