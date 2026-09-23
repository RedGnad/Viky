import { keccak256, stringToHex, type Hex } from "viem";
import { gradeInWords, gradeOf, gradeUnits, isGradeOnScale, type GradeScale, type ResultsVerdict } from "./university-shown";

/**
 * A school average shown from the pupil's or the family's own EcoleDirecte account (D179): the family "School", of
 * the second nature (D162), with a target as the university grade has (D174). Two services were read for it, and one
 * is built: EcoleDirecte, whose publisher's terms (Aplim, "Dispositions générales applicables EcoleDirecte", read
 * 23 Sep 2026) say the holder of a password reaches only the information about themselves or those they answer for,
 * and name no program; PRONOTE is not, because its publisher's terms forbid any device retrieving data from its sites
 * without its written authorisation (Index Education, "Mentions légales et Conditions Générales d'Utilisation", the
 * same day), and the spaces are on its sites.
 *
 * French schools grade out of 20, in hundredths, and EcoleDirecte prints the average that way: the scale is fixed
 * here rather than declared on a row, and a grade is carried to the contract in hundredths as on the university rail.
 * The provider is ours, registered from a real pupil's session (docs/reclaim/ecoledirecte-grade-shown-provider.md);
 * nothing tonight.
 */

export const ECOLEDIRECTE_SOURCE = "EcoleDirecte";
export const ECOLEDIRECTE_GOAL_TYPE = 23;

export function ecoleDirecteProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:ecoledirecte-grade-shown:v1"));
}

/** The subject the funder signs: the same for every gift on the line, because the page carries no name they could sign. */
export const ECOLEDIRECTE_SUBJECT: Hex = keccak256(stringToHex("viky:subject:ecoledirecte-grade-shown:v1"));

/** Out of 20, in hundredths: the one scale of French schools, and the one EcoleDirecte prints. */
export const SCHOOL_SCALE: GradeScale = Object.freeze({ kind: "numeric", max: 20, step: 0.01 });

/** A term is a few months, and a year is long. */
export const SCHOOL_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 120 });

/** A provider of ours, pinned once registered from a real account: nothing tonight. */
export type SchoolProvider = Readonly<{ id: string; version: string; requestHash: string }>;
export const ECOLEDIRECTE_PROVIDER: SchoolProvider | null = null;

export const ECOLEDIRECTE_NOT_REGISTERED = "This condition's provider is not registered yet: it is built from a real EcoleDirecte account first, and nothing can be shown until then.";

/** Where the person signs in, in their own browser: the pupil's or the family's own space. */
export const ECOLEDIRECTE_LOGIN_URL = "https://www.ecoledirecte.com/login";

/** Whether a target typed by the funder is a grade out of 20 in hundredths, above zero. */
export function isValidSchoolTarget(value: number): boolean {
  return isGradeOnScale(SCHOOL_SCALE, value) && value > 0;
}

/** "14.50 / 20", for the funder's screens and for what the person reads back. */
export function schoolGradeInWords(value: number): string {
  return gradeInWords(gradeUnits(value), SCHOOL_SCALE);
}

/**
 * The overall average the grades page carries, by the field our provider names (to confirm on a real account):
 * "14,50" as EcoleDirecte prints it, read out of 20 and carried in hundredths.
 */
export function readSchoolAverage(fields: Readonly<Record<string, string>>): ResultsVerdict {
  const average = gradeOf(fields.average);
  if (average === undefined || !isGradeOnScale(SCHOOL_SCALE, average)) return { kind: "refused", code: "NO_GRADE", message: "The grades page shown carries no average out of 20." };
  const units = gradeUnits(average);
  return { kind: "read", metricValue: units, inWords: gradeInWords(units, SCHOOL_SCALE) };
}
