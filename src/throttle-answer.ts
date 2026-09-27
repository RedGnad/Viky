import { classifyFetchFailure } from "./attested-read";
import { RACE_RESULT_ROW, type AttestedSource } from "./attested-sources";
import { isTooManyRequests } from "./source-throttle";

/** Why a platform asked the reading service to slow down: a 429, or race result's trap 404 (src/race-result.ts). */
export type ThrottleAnswer = "ANSWERED_429" | "TRAP_404";

/**
 * Whether a failed attested read is the platform asking the reading service to slow down, and how; nothing when it is
 * not. The service pauses the platform on either answer and does not count the reading (src/source-throttle.ts).
 *
 * A 404 on race result's row is taken as the trap. zkFetch's refusal names the status and not the body (measured on
 * Chess.com, 17 Sep 2026), so the trap page cannot be seen from here; but the app asks for the row attested only after
 * reading that same URL plainly and finding the bib on it (src/marathon-reading.ts), so a 404 there says nothing about
 * the runner. Another platform's 404 keeps its meaning.
 */
export function throttleAnswerOf(source: AttestedSource, message: string): ThrottleAnswer | null {
  if (isTooManyRequests(message)) return "ANSWERED_429";
  if (source.id === RACE_RESULT_ROW.id && classifyFetchFailure(message, source).code === "NOT_FOUND") return "TRAP_404";
  return null;
}
