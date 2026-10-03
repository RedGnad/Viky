/**
 * Where today stands for a gift read as the day goes (the founder's mockup of 3 Oct 2026, the day on the third daily
 * contract). Browser safe and pure.
 *
 * On the third daily contract a reading pays its own day, the oldest open day first. So the page of such a gift has a
 * question the earlier ones never had, "what would a lesson done now pay?", and three answers:
 *
 * - an earlier day is still open inside its window: the next lesson pays that day, and one more pays the next;
 * - today is open and nothing older is: the lesson of today is waited for, until the contract's day ends;
 * - today is counted: nothing is waited for until tomorrow.
 *
 * The days are the contract's, which are UTC days; what a person reads is how long is left, at their own clock.
 */

const DAY_MS = 86_400_000;

type Counted = Readonly<{ startDay: number; endDay: number; creditedDays: number; missedDays: number; givenBackDays?: number }>;

export type DayNow =
  /** An earlier day a lesson can still pay: which, until when, and the day one more lesson would pay, if any is open. */
  | Readonly<{ kind: "catchUp"; day: number; deadlineMs: number; then: number | null }>
  /** Today is open, and nothing older is: until the contract's day ends. */
  | Readonly<{ kind: "open"; day: number; endsAtMs: number }>
  /** Today is counted. */
  | Readonly<{ kind: "counted"; day: number }>;

/**
 * The state of the day now, or nothing when the gift has no day a lesson could pay and none just counted: not
 * connected yet, or past its last day with every day settled.
 *
 * A day whose window has closed is not open, whatever the contract still holds of it: the contract sends it back
 * before it credits anything, so no lesson pays it.
 */
export function dayNow(gift: Counted, catchUpSeconds: number, nowMs: number): DayNow | null {
  if (gift.startDay === 0 || nowMs === 0) return null;
  const today = Math.floor(nowMs / DAY_MS);
  const firstUnsettled = gift.startDay + gift.creditedDays + gift.missedDays + (gift.givenBackDays ?? 0);
  const lastPayable = Math.min(today, gift.endDay);
  // The oldest unsettled day still inside its window: the one the next lesson pays.
  let oldest = firstUnsettled;
  while (oldest < today && oldest <= lastPayable && nowMs >= (oldest + 1) * DAY_MS + catchUpSeconds * 1_000) oldest += 1;
  if (oldest > lastPayable) {
    // Nothing is open. Today is counted when it is a day of the gift and the contract holds it as settled.
    return today <= gift.endDay && firstUnsettled > today ? { kind: "counted", day: today } : null;
  }
  if (oldest === today) return { kind: "open", day: today, endsAtMs: (today + 1) * DAY_MS };
  return { kind: "catchUp", day: oldest, deadlineMs: (oldest + 1) * DAY_MS + catchUpSeconds * 1_000, then: oldest + 1 <= lastPayable ? oldest + 1 : null };
}

/** Whether a lesson done now would pay a day: the page looks only then, and so does nothing else. */
export function lessonWouldPay(now: DayNow | null): boolean {
  return now !== null && now.kind !== "counted";
}

/**
 * How long is left, as a figure: "9 h 12", and "45 min" under an hour. No seconds: the page looks once a minute, and
 * a figure that moved faster would say more than the page knows.
 */
export function leftInWords(untilMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((untilMs - nowMs) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
