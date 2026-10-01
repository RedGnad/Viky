import { keccak256, stringToHex, type Hex } from "viem";
import { normaliseCertificateName } from "./duolingo-english-test";
import { MILESTONE_MAX_DURATION_DAYS } from "./milestone-protocol";

/**
 * "Set a time at a WCA competition" (the founder's decision of 27 Sep 2026): a milestone of the Play family, read
 * for the person from the World Cube Association's public API, the way a marathon is read from its timing company
 * (D273). The funder chooses the coming competition and the event, and writes the person's name; before the day,
 * the public list of competitors stands in for the bib; after it, the person's results have to carry that name
 * with a result in that event. Browser safe.
 *
 * What is scored: the best single of the event at that competition, in hundredths of a second under one hour, so
 * that "under X seconds" is a target the contract compares as it compares every other (higher is better), and "a
 * result" is any time at all. Fewest Moves counts moves and Multi-Blind encodes points: on those, "a result" alone.
 */

export const WCA_SOURCE = "the WCA";

/** The seventeen events of the WCA, by the ids its API prints, named as the WCA names them. */
export const WCA_EVENTS: Readonly<Record<string, string>> = {
  "333": "3x3x3 Cube",
  "222": "2x2x2 Cube",
  "444": "4x4x4 Cube",
  "555": "5x5x5 Cube",
  "666": "6x6x6 Cube",
  "777": "7x7x7 Cube",
  "333bf": "3x3x3 Blindfolded",
  "333fm": "3x3x3 Fewest Moves",
  "333oh": "3x3x3 One-Handed",
  clock: "Clock",
  minx: "Megaminx",
  pyram: "Pyraminx",
  skewb: "Skewb",
  sq1: "Square-1",
  "444bf": "4x4x4 Blindfolded",
  "555bf": "5x5x5 Blindfolded",
  "333mbf": "3x3x3 Multi-Blind",
};

/** The events whose result is a time in hundredths of a second: every one but Fewest Moves and Multi-Blind. */
export function wcaEventIsTimed(eventId: string): boolean {
  return eventId in WCA_EVENTS && eventId !== "333fm" && eventId !== "333mbf";
}

export function isWcaCompetitionId(value: string): boolean {
  return /^[A-Za-z0-9]{1,64}$/.test(value);
}
export function isWcaId(value: string): boolean {
  return /^\d{4}[A-Z]{4}\d{2}$/.test(value.trim().toUpperCase());
}

/** What a gift is made on: one competition and one event, `GanOpen2026/333`. */
export function wcaCourseId(competitionId: string, eventId: string): string {
  return `${competitionId}/${eventId}`;
}
export function wcaCourseOf(courseId: string): { competitionId: string; eventId: string } | undefined {
  const [competitionId, eventId] = courseId.trim().split("/");
  return competitionId && eventId && isWcaCompetitionId(competitionId) && eventId in WCA_EVENTS ? { competitionId, eventId } : undefined;
}

/** Whether the competitors list can still be checked: before the competition's first day, never after. */
export function competitionStillOpen(startDate: string, nowMs: number): boolean {
  return nowMs < new Date(`${startDate}T00:00:00Z`).getTime();
}

/** A result as the API prints it, in hundredths of a second (Fewest Moves: moves; Multi-Blind: an encoded score); -1 is a DNF, -2 a DNS. */
export const WCA_MAX_CENTISECONDS = 360_000;
export const WCA_ANY_RESULT = 1;

/** What the contract compares: hundredths under an hour for a time, one for a result that is not a time. Nothing for no result. */
export function wcaMetricOf(best: number, eventId: string): number | undefined {
  if (!(best > 0)) return undefined;
  return wcaEventIsTimed(eventId) && best < WCA_MAX_CENTISECONDS ? WCA_MAX_CENTISECONDS - best : WCA_ANY_RESULT;
}

/** The target for "under X seconds": the metric of exactly X seconds; "a result" is one. */
export function wcaTargetUnderSeconds(seconds: number): number {
  return WCA_MAX_CENTISECONDS - Math.round(seconds * 100);
}

/** "7.91 s", "1:05.32" for a time; "23 moves" for Fewest Moves; "a result" for Multi-Blind. */
export function wcaResultInWords(best: number, eventId: string): string {
  if (eventId === "333fm") return `${best} moves`;
  if (eventId === "333mbf") return "a result";
  const centiseconds = best % 100;
  const seconds = Math.floor(best / 100) % 60;
  const minutes = Math.floor(best / 6_000);
  const tail = `${String(seconds).padStart(minutes > 0 ? 2 : 1, "0")}.${String(centiseconds).padStart(2, "0")}`;
  return minutes > 0 ? `${minutes}:${tail}` : `${tail} s`;
}

/** The seconds a target stands for, for the words: "a result" for one, "under 15.50 s" for a time. */
export function wcaTargetInWords(target: number): string {
  if (target <= WCA_ANY_RESULT) return "set a result";
  return `set a single under ${wcaResultInWords(WCA_MAX_CENTISECONDS - target, "333")}`;
}

/**
 * A competitor's name without what the WCA prints after it in parentheses, which is the same name in the person's own
 * script: "Yiheng Wang (王艺衡)" is Yiheng Wang (the audit of 1 Oct 2026). A funder writes the name as people say it,
 * the API prints both, and compared whole the two never matched, so such a person's result paid nothing. Only a
 * parenthesis that ends the name is dropped, and a name that is nothing else is kept as it is.
 */
export function wcaNameOf(name: string): string {
  const bare = name.replace(/\s*\([^()]*\)\s*$/u, "").trim();
  return bare.length > 0 ? bare : name.trim();
}

/** The person, the competition and the event, as the funder signs them (`subject`): a result pays only when all match. */
export function wcaSubject(name: string, courseId: string): Hex {
  return keccak256(stringToHex(`viky:wca:v1:${normaliseCertificateName(wcaNameOf(name))}:${courseId.trim()}`));
}

/** Whether the name the API prints is the name the funder wrote: no case, no accents, no order, no local script after it. */
export function sameCuber(printed: string, written: string): boolean {
  const a = normaliseCertificateName(wcaNameOf(printed));
  const b = normaliseCertificateName(wcaNameOf(written));
  return a.length > 0 && a === b;
}

/** The account the reading service reads: the person's WCA id, the competition, the event and the round of the result. */
export function wcaAccount(wcaId: string, competitionId: string, eventId: string, round: string): string {
  return `${wcaId.trim().toUpperCase()}|${competitionId}|${eventId}|${round}`;
}
export function wcaAccountOf(account: string): { wcaId: string; competitionId: string; eventId: string; round: string } | undefined {
  const match = /^(\d{4}[A-Z]{4}\d{2})\|([A-Za-z0-9]{1,64})\|([a-z0-9]{3,6})\|([0-9a-h])$/.exec(account);
  return match && match[3] in WCA_EVENTS ? { wcaId: match[1], competitionId: match[2], eventId: match[3], round: match[4] } : undefined;
}

export const WCA_DURATION_DAYS = Object.freeze({ min: 7, max: MILESTONE_MAX_DURATION_DAYS, suggested: 120 });

/** Goal 32 on `MilestoneGift`, after MikaTiming's 31. */
export const WCA_GOAL_TYPE = 32;

export function wcaProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:wca-zkfetch:v1"));
}
