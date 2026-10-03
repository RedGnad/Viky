import { contactEmail } from "../contact";
import { momentInWords } from "../moments";
import { LIMIT } from "../sentences";

/**
 * The month's limit of readings, said in the reader's own clock (the founder, 3 Oct 2026). The server knows until when
 * a day can still be counted and not which clock the person lives by, so it sends the moment and the sentence is made
 * here, in the browser. Browser only.
 */

/** "... Your day can still be counted until tomorrow, 5 Oct, at 08:00. ..." A gift not counted by days has no hour. */
export function readingLimitInWords(countableUntil: number | null | undefined, nowMs: number = Date.now()): string {
  return LIMIT.reading(countableUntil ? momentInWords(countableUntil * 1_000, nowMs) : null, contactEmail());
}

/** An answer that refuses a reading for the month's limit, with its sentence in the reader's clock. Any other answer is left as it is. */
export function withTheLimitSaid<T>(data: T): T {
  const outcome = data as { kind?: unknown; code?: unknown; countableUntil?: unknown } | null;
  if (!outcome || typeof outcome !== "object" || outcome.kind !== "refused" || outcome.code !== "LIMIT_REACHED") return data;
  return { ...outcome, message: readingLimitInWords(typeof outcome.countableUntil === "number" ? outcome.countableUntil : null) } as T;
}
