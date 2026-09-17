import type { PassTime } from "./pass-schedule";

/**
 * Moments said the way the screens say them, always with the date: item 12 of the product structure asks that the
 * next judgement be dated in the reader's local time, and "tomorrow at 2am" read at 23:59 is already wrong. Browser
 * safe. Months are written by hand, as `rateDateInWords` writes them, so one screen never mixes "Sep" and "Sept".
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

function localDayNumber(atMs: number): number {
  const at = new Date(atMs);
  return Math.floor(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / DAY_MS);
}

/** "today, 17 Sep, at 9:00 AM", "tomorrow, 18 Sep, at 2:30 AM", or "Fri 19 Sep at 8:00 AM", in the reader's clock. */
export function momentInWords(atMs: number, nowMs: number, locale?: string): string {
  const at = new Date(atMs);
  const time = at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const date = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  const days = localDayNumber(atMs) - localDayNumber(nowMs);
  if (days === 0) return `today, ${date}, at ${time}`;
  if (days === 1) return `tomorrow, ${date}, at ${time}`;
  return `${WEEKDAYS[at.getDay()]} ${date} at ${time}`;
}

/** The next time a keeper's pass runs after now, in milliseconds. */
export function nextPassMs(pass: PassTime, nowMs: number): number {
  const today = new Date(nowMs);
  const at = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), pass.hour, pass.minute);
  return at > nowMs ? at : at + DAY_MS;
}

/** A contract day (a UTC day number) as a date: "18 Sep", or "18 Sep 2026" with the year. */
export function contractDayInWords(dayNumber: number, withYear = false): string {
  const at = new Date(dayNumber * DAY_MS);
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}${withYear ? ` ${at.getUTCFullYear()}` : ""}`;
}

/** The days of a gift as one range: "18 to 24 Sep 2026", "28 Sep to 4 Oct 2026", "28 Dec 2026 to 3 Jan 2027". */
export function contractRangeInWords(firstDay: number, lastDay: number): string {
  const first = new Date(firstDay * DAY_MS);
  const last = new Date(lastDay * DAY_MS);
  const year = last.getUTCFullYear();
  if (first.getUTCFullYear() !== year) return `${contractDayInWords(firstDay, true)} to ${contractDayInWords(lastDay, true)}`;
  if (first.getUTCMonth() !== last.getUTCMonth()) return `${contractDayInWords(firstDay)} to ${contractDayInWords(lastDay, true)}`;
  return `${first.getUTCDate()} to ${contractDayInWords(lastDay, true)}`;
}

/** A calendar date for a moment in the reader's clock: "1 Oct 2026". */
export function dateInWords(atMs: number): string {
  const at = new Date(atMs);
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}
