import type { PassTime } from "./pass-schedule";

/**
 * Moments said the way the screens say them, always with the date: item 12 of the product structure asks that the
 * next judgement be dated in the reader's local time, and "tomorrow at 2am" read at 23:59 is already wrong. Browser
 * safe. Months are written by hand, as `rateDateInWords` writes them, so one screen never mixes "Sep" and "Sept".
 */

/**
 * The one language the product speaks, for every clock it prints (D147).
 *
 * A time written in the reader's own language is a different string on the server and in the browser, and React
 * throws away a page whose text does not match the one it was sent: the landing was rebuilt on every visit for a
 * French phone, because "8:00 AM" came from the server and "8:00" from the device, which is the blink the founder
 * saw. The product is in English for the pilot, so its clocks are too, and they say the same thing everywhere.
 */
export const PRODUCT_LOCALE = "en-GB";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

function localDayNumber(atMs: number): number {
  const at = new Date(atMs);
  return Math.floor(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / DAY_MS);
}

/** "today, 17 Sep, at 09:00", "tomorrow, 18 Sep, at 02:30", or "Fri 19 Sep at 08:00", in the reader's own clock. */
export function momentInWords(atMs: number, nowMs: number, locale: string = PRODUCT_LOCALE): string {
  const at = new Date(atMs);
  const time = at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const date = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  const days = localDayNumber(atMs) - localDayNumber(nowMs);
  if (days === 0) return `today, ${date}, at ${time}`;
  if (days === 1) return `tomorrow, ${date}, at ${time}`;
  return `${WEEKDAYS[at.getDay()]} ${date} at ${time}`;
}

/** The hour alone, in the reader's own clock: "20:30". For a figure that says when, beside a label that says what. */
export function hourInWords(atMs: number, locale: string = PRODUCT_LOCALE): string {
  return new Date(atMs).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
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

/**
 * Where the reader keeps their clock, as a cookie carries it (D160). A date is a different day on either side of
 * midnight somewhere, so a page drawn by the server and a page hydrated in a browser print different words unless
 * both are told the same zone. React throws away a page whose text does not match the one it was sent, which is the
 * gift's screen being built twice: the server said 26 Sep, the phone said 25.
 */
export const ZONE_COOKIE = "viky.zone";

/** Whether a name is a zone this machine knows. Anything else is nobody's zone and is ignored. */
export function isZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * A calendar date for a moment, in the zone given, or in this machine's own when none is: "1 Oct 2026".
 *
 * Every screen the server draws passes the zone, so the server and the browser say the same day. Nothing else does,
 * and for them this is what it always was.
 */
/** The same day without its year, for a day close enough that the year is noise: "12 Oct" (the founder, 10 Oct 2026). */
export function dayInWords(atMs: number, zone?: string): string {
  return dateInWords(atMs, zone).replace(/ \d{4}$/, "");
}

export function dateInWords(atMs: number, zone?: string): string {
  const at = new Date(atMs);
  if (!zone) return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric", month: "numeric", year: "numeric" }).formatToParts(at);
  const partOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${Number(partOf("day"))} ${MONTHS[Number(partOf("month")) - 1]} ${partOf("year")}`;
}
