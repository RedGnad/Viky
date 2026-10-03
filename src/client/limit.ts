import { momentInWords } from "../moments";
import { CEILING, LIMIT } from "../sentences";

/**
 * What only the browser can say of a limit (the founder, 3 Oct 2026): the hour, in the reader's own clock. The server
 * knows until when a day can still be counted and when a day's ceiling is lifted, and not which clock the person lives
 * by, so it sends the moment and the hour is said here. Browser only.
 */

/** "Your day can still be counted until tomorrow, 5 Oct, at 08:00.", to the person the gift is for or to anybody else. */
export function openDayInWords(countableUntil: number, mine: boolean, recipientName: string | null, nowMs: number = Date.now()): string {
  const until = momentInWords(countableUntil * 1_000, nowMs);
  return mine ? LIMIT.dayYours(until) : LIMIT.dayTheirs(recipientName, until);
}

/**
 * "... It resumes tomorrow, 4 Oct, at 02:00. ..." A day's ceiling is lifted when the next UTC day begins, which is an
 * hour of the reader's own day: the browser knows which.
 */
export function dayCeilingInWords(nowMs: number = Date.now()): string {
  return CEILING.reading(momentInWords((Math.floor(nowMs / 86_400_000) + 1) * 86_400_000, nowMs));
}

/**
 * An answer that refuses a reading for the month's limit or for a day's ceiling, with its hour in the reader's
 * clock. Any other answer is left as it is.
 */
export function withTheLimitSaid<T>(data: T): T {
  const outcome = data as { kind?: unknown; code?: unknown; countableUntil?: unknown } | null;
  if (!outcome || typeof outcome !== "object" || outcome.kind !== "refused") return data;
  if (outcome.code === "CEILING_REACHED") return { ...outcome, message: dayCeilingInWords() } as T;
  if (outcome.code !== "LIMIT_REACHED" || typeof outcome.countableUntil !== "number") return data;
  // Under a press there is no fold: the sentence the server said, then until when the day can still be counted.
  return { ...outcome, message: `${String((outcome as { message?: unknown }).message ?? "")} ${openDayInWords(outcome.countableUntil, true, null)}`.trim() } as T;
}
