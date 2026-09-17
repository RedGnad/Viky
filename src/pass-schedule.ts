/**
 * When the keeper's two passes run, in UTC, named once (decision 12 of the drawn flows, 17 Sep 2026). `vercel.json`
 * holds the schedules the platform reads; a test keeps it and these two constants the same, so a screen that says
 * when a missed day comes back cannot drift from when it does. Browser safe.
 */

export type PassTime = Readonly<{ hour: number; minute: number }>;

/** Reads and credits the day before (src/daily-pass.ts, COUNTING_PASS). */
export const COUNTING_PASS_UTC: PassTime = { hour: 0, minute: 30 };

/** Settles missed days and sends them back, and sends back gifts that never started (SETTLING_PASS). */
export const SETTLING_PASS_UTC: PassTime = { hour: 7, minute: 0 };

/** The cron expression the platform needs for a pass, every day at that time. */
export function cronOf(time: PassTime): string {
  return `${time.minute} ${time.hour} * * *`;
}

/** The settling pass in the reader's own clock, "9:00 AM" in English and "09:00" in French, in Paris in summer: said with "about", because a cron starts late. */
export function settlingTimeInWords(nowMs: number): string {
  const at = new Date(nowMs);
  at.setUTCHours(SETTLING_PASS_UTC.hour, SETTLING_PASS_UTC.minute, 0, 0);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
