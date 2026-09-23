import { keccak256, stringToHex, type Hex } from "viem";

/**
 * What a person shows from their own student portal (D165, D174): the second nature's university rail, and the
 * corridor's own case, a family abroad paying the year.
 *
 * Three conditions on one rail, each with its own goal on the milestone contract and its own subject: enrolled
 * (goal 14), the year passed (goal 15) and a grade reached (goal 16). One goal per condition for the whole family
 * of portals, and the portal pinned in each gift: the subject the funder signs is the hash of the portal's id under
 * the condition's own name, so a proof shown from another portal, or for another of the three, fails the contract's
 * own `identityHash == subject` check, exactly as a certificate in another name does. A goal per portal would give
 * nothing the subject does not already give, and would cost an owner signature through the Safe every time a
 * university is added; the subject costs nothing and is signed by the funder, who is the one choosing the university.
 *
 * Enrolment is read from the page that says enrolled (`PortalExtract`); the year and the grade are read from the
 * portal's results page (`ResultsExtract`), a second provider on the same row, registered from a student's own
 * session like the first. A portal proved for enrolment alone takes no gift on the year or the grade.
 */

export const UNIVERSITY_SOURCE = "their university";
export const UNIVERSITY_GOAL_TYPE = 14;
export const UNIVERSITY_YEAR_GOAL_TYPE = 15;
export const UNIVERSITY_GRADE_GOAL_TYPE = 16;

/** The three goals made on a student portal: each of their gifts names its portal, and the create route checks the row. */
export function isUniversityGoal(goalType: number): boolean {
  return goalType === UNIVERSITY_GOAL_TYPE || goalType === UNIVERSITY_YEAR_GOAL_TYPE || goalType === UNIVERSITY_GRADE_GOAL_TYPE;
}

/** What every attestation for enrolment carries, whatever the portal: the goal's provider id on the contract. */
export function universityShownProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:university-enrollment-shown:v1"));
}

/** The year passed, shown from the results page: goal 15's provider id. */
export function universityYearProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:university-year-passed-shown:v1"));
}

/** A grade reached, shown from the results page: goal 16's provider id. */
export function universityGradeProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:university-grade-shown:v1"));
}

function subjectOf(condition: string, portalId: string): Hex {
  return keccak256(stringToHex(`viky:subject:${condition}:v1:${portalId.trim().toLowerCase()}`));
}

/** The portal, bound into what the funder signs. Two gifts on two portals never share a subject. */
export function universitySubject(portalId: string): Hex {
  return subjectOf("university-enrollment-shown", portalId);
}

/** The same portal under the year's own name: a proof of enrolment can never settle a gift on the year (D174). */
export function universityYearSubject(portalId: string): Hex {
  return subjectOf("university-year-passed-shown", portalId);
}

export function universityGradeSubject(portalId: string): Hex {
  return subjectOf("university-grade-shown", portalId);
}

/** Having it or not: enrolled is one, and a proof that shows it carries one. */
export const UNIVERSITY_ENROLLED = 1;

/** Having it or not: the year passed is one, and a proof that shows it carries one. */
export const UNIVERSITY_PASSED = 1;

/** As a course certificate: a year is long, and a semester is not thirty days. */
export const UNIVERSITY_DURATION_DAYS = Object.freeze({ min: 30, max: 365, suggested: 180 });

/** Results come out once or twice a year, so the window is the enrolment's. */
export const UNIVERSITY_RESULTS_DURATION_DAYS = UNIVERSITY_DURATION_DAYS;

/** The country a portal's row names by two letters, in words for the chooser's line: "SN" reads "Senegal". */
export function countryInWords(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** A portal id as our own table names it: lower case, letters, digits and dashes, like `ucad-sn` or `sorbonne-fr`. */
export function isPortalId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}

/** What a portal's page must show for the person to be enrolled, as the portal's own row says it (src/portal-store.ts). */
export type PortalExtract = Readonly<{
  /** The field the Reclaim provider extracts, by the name the provider gives it. */
  field: string;
  /** A pattern the field's value must match to mean enrolled: a status, or the current academic year. */
  matches: string;
  /** What Viky keeps of it, in words, printed to the person before they show anything. */
  keeps: string;
}>;

function patternOf(matches: string): RegExp | undefined {
  try {
    return new RegExp(matches, "i");
  } catch {
    return undefined;
  }
}

/** Whether the fields a proof carried say enrolled, by the portal's own rule. Nothing else about the person is read. */
export function enrolledBy(extract: PortalExtract, fields: Readonly<Record<string, string>>): boolean {
  const value = fields[extract.field];
  if (typeof value !== "string") return false;
  const pattern = patternOf(extract.matches);
  return pattern ? pattern.test(value) : false;
}

/**
 * How a portal grades (D174). Numeric scales only tonight: out of 20, a GPA out of 4, or out of N in a step. A
 * scale of letters is declared on the row so the portal is described as it is, and a gift on a grade is refused
 * at creation with `LETTER_SCALE` until a later PR says what a letter is worth.
 */
export type GradeScale =
  | Readonly<{ kind: "numeric"; max: number; step: number }>
  | Readonly<{ kind: "letters"; grades: readonly string[] }>;

/** A grade is carried to the contract in hundredths: 14.00 out of 20 is 1400, a GPA of 3.50 is 350. */
export const GRADE_UNITS = 100;

/** The most decimals a grade or a step can carry: two, which is what a page prints and what the units hold. */
function inHundredths(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * GRADE_UNITS - Math.round(value * GRADE_UNITS)) < 1e-6;
}

/** What is wrong with a scale as the row holds it, or nothing. */
export function gradeScaleProblem(scale: unknown): string | undefined {
  if (!scale || typeof scale !== "object") return "a grade scale";
  const shape = scale as { kind?: unknown; max?: unknown; step?: unknown; grades?: unknown };
  if (shape.kind === "numeric") {
    if (typeof shape.max !== "number" || !inHundredths(shape.max) || shape.max <= 0 || shape.max > 1_000) return "a numeric scale out of a number between 0.01 and 1000";
    if (typeof shape.step !== "number" || !inHundredths(shape.step) || shape.step <= 0 || shape.step > shape.max) return "a step between 0.01 and the scale's top";
    return undefined;
  }
  if (shape.kind === "letters") {
    if (!Array.isArray(shape.grades) || shape.grades.length < 2 || shape.grades.some((grade) => typeof grade !== "string" || !grade.trim())) return "a scale of at least two letters";
    return undefined;
  }
  return "a scale that is numeric or letters";
}

/**
 * A scale as an operator types it on the command line: `20` is out of 20 in hundredths, `4` a GPA, `20/0.5` out of
 * 20 in halves, `letters:A,B,C,D,E,F` a scale of letters. Nothing else is a scale.
 */
export function gradeScaleOf(text: string): GradeScale | undefined {
  const typed = text.trim();
  const letters = typed.match(/^letters:(.+)$/i);
  if (letters) {
    const grades = letters[1].split(",").map((grade) => grade.trim()).filter(Boolean);
    const scale: GradeScale = { kind: "letters", grades };
    return gradeScaleProblem(scale) ? undefined : scale;
  }
  const numeric = typed.match(/^(\d+(?:\.\d{1,2})?)(?:\/(\d+(?:\.\d{1,2})?))?$/);
  if (!numeric) return undefined;
  const scale: GradeScale = { kind: "numeric", max: Number(numeric[1]), step: numeric[2] ? Number(numeric[2]) : 1 / GRADE_UNITS };
  return gradeScaleProblem(scale) ? undefined : scale;
}

/** The scale in words, for a refusal: "out of 20, in steps of 0.5". */
export function gradeScaleInWords(scale: GradeScale): string {
  if (scale.kind === "letters") return `letters, ${scale.grades.join(", ")}`;
  return scale.step === 1 / GRADE_UNITS ? `out of ${scale.max}` : `out of ${scale.max}, in steps of ${scale.step}`;
}

/** The contract's integer for a grade typed on its scale: hundredths, rounded to the nearest. */
export function gradeUnits(value: number): number {
  return Math.round(value * GRADE_UNITS);
}

/** A grade as the person and the funder read it: two decimals and the scale's top, "14.00 / 20". */
export function gradeInWords(units: number | bigint, scale: GradeScale): string {
  const value = Number(units) / GRADE_UNITS;
  if (scale.kind === "letters") return value.toFixed(2);
  return `${value.toFixed(2)} / ${scale.max}`;
}

/** A grade as a results page prints it, "14,50" or "14.5": a number with two decimals at most, or nothing. */
export function gradeOf(text: string | undefined): number | undefined {
  if (typeof text !== "string") return undefined;
  const match = text.trim().match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/);
  if (!match) return undefined;
  return Number(`${match[1]}.${match[2] ?? "0"}`);
}

/** Whether a number is the shape of a grade at all, before the portal's scale is known: above zero, in hundredths. */
export function isGradeShape(value: number): boolean {
  return inHundredths(value) && value > 0 && value <= 1_000;
}

/** Why a gift on the year or on a grade cannot be made on a portal proved for enrolment alone (D174). */
export const NO_RESULTS_PAGE = Object.freeze({
  code: "NO_RESULTS_PAGE",
  message: "Viky has proved this university's portal for enrolment and not for its results page yet, so nothing can be shown from it.",
});

/** Whether a value read from a page is a grade on this numeric scale: from zero to its top, in hundredths. */
export function isGradeOnScale(scale: GradeScale, value: number): boolean {
  if (scale.kind !== "numeric") return false;
  return inHundredths(value) && value >= 0 && value <= scale.max;
}

/** Why a target the funder typed cannot be signed on this scale, by code, or nothing. */
export function gradeTargetProblem(scale: GradeScale, target: number): Readonly<{ code: string; message: string }> | undefined {
  if (scale.kind === "letters") return { code: "LETTER_SCALE", message: `This university grades in ${gradeScaleInWords(scale)}, and a gift on a letter grade is not offered yet.` };
  const stepUnits = gradeUnits(scale.step);
  if (!isGradeOnScale(scale, target) || target <= 0 || gradeUnits(target) % stepUnits !== 0) {
    return { code: "INVALID_TARGET", message: `A grade above 0 and up to ${scale.max}, ${gradeScaleInWords(scale)}.` };
  }
  return undefined;
}

/**
 * What a portal's results page must show, as the row says it (D174): its own provider and request, the field that
 * says passed and its pattern, the field that carries the grade and the scale it is on, and, when the page dates
 * itself, the field that names the year and the pattern this year's page matches. A page of another year does not
 * pay; without a year field, the day of the proof is what dates it.
 */
export type ResultsExtract = Readonly<{
  providerId: string;
  providerVersion: string;
  requestHash: string;
  admitted: Readonly<{ field: string; matches: string }>;
  grade: Readonly<{ field: string; scale: GradeScale }>;
  year?: Readonly<{ field: string; matches: string }>;
}>;

const HASH = /^0x[0-9a-fA-F]{64}$/;

/** What is wrong with a results extraction as the row would hold it, or nothing. */
export function resultsProblem(results: unknown): string | undefined {
  if (!results || typeof results !== "object") return "a results extraction";
  const shape = results as Partial<ResultsExtract>;
  if (typeof shape.providerId !== "string" || !/^[0-9a-f-]{36}$/.test(shape.providerId)) return "the results provider's id, 36 characters";
  if (typeof shape.providerVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(shape.providerVersion)) return "the results provider's version like 1.0.0";
  if (typeof shape.requestHash !== "string" || !HASH.test(shape.requestHash)) return "the results request's hash, 32 bytes of hex";
  if (!shape.admitted || !shape.admitted.field?.trim() || !shape.admitted.matches?.trim()) return "the field that says passed, and what it must match";
  if (!patternOf(shape.admitted.matches)) return "a pattern for passed that is a valid regular expression";
  if (!shape.grade || !shape.grade.field?.trim()) return "the field that carries the grade";
  const scale = gradeScaleProblem(shape.grade.scale);
  if (scale) return scale;
  if (shape.year !== undefined) {
    if (!shape.year || !shape.year.field?.trim() || !shape.year.matches?.trim()) return "the field that names the year, and what this year's page matches";
    if (!patternOf(shape.year.matches)) return "a pattern for the year that is a valid regular expression";
  }
  return undefined;
}

/** What a results page said, by the row's own rule: a number for the contract and the words for the person, or why not. */
export type ResultsVerdict = Readonly<{ kind: "read"; metricValue: number; inWords: string }> | Readonly<{ kind: "refused"; code: string; message: string }>;

/** A page of another year than the row names does not pay, whichever of the two conditions asks (D174). */
function wrongTerm(results: ResultsExtract, fields: Readonly<Record<string, string>>): ResultsVerdict | undefined {
  if (!results.year) return undefined;
  const value = fields[results.year.field];
  const pattern = patternOf(results.year.matches);
  if (typeof value !== "string" || !pattern || !pattern.test(value)) return { kind: "refused", code: "WRONG_TERM", message: "The results page shown is not this year's." };
  return undefined;
}

/** Whether the results page says the year is passed, by the field and pattern the row names. */
export function yearPassedBy(results: ResultsExtract, fields: Readonly<Record<string, string>>): ResultsVerdict {
  const term = wrongTerm(results, fields);
  if (term) return term;
  const value = fields[results.admitted.field];
  const pattern = patternOf(results.admitted.matches);
  if (typeof value !== "string" || !pattern || !pattern.test(value)) return { kind: "refused", code: "NOT_PASSED", message: "The results page shown does not say passed." };
  return { kind: "read", metricValue: UNIVERSITY_PASSED, inWords: "Passed" };
}

/** The grade the results page carries, on the row's scale, in hundredths for the contract and in words for the person. */
export function gradeShownBy(results: ResultsExtract, fields: Readonly<Record<string, string>>): ResultsVerdict {
  const term = wrongTerm(results, fields);
  if (term) return term;
  const scale = results.grade.scale;
  if (scale.kind === "letters") return { kind: "refused", code: "LETTER_SCALE", message: "This university grades in letters, and a letter grade cannot settle a gift yet." };
  const grade = gradeOf(fields[results.grade.field]);
  if (grade === undefined || !isGradeOnScale(scale, grade)) return { kind: "refused", code: "NO_GRADE", message: "The results page shown carries no grade on the university's scale." };
  const units = gradeUnits(grade);
  return { kind: "read", metricValue: units, inWords: gradeInWords(units, scale) };
}
