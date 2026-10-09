import { keccak256, stringToHex, type Hex } from "viem";

/** What the chooser printed beside a university whose portal row is unverified (D193, D195); out of the flow since D267. */
export const UNVERIFIED_MARK = " (unverified)";

/**
 * What a portal proves (D267, the founder's integrity point of 26 Sep 2026): its enrolment status for the year, or only
 * that a student account is signed in. The gift says which, so its sentence is exactly what the proof carries.
 */

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
 * How a portal grades (D174): out of 20, a GPA out of 4, out of N in a step, or in letters. Letters are compared in one
 * order whatever the university (`LETTER_GRADES`), so a letter a funder chose and a letter a page prints are ranked the
 * same way (the founder, 28 Sep 2026).
 */
export type GradeScale =
  | Readonly<{ kind: "numeric"; max: number; step: number }>
  | Readonly<{ kind: "letters"; grades: readonly string[] }>;

/** A grade is carried to the contract in hundredths: 14.00 out of 20 is 1400, a GPA of 3.50 is 350. */
export const GRADE_UNITS = 100;

/** Letter grades, best first: the one order a letter is ranked in, from A+ (14) down to F (1). */
export const LETTER_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E", "F"] as const;

/** A letter's rank, 14 for A+ down to 1 for F, whatever its case and spaces, or nothing. */
export function letterRank(letter: string | undefined): number | undefined {
  if (typeof letter !== "string") return undefined;
  const at = (LETTER_GRADES as readonly string[]).indexOf(letter.replace(/\s+/g, "").toUpperCase());
  return at === -1 ? undefined : LETTER_GRADES.length - at;
}

/** The letter of a rank, or nothing. */
export function letterOfRank(rank: number): string | undefined {
  return Number.isInteger(rank) && rank >= 1 && rank <= LETTER_GRADES.length ? LETTER_GRADES[LETTER_GRADES.length - rank] : undefined;
}

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

/**
 * The four scales a funder chooses between when a university's own is not pinned yet (the founder, 28 Sep 2026): the
 * first results page shown is reviewed, and confirms it or refuses the gift.
 */
export const SCALE_CHOICES = ["20", "4", "100", "letters"] as const;
export type ScaleChoice = (typeof SCALE_CHOICES)[number];

export function scaleOfChoice(choice: string | undefined): GradeScale | undefined {
  if (choice === "letters") return { kind: "letters", grades: [...LETTER_GRADES] };
  return choice === "20" || choice === "4" || choice === "100" ? { kind: "numeric", max: Number(choice), step: 1 / GRADE_UNITS } : undefined;
}

/** A grade target in words, on its scale where it has one: "14.50 out of 20", "B", or "12.00" on a scale not known. */
export function gradeTargetInWords(target: number, key?: string): string {
  const scale = scaleOfKey(key);
  if (scale?.kind === "letters") return letterOfRank(target) ?? String(target);
  return scale ? `${target.toFixed(2)} ${gradeScaleInWords(scale)}` : `${target.toFixed(2)} on the university's own scale`;
}

/** A scale as the list and the draft carry it: "20", "4", "100", "20/0.5", or "letters". */
export function scaleKey(scale: GradeScale): string {
  if (scale.kind === "letters") return "letters";
  return scale.step === 1 / GRADE_UNITS ? String(scale.max) : `${scale.max}/${scale.step}`;
}

/**
 * Where a grade target starts on a scale: a passing grade, 12 out of 20, 3 out of 4, 60 out of 100, and B in letters
 * (the founder's choices of 28 Sep 2026), three fifths of the top on any other. On no scale known yet, 12: the funder
 * chooses the scale next, and the chip sets its own.
 */
export function suggestedGrade(key: string | null | undefined): string {
  const scale = scaleOfKey(key ?? undefined);
  if (!scale) return "12";
  if (scale.kind === "letters") return String(letterRank("B"));
  const known: Readonly<Record<number, string>> = { 20: "12", 4: "3", 100: "60" };
  return known[scale.max] ?? String(Math.round(scale.max * 0.6 * 100) / 100);
}

/** A scale from its key, whether a funder's choice or a university's pinned one. */
export function scaleOfKey(key: string | undefined): GradeScale | undefined {
  return scaleOfChoice(key) ?? (key ? gradeScaleOf(key) : undefined);
}

/** Whether a gift made on one scale can be read on another: the same top for numbers, letters for letters. */
export function sameScale(chosen: GradeScale, pinned: GradeScale): boolean {
  if (chosen.kind === "letters" || pinned.kind === "letters") return chosen.kind === pinned.kind;
  return chosen.max === pinned.max;
}

/** The scale in words, for a refusal: "out of 20, in steps of 0.5". */
export function gradeScaleInWords(scale: GradeScale): string {
  if (scale.kind === "letters") return "letters";
  return scale.step === 1 / GRADE_UNITS ? `out of ${scale.max}` : `out of ${scale.max}, in steps of ${scale.step}`;
}

/** The contract's integer for a grade typed on its scale: hundredths, rounded to the nearest. */
export function gradeUnits(value: number): number {
  return Math.round(value * GRADE_UNITS);
}

/** A grade as the person and the funder read it: two decimals and the scale's top, "14.00 / 20". */
export function gradeInWords(units: number | bigint, scale: GradeScale): string {
  const value = Number(units) / GRADE_UNITS;
  if (scale.kind === "letters") return letterOfRank(value) ?? value.toFixed(2);
  return `${value.toFixed(2)} / ${scale.max}`;
}

/**
 * A grade as a results page prints it: the number, then perhaps the jury's points and the scale it is out of,
 * "12.345(+0.5)/20". A portal prints the grade as it stores it, so often with three decimals, and follows it with what
 * it adds (EsupPortail's esup-mdw, the record Toulouse runs: ResultatController writes the stored number and
 * "(+points)", NotesView adds "/scale" where the scale is not 20 or is always shown; read 9 Oct 2026).
 */
const GRADE_AS_PRINTED = /^(\d{1,4})(?:[.,](\d{1,3}))?\s*(?:\(\s*\+\s*\d{1,3}(?:[.,]\d{1,3})?\s*\))?\s*(?:\/\s*(\d{1,4}))?$/;

/**
 * The grade a results page prints, "14,50", "14.5" or "12.345(+0.5)/20", to the hundredth: a number, or nothing. A
 * third decimal is cut and never rounded: 12.345 is 12.34, and 9.999 is not 10, because a gift is paid at the grade
 * the page shows and at no better one. What follows the number does not stop the reading, and is not added to it.
 */
export function gradeOf(text: string | undefined): number | undefined {
  if (typeof text !== "string") return undefined;
  const match = text.trim().match(GRADE_AS_PRINTED);
  if (!match) return undefined;
  return Number(`${match[1]}.${(match[2] ?? "0").slice(0, 2)}`);
}

/** The scale a printed grade says it is out of, "/20", where the page prints one. */
export function gradeOutOf(text: string | undefined): number | undefined {
  const match = typeof text === "string" ? text.trim().match(GRADE_AS_PRINTED) : null;
  return match?.[3] === undefined ? undefined : Number(match[3]);
}

/** Whether a number is the shape of a grade at all, before the portal's scale is known: above zero, in hundredths. */
export function isGradeShape(value: number): boolean {
  return inHundredths(value) && value > 0 && value <= 1_000;
}

/**
 * A university chosen for a sense it has no provider for yet (D313): the operator has been asked for one, with the exact
 * instruction, and builds it within two days. Until then nothing can be shown from it, and nothing is lost.
 */
export const PROVIDER_BUILDING = Object.freeze({
  code: "PROVIDER_BUILDING",
  message: "Your university's page is being set up within two days. Then you show it here. Nothing is lost meanwhile.",
});

/** Whether a value read from a page is a grade on this numeric scale: from zero to its top, in hundredths. */
export function isGradeOnScale(scale: GradeScale, value: number): boolean {
  if (scale.kind !== "numeric") return false;
  return inHundredths(value) && value >= 0 && value <= scale.max;
}

/** Why a target the funder typed cannot be signed on this scale, by code, or nothing. */
export function gradeTargetProblem(scale: GradeScale, target: number): Readonly<{ code: string; message: string }> | undefined {
  // A letter target is its rank, a whole number from 1 (F) to 14 (A+).
  if (scale.kind === "letters") return letterOfRank(target) ? undefined : { code: "INVALID_TARGET", message: "A letter from A+ down to E." };
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

/**
 * Why a gift made on one scale is not read on the university's own (the founder, 28 Sep 2026): the funder chose the
 * scale before the first results page was reviewed, and the page grades otherwise.
 */
export function scaleMismatch(chosen: GradeScale, pinned: GradeScale): Readonly<{ code: string; message: string }> | undefined {
  if (sameScale(chosen, pinned)) return undefined;
  return { code: "SCALE_MISMATCH", message: `This university grades ${gradeScaleInWords(pinned)}, not ${gradeScaleInWords(chosen)} as this gift was made on, so nothing was counted. The money stays where it is.` };
}

/**
 * The grade the results page carries, on the row's scale, in hundredths for the contract and in words for the person.
 * A letter is carried by its rank in `LETTER_GRADES`, in hundredths like a number, so the contract compares it the same.
 */
export function gradeShownBy(results: ResultsExtract, fields: Readonly<Record<string, string>>): ResultsVerdict {
  const term = wrongTerm(results, fields);
  if (term) return term;
  const scale = results.grade.scale;
  if (scale.kind === "letters") {
    const rank = letterRank(fields[results.grade.field]);
    if (rank === undefined) return { kind: "refused", code: "NO_GRADE", message: "The results page shown carries no letter grade." };
    return { kind: "read", metricValue: gradeUnits(rank), inWords: letterOfRank(rank)! };
  }
  const grade = gradeOf(fields[results.grade.field]);
  // A grade the page itself says is out of another scale than the university's is not one on it, whatever its number.
  const outOf = gradeOutOf(fields[results.grade.field]);
  if (grade === undefined || !isGradeOnScale(scale, grade) || (outOf !== undefined && outOf !== scale.max)) {
    return { kind: "refused", code: "NO_GRADE", message: "The results page shown carries no grade on the university's scale." };
  }
  const units = gradeUnits(grade);
  return { kind: "read", metricValue: units, inWords: gradeInWords(units, scale) };
}
