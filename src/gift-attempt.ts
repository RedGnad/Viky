import type { CertificateGiftRequest } from "./client/certificate-gift";
import type { GiftRequest } from "./client/gift";
import type { MilestoneGiftRequest } from "./client/milestone";

/**
 * The creation a funder's page last sent, kept so "Try again" sends the same signed request (D87).
 *
 * The server finds a creation by its authorization's nonce, the hash of the exact terms and a random salt. Signing
 * again draws a new salt, so a retry that signs again is a new gift to the server: if the first one's money had moved
 * and only its record failed, a second signature could pay for the same gift twice. So the page signs once per set of
 * terms, keeps the request, and sends it again until the server says it is made, or refuses the terms themselves.
 *
 * Kept for the device and not for the tab, for as long as the gift itself is kept (the final audit of 9 Oct 2026, A4).
 * A page closed while the creation was on its way took the request with it: the page opened again signed a new one,
 * and a new request is a second gift when the account still holds the amount. The request moves nothing by being
 * kept: its authorization pays this one gift's contract and nobody else, once.
 * Browser safe.
 */

/** As long as a gift set up on the device is kept (src/pending-gift.ts): a request older than that is of no gift. */
export const GIFT_ATTEMPT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** The attempt as the device keeps it, with the moment it was written down. */
export function attemptToKeep(attempt: KeptAttempt, nowMs: number): string {
  return JSON.stringify({ ...attempt, keptAtMs: nowMs });
}

/** What the device keeps, or nothing: unreadable, written in the future, or older than a gift is kept. */
export function attemptKept(raw: string | null, nowMs: number): KeptAttempt | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const kept = value as Partial<KeptAttempt> & { keptAtMs?: unknown };
  if (typeof kept.keptAtMs !== "number" || kept.keptAtMs > nowMs + 60_000 || nowMs - kept.keptAtMs > GIFT_ATTEMPT_MAX_AGE_MS) return null;
  if (!kept.terms || !kept.request || typeof kept.request !== "object") return null;
  return { terms: kept.terms, request: kept.request };
}

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
  /** A milestone's terms beyond those every gift has: its target and where they stood when it was chosen (C2). */
  target?: number;
  standing?: number;
  /** The course or university a gift is made on, and the scale a grade is typed on: a request for another is not this one. */
  course?: string;
  scale?: string;
}>;

/** A certificate gift is signed the same way and kept the same way: one signature per set of terms (D87). */
export type AnyGiftRequest = GiftRequest | MilestoneGiftRequest | CertificateGiftRequest;

export type KeptAttempt = Readonly<{ terms: AttemptTerms; request: AnyGiftRequest }>;

function sameTerms(a: AttemptTerms, b: AttemptTerms): boolean {
  return (
    a.account.toLowerCase() === b.account.toLowerCase() &&
    a.username === b.username &&
    a.recipientName === b.recipientName &&
    a.funderName === b.funderName &&
    a.goalType === b.goalType &&
    a.dailyTarget === b.dailyTarget &&
    a.durationDays === b.durationDays &&
    a.amount === b.amount &&
    a.target === b.target &&
    a.standing === b.standing &&
    (a.course ?? "") === (b.course ?? "") &&
    (a.scale ?? "") === (b.scale ?? "")
  );
}

/** The request kept for exactly these terms, or nothing: other terms, another account, or anything unreadable. */
export function attemptFor(kept: unknown, terms: AttemptTerms): AnyGiftRequest | undefined {
  if (!kept || typeof kept !== "object") return undefined;
  const value = kept as Partial<KeptAttempt>;
  if (!value.terms || !value.request || typeof value.request !== "object" || !value.request.authorization) return undefined;
  return sameTerms(value.terms, terms) ? value.request : undefined;
}

/**
 * Whether a refusal ends the kept request. Refusals about the terms themselves, or a gift already made, do: nothing
 * more can come of that request. Anything that says "not now" keeps it: in progress, being recorded, a closed
 * session, a busy source, too many attempts, or no answer at all.
 *
 * And an answer that says nothing of what the request did keeps it too (the founder, 5 Oct 2026): the server's own
 * error, and a creation sent and not known to be final yet. Those two used to end it, so the next try signed a new
 * request, and a new request is a second payment if the first one went through after all. The same request sent
 * again cannot be: its authorization is spent once, and the server finds the creation by it (D87).
 */
export function forgetsAttempt(code: string | undefined): boolean {
  if (!code) return false;
  return !["IN_PROGRESS", "BEING_RECORDED", "SIGN_IN_REQUIRED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", "QUOTE_UNAVAILABLE", "NOT_CONFIGURED", "FAILED", "NOT_FINAL_YET"].includes(code);
}

/** Whether a kept request is a milestone gift's, which goes to its own route. */
/** A certificate gift carries the name the certificate must show; a climb carries a cadence and a standing. */
export function isCertificateRequest(request: AnyGiftRequest): request is CertificateGiftRequest {
  return "personName" in request;
}

export function isMilestoneRequest(request: AnyGiftRequest): request is MilestoneGiftRequest {
  return "conditionId" in request && !isCertificateRequest(request);
}
