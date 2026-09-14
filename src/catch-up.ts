/**
 * The day that is neither counted nor lost yet, and the moment it stops being catchable. Browser safe.
 *
 * A day can be covered until the end of the day after it, so between those two points a day sits in a state
 * no screen was naming: not credited, not missed, still winnable. A recipient on the third day read "1 of 7
 * done, 0 missed" and concluded something was wrong (D50). The contract decides the moment; this says it in
 * words, in the reader's own time, because the contract's day is a UTC day and nobody lives in one.
 */

export type CatchUp = Readonly<{ day: number; deadlineMs: number }>;

/**
 * The open day and its deadline, or nothing when every day so far is settled. `catchUpSeconds` differs per
 * contract, which is itself a defect recorded in D50: gift 1 has 24 hours, gifts made since have 30.
 */
export function catchUpDay(
  gift: { startDay: number; endDay: number; creditedDays: number; missedDays: number },
  catchUpSeconds: number,
  nowMs: number,
): CatchUp | undefined {
  if (gift.startDay === 0) return undefined;
  const firstOpen = gift.startDay + gift.creditedDays + gift.missedDays;
  // Nothing is open once the window is over, or once today is the first open day: today is not catchable,
  // it is simply not finished.
  if (firstOpen > gift.endDay) return undefined;
  const today = Math.floor(nowMs / 86_400_000);
  if (firstOpen >= today) return undefined;
  const deadlineMs = (firstOpen + 1) * 86_400_000 + catchUpSeconds * 1_000;
  return deadlineMs > nowMs ? { day: firstOpen, deadlineMs } : undefined;
}

/** "tonight", "tomorrow at 2am", or a weekday and hour, in the reader's own time. */
export function deadlineInWords(deadlineMs: number, nowMs: number, locale?: string): string {
  const deadline = new Date(deadlineMs);
  const hours = Math.round((deadlineMs - nowMs) / 3_600_000);
  const time = deadline.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(nowMs).toDateString() === deadline.toDateString();
  if (sameDay) return `today at ${time}`;
  if (hours <= 36) return `tomorrow at ${time}`;
  return `${deadline.toLocaleDateString(locale, { weekday: "long" })} at ${time}`;
}
