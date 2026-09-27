import { keccak256, stringToHex, type Hex } from "viem";
import type { ResultsVerdict } from "./university-shown";

/**
 * Examination results the person shows from their own account (D176): the family "School & studies" (Pass an exam until D220), beside the TOEFL
 * score (D164). Five lines tonight, each a condition of the second nature (D162): a Cambridge English result, an
 * IELTS band, and the baccalauréat passed in Morocco, in Cameroon and in France.
 *
 * What they share with the TOEFL: one proof, shown in a verification tab where the person signs in to the service
 * themselves (their identifiers are typed in their own browser and never reach Viky), the subject constant per
 * condition because the page carries no name the funder could sign, the day it is shown as the event, and one goal
 * each on the milestone contract. What they do not have yet: a provider. No provider of the Reclaim directory reads
 * any of these pages (the directory searched on 23 Sep 2026: none for IELTS, none for Cambridge English, none for a
 * baccalauréat), so each is a provider of ours, registered on the dashboard from a real candidate's session
 * (docs/reclaim/<id>-provider.md says the page, the sign-in and the fields), and pinned here the day it exists.
 * Until then `EXAM_PROVIDERS` holds nothing for it, a gift cannot be made on it (the create route refuses
 * `NOT_CONFIGURED` by name), and the line stays "Being built" behind the operator door.
 */

export type ExamId = "cambridge-english-shown" | "ielts-shown" | "bac-morocco-shown" | "bac-cameroon-shown" | "bac-france-shown";

export const EXAM_IDS: readonly ExamId[] = ["cambridge-english-shown", "ielts-shown", "bac-morocco-shown", "bac-cameroon-shown", "bac-france-shown"];

/** The goals on the milestone contract, after the university rail's 14 to 16 (D174): one each, to be signed by the owner. */
export const EXAM_GOAL_TYPES: Readonly<Record<ExamId, number>> = {
  "cambridge-english-shown": 17,
  "ielts-shown": 18,
  "bac-morocco-shown": 19,
  "bac-cameroon-shown": 20,
  "bac-france-shown": 21,
};

/** What every attestation for a line carries: the goal's provider id, so one exam's proof never settles another's gift. */
export function examProviderId(id: ExamId): Hex {
  return keccak256(stringToHex(`viky:provider:${id}:v1`));
}

/** The subject the funder signs: the same for every gift on a line, because the proof carries no name (D162). */
export function examSubject(id: ExamId): Hex {
  return keccak256(stringToHex(`viky:subject:${id}:v1`));
}

/** A provider of ours, pinned once registered from a real account: its id, its version and the hash of its one request. */
export type ExamProvider = Readonly<{ id: string; version: string; requestHash: string }>;

/**
 * Nothing yet, for all five: each waits for a real candidate's session on the dashboard. The day one is registered,
 * its row here is filled in one commit, and the line can be made on by an operator, then shown end to end.
 */
export const EXAM_PROVIDERS: Readonly<Record<ExamId, ExamProvider | null>> = {
  "cambridge-english-shown": null,
  "ielts-shown": null,
  "bac-morocco-shown": null,
  "bac-cameroon-shown": null,
  "bac-france-shown": null,
};

/** What the create route and the verification say while a line's provider is not registered: by name, never "no portal". */
export const EXAM_NOT_REGISTERED = "This condition's provider is not registered yet: it is built from a real candidate's account first, and nothing can be shown until then.";

/** Where the person signs in, in their own browser, for the docs and for the operator: the results page of each service, read on 23 Sep 2026. */
export const EXAM_LOGIN_URLS: Readonly<Record<ExamId, string>> = {
  "cambridge-english-shown": "https://candidates.cambridgeenglish.org/Members/Login.aspx",
  "ielts-shown": "https://ieltsregistration.britishcouncil.org/ttp",
  "bac-morocco-shown": "https://bac.t3.technology/verify",
  "bac-cameroon-shown": "https://epimexam.cm/",
  "bac-france-shown": "https://candidat.examens-concours.gouv.fr/cyccandidat/portal/login",
};

/** The two windows: a test result is shown within the TOEFL's window, a baccalauréat within the year's. */
export const EXAM_DURATION_DAYS = Object.freeze({ min: 14, max: 180, suggested: 90 });
export const BAC_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/**
 * The Cambridge English Scale, 80 to 230, the same score meaning the same level whatever the exam. The levels' floors
 * were read on 23 Sep 2026 on Cambridge English's own results pages: B2 First (140 to 159 is B1, 160 to 179 B2, 180
 * and above C1), C1 Advanced (180 to 199 C1, 200 and above C2), C2 Proficiency (200 to 230 C2). Below 140 the page
 * reports a score and no level of these; the levels A1 and A2 were not read tonight and are not written.
 */
export const CAMBRIDGE_SCALE = Object.freeze({ min: 80, max: 230 });
export const CAMBRIDGE_LEVELS: readonly Readonly<{ level: "B1" | "B2" | "C1" | "C2"; from: number }>[] = [
  { level: "B1", from: 140 },
  { level: "B2", from: 160 },
  { level: "C1", from: 180 },
  { level: "C2", from: 200 },
];

export function isValidCambridgeScore(value: number): boolean {
  return Number.isInteger(value) && value >= CAMBRIDGE_SCALE.min && value <= CAMBRIDGE_SCALE.max;
}

/** The level a score stands for, from B1 up, or nothing below 140. */
export function cambridgeLevelOf(score: number): "B1" | "B2" | "C1" | "C2" | null {
  let found: "B1" | "B2" | "C1" | "C2" | null = null;
  for (const { level, from } of CAMBRIDGE_LEVELS) if (score >= from) found = level;
  return found;
}

/** A score as the page prints it, "172": an integer on the scale, or nothing. */
export function cambridgeScoreOf(text: string | undefined): number | undefined {
  if (typeof text !== "string" || !/^\s*\d{2,3}\s*$/.test(text)) return undefined;
  const score = Number(text.trim());
  return isValidCambridgeScore(score) ? score : undefined;
}

/** "172 on the Cambridge English Scale, B2": what the person reads back, and what the funder's screens say of a target. */
export function cambridgeInWords(score: number): string {
  const level = cambridgeLevelOf(score);
  return `${score} on the Cambridge English Scale${level ? `, ${level}` : ""}`;
}

/** The Statement of Results, read by the field our provider names (to confirm on a real account, docs/reclaim). */
export function readCambridge(fields: Readonly<Record<string, string>>): ResultsVerdict {
  const score = cambridgeScoreOf(fields.overallScore);
  if (score === undefined) return { kind: "refused", code: "INVALID_SCORE", message: "The page showed no overall score on the Cambridge English Scale." };
  return { kind: "read", metricValue: score, inWords: cambridgeInWords(score) };
}

/**
 * IELTS bands run from 1 to 9 in whole and half bands (British Council, "IELTS band scores", read 23 Sep 2026). A band
 * is carried to the contract in tenths, 6.5 as 65, and the funder's target is signed the same way.
 */
export const IELTS_BAND = Object.freeze({ min: 1, max: 9, step: 0.5 });
export const IELTS_UNITS = 10;

export function isValidIeltsBand(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value * 2) && value >= IELTS_BAND.min && value <= IELTS_BAND.max;
}

export function ieltsUnits(band: number): number {
  return Math.round(band * IELTS_UNITS);
}

/** A band as the page prints it, "6.5" or "6": a half band on the scale, or nothing. */
export function ieltsBandOf(text: string | undefined): number | undefined {
  if (typeof text !== "string") return undefined;
  const match = text.trim().match(/^(\d)(?:[.,](\d))?$/);
  if (!match) return undefined;
  const band = Number(`${match[1]}.${match[2] ?? "0"}`);
  return isValidIeltsBand(band) ? band : undefined;
}

export function ieltsInWords(units: number | bigint): string {
  return `Band ${(Number(units) / IELTS_UNITS).toFixed(1)}`;
}

/** The overall band, read by the field our provider names (to confirm on a real account, docs/reclaim). */
export function readIelts(fields: Readonly<Record<string, string>>): ResultsVerdict {
  const band = ieltsBandOf(fields.overallBand);
  if (band === undefined) return { kind: "refused", code: "INVALID_BAND", message: "The page showed no overall band." };
  const units = ieltsUnits(band);
  return { kind: "read", metricValue: units, inWords: ieltsInWords(units) };
}

/** Having it or not: passed is one, and a proof that shows it carries one. */
export const BAC_PASSED = 1;

/** What a results page says when the candidate passed, in the three services' own words: to confirm on a real page. */
export const BAC_PASSED_PATTERN = "^admis";

/** The decision, read by the field our provider names: passed by the pattern, or refused by name. */
export function readBacPassed(fields: Readonly<Record<string, string>>): ResultsVerdict {
  const decision = fields.decision;
  if (typeof decision !== "string" || !new RegExp(BAC_PASSED_PATTERN, "i").test(decision.trim())) {
    return { kind: "refused", code: "NOT_PASSED", message: "The results page shown does not say passed." };
  }
  return { kind: "read", metricValue: BAC_PASSED, inWords: "Passed" };
}
