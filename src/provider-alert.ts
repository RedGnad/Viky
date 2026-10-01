import { Resend } from "resend";
import { passNote } from "./pass-notes";
import type { Portal, PortalReview, ProviderRequest } from "./portal-store";
import { countryInWords } from "./university-shown";

/**
 * The operator's alert for a provider request (the founder, 28 Sep 2026): each request a gift makes sends one email to
 * founder@viky.cash with the university, the sense and the command to run, so "within two days" does not rest on
 * somebody remembering to look. Sent once per request, through Resend (the Vercel Marketplace's email integration,
 * `RESEND_API_KEY`). Without the key nothing is sent and the gift is made all the same: `pnpm provider:requests` still
 * lists what waits.
 *
 * Resend's test sender, onboarding@resend.dev, writes only to the address the Resend account was opened with; another
 * sender needs its domain verified at Resend, and is named in `ALERT_FROM`.
 */

export const ALERT_TO = "founder@viky.cash";
const DEFAULT_FROM = "Viky <onboarding@resend.dev>";

export type AlertOutcome = "sent" | "not configured" | "failed";

/** The email itself: what a person reads to build the provider, and the command that registers it. */
export function providerAlert(portal: Pick<Portal, "portalId" | "university" | "country" | "loginUrl">, request: Pick<ProviderRequest, "sense" | "instruction" | "firstGiftId">): { subject: string; text: string } {
  const country = countryInWords(portal.country);
  return {
    subject: `Provider to build: ${portal.university} (${country}), ${request.sense}`,
    text: [
      `A gift needs the ${request.sense} provider of ${portal.university} (${country}). The person reads that it is set up within two days.`,
      `Sign-in page: ${portal.loginUrl}`,
      request.firstGiftId ? `Gift: ${request.firstGiftId}` : "",
      "",
      request.instruction,
      "",
      "In production, with the operator's environment: VIKY_ALLOW_PRODUCTION_DATABASE=1 PROVEN_BY=<the operator account> before the command above.",
      "Every request still waiting: pnpm provider:requests",
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n"),
  };
}

/** Sends the alert, or says why not. Never throws: a gift is made whether or not the email leaves. */
export async function sendProviderAlert(
  portal: Pick<Portal, "portalId" | "university" | "country" | "loginUrl">,
  request: Pick<ProviderRequest, "sense" | "instruction" | "firstGiftId">,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AlertOutcome> {
  return sendAlert(providerAlert(portal, request), env);
}

/**
 * The alert for a first proof held for review (the founder, 29 Sep 2026): the person reads that it is checked within an
 * hour, so the operator is told the moment it is held. It names the proof and the command, not what the page carried:
 * `pnpm portal:pin` shows that, from the database, to the operator alone.
 */
export function reviewAlert(review: Pick<PortalReview, "sessionId" | "portalId" | "sense" | "giftId">, university: string | null): { subject: string; text: string } {
  const where = university ? `${university} (${review.portalId})` : review.portalId;
  return {
    subject: `First proof to review within the hour: ${where}, ${review.sense}`,
    text: [
      `A first proof from ${where} is held for review, for the ${review.sense} of gift ${review.giftId}. The person reads that it is checked within an hour.`,
      "",
      "See what it read: pnpm portal:pin",
      `Then pin it, or refuse it: pnpm portal:pin ${review.sessionId} ...`,
      "",
      "In production, with the operator's environment: VIKY_ALLOW_PRODUCTION_DATABASE=1 PROVEN_BY=<the operator account> before the command above.",
    ].join("\n"),
  };
}

/** Sends the review alert, or says why not. Never throws: the proof is held whether or not the email leaves. */
export async function sendReviewAlert(
  review: Pick<PortalReview, "sessionId" | "portalId" | "sense" | "giftId">,
  university: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AlertOutcome> {
  return sendAlert(reviewAlert(review, university), env);
}

/** An alert Resend did not take: a line in the logs, and a note in the pass under way when there is one. */
function notSent(subject: string, why: string): void {
  const line = `alert not sent ("${subject}"): ${why.slice(0, 200)}`;
  console.error(line);
  passNote(line);
}

/**
 * One email to the operator, or why not. Never throws. A failure is logged with its reason (the audit of 1 Oct 2026):
 * an alert that did not leave used to leave no trace either, and the one person it was for could not know.
 */
export async function sendAlert({ subject, text }: { subject: string; text: string }, env: Readonly<Record<string, string | undefined>> = process.env): Promise<AlertOutcome> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return "not configured";
  try {
    const { error } = await new Resend(key).emails.send({ from: env.ALERT_FROM?.trim() || DEFAULT_FROM, to: [ALERT_TO], subject, text });
    if (error) notSent(subject, `${error.name ?? "refused"}: ${String(error.message ?? "")}`);
    return error ? "failed" : "sent";
  } catch (failure) {
    notSent(subject, failure instanceof Error ? failure.message : String(failure));
    return "failed";
  }
}
