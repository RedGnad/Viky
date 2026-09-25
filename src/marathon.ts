import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";

/**
 * "Finish a marathon" (D273, the founder's decision of 26 Sep 2026): a milestone of the Move family, read for the
 * person from the public results page of the race's timing company, as an examination result is read from its
 * board. One line per timing company, one race per gift, chosen from the register below. Browser safe.
 *
 * Three ties make a result the person's (the founder, 26 Sep 2026): the name the funder writes at creation, hashed
 * into the terms and never published; the bib the person enters on the gift's page before the race starts (the
 * field closes at the start, a bib entered after is not read); and the timing company's own line for that bib,
 * read by the reading service, which has to carry that bib, that name and a finish time. The name is compared as
 * `normaliseCertificateName` compares it: no case, no accents, no order.
 *
 * What is scored: the finish time, as seconds under twenty-four hours, so that "under X hours" is a target the
 * contract compares as it compares every other (higher is better) and "finish" is any time at all.
 *
 * Breizh Chrono, the first timing company (read 26 Sep 2026): `resultats.breizhchrono.com`, run by Klikego. A race
 * is a reference like `1488071608761-442` and a heat like `marathon`. The results list is one page whose rows are
 * embedded, base64 of the bytes XOR "K", decoded by the page's own script (no further call), so it cannot be matched
 * by a pattern; each runner has a page of their own instead, `/bc/resultats/coureur.jsp?ref=<ref>&heat=<heat>&dossard=<bib>`,
 * server-rendered: the name and the bib in its title ("FALL Mor (N°347)"), and "Temps Officiel" with its value. A
 * runner who did not finish (DNF, DNS) has the page with "00:00:00"; a bib nobody wore answers an empty page.
 */

export const MARATHON_SOURCE = "Breizh Chrono";

export type MarathonRace = Readonly<{
  /** The race in Viky's terms, `dakar-2023`. */
  raceId: string;
  /** Who times it, which decides the source that reads it. */
  timer: "breizh-chrono";
  /** The timing company's own reference of the event, and the heat inside it. */
  ref: string;
  heat: string;
  /** The race as the timing company names it, with the year. */
  name: string;
  /** Where it is run, two letters, and the town. */
  country: string;
  town: string;
  /** When it starts, as the timing company's own page dates it: the bib field closes then. */
  startsAt: string;
}>;

/**
 * The races a gift can be made on. Each is read on the timing company's own pages before it is written here; a race
 * of a coming year is added the day the timing company publishes its page (the founder: the Marathon de Paris when
 * its site answers).
 */
export const MARATHON_RACES: readonly MarathonRace[] = [
  {
    raceId: "dakar-2023",
    timer: "breizh-chrono",
    ref: "1488071608761-442",
    heat: "marathon",
    name: "Marathon de Dakar 2023",
    country: "SN",
    town: "Dakar",
    // The page's own `startDate`, "2023-11-19T00:00:00+0100" (schema.org, read 26 Sep 2026).
    startsAt: "2023-11-19T00:00:00+01:00",
  },
];

export function marathonRaceById(raceId: string): MarathonRace | undefined {
  return MARATHON_RACES.find((race) => race.raceId === raceId);
}

/** A bib as a timing company prints it: one to six figures. */
export function isValidBib(value: string): boolean {
  return /^\d{1,6}$/.test(value.trim());
}

/** Whether the bib can still be entered: before the race starts, and never after (the founder, 26 Sep 2026). */
export function bibStillOpen(race: MarathonRace, nowMs: number): boolean {
  return nowMs < new Date(race.startsAt).getTime();
}

/** The account the reading service reads: the race's reference and heat, and the bib, in one string. */
export function marathonAccount(race: Pick<MarathonRace, "ref" | "heat">, bib: string): string {
  return `${race.ref}|${race.heat}|${bib.trim()}`;
}

export function marathonAccountOf(account: string): Readonly<{ ref: string; heat: string; bib: string }> | undefined {
  const match = /^(\d{10,16}-\d{1,6})\|([a-z0-9-]{1,40})\|(\d{1,6})$/.exec(account);
  return match ? { ref: match[1], heat: match[2], bib: match[3] } : undefined;
}

/** The person and the race, as the funder signs them (`subject`): the result pays only when both match. */
export function marathonSubject(name: string, raceId: string): Hex {
  return keccak256(stringToHex(`viky:marathon:v1:${normaliseCertificateName(name)}:${raceId.trim().toLowerCase()}`));
}

/** Whether the name the page prints is the name the funder wrote: no case, no accents, no order (the founder). */
export function sameRunner(printed: string, written: string): boolean {
  const a = normaliseCertificateName(printed);
  const b = normaliseCertificateName(written);
  return a.length > 0 && a === b;
}

export const DAY_SECONDS = 24 * 60 * 60;

/** "02:30:05", as the page prints an official time, in seconds; nothing for "00:00:00", a runner who did not finish. */
export function finishSecondsOf(printed: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(printed.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 && seconds < DAY_SECONDS ? seconds : undefined;
}

/** What the contract compares: seconds under twenty-four hours, so a faster time is a higher number. */
export function marathonMetricOf(finishSeconds: number): number {
  return DAY_SECONDS - finishSeconds;
}

/** The target for "under X hours": the metric of exactly X hours; "finish" is 1, any time under a day. */
export const MARATHON_FINISH = 1;
export function marathonTargetUnderHours(hours: number): number {
  return DAY_SECONDS - Math.round(hours * 3600);
}

/** The hours a target stands for, for the words: "finish" for 1, "under 4 h 30" for a time. */
export function marathonTargetInWords(target: number): string {
  if (target <= MARATHON_FINISH) return "finish the race";
  const seconds = DAY_SECONDS - target;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `finish in under ${hours} h${minutes > 0 ? ` ${String(minutes).padStart(2, "0")}` : ""}`;
}

export function finishInWords(finishSeconds: number): string {
  const h = Math.floor(finishSeconds / 3600);
  const m = Math.floor((finishSeconds % 3600) / 60);
  const s = finishSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const MARATHON_DURATION_DAYS = Object.freeze({ min: 7, max: 400, suggested: 120 });

/** Goal 30 on `MilestoneGift`, after MITx Online's 29. */
export const MARATHON_GOAL_TYPE = 30;

export function marathonProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:breizh-chrono-zkfetch:v1"));
}
