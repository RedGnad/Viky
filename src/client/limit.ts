import { contactEmail } from "../contact";
import { momentInWords } from "../moments";
import { CEILING, LIMIT } from "../sentences";

/**
 * The month's limit of readings, said in the reader's own clock (the founder, 3 Oct 2026). The server knows until when
 * a day can still be counted and not which clock the person lives by, so it sends the moment and the sentence is made
 * here, in the browser. Browser only.
 */

/** "... Your day can still be counted until tomorrow, 5 Oct, at 08:00. ..." A gift not counted by days has no hour. */
export function readingLimitInWords(countableUntil: number | null | undefined, nowMs: number = Date.now()): string {
  return LIMIT.reading(countableUntil ? momentInWords(countableUntil * 1_000, nowMs) : null, contactEmail());
}

/**
 * "... It resumes tomorrow, 4 Oct, at 02:00. ..." A day's ceiling is lifted when the next UTC day begins, which is an
 * hour of the reader's own day: the browser knows which.
 */
export function dayCeilingInWords(nowMs: number = Date.now()): string {
  return CEILING.reading(momentInWords((Math.floor(nowMs / 86_400_000) + 1) * 86_400_000, nowMs));
}

/**
 * An answer that refuses a reading for the month's limit or for a day's ceiling, with its sentence in the reader's
 * clock. Any other answer is left as it is.
 */
export function withTheLimitSaid<T>(data: T): T {
  const outcome = data as { kind?: unknown; code?: unknown; countableUntil?: unknown } | null;
  if (!outcome || typeof outcome !== "object" || outcome.kind !== "refused") return data;
  if (outcome.code === "CEILING_REACHED") return { ...outcome, message: dayCeilingInWords() } as T;
  if (outcome.code !== "LIMIT_REACHED") return data;
  return { ...outcome, message: readingLimitInWords(typeof outcome.countableUntil === "number" ? outcome.countableUntil : null) } as T;
}
