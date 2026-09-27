import { keccak256, stringToHex, type Hex } from "viem";
import { refuseShown, type ShownReading } from "./shown-proof";

/**
 * A WASSCE result, shown from WAEC's own result checker (D217): the West African school certificate of Nigeria, Ghana,
 * Sierra Leone, Liberia and The Gambia, results from 1980. The person opens `waecdirect.org` in the verification tab
 * and types their examination number, the year, school or private, and the serial and PIN of the card they bought, on
 * WAEC's own page. Family "School & studies", goal 28.
 *
 * Shown and not read for them, because of WAEC's own terms: its privacy policy (waecnigeria.org, read 24 Sep 2026)
 * says any access code WAEC allocates must be kept confidential and never disclosed to a third party. The card's PIN is
 * one, so it is typed on WAEC's page by the person and never reaches Viky.
 *
 * The page, read 24 Sep 2026: the checker posts the five values to `/Result/EncryptPayload`, which answers a token `q`
 * (a new one each time), then opens `/Result/Display?q=<q>`; no captcha. The result's shape was read on a real result
 * published in a public repository (Bappa-Kamba/credly, `backend/sample_result.html`, WASSCE for school candidates
 * 2018): `tbCandidInfo` (examination number, name, examination, centre), `tbSubjectGrades` (a subject and its grade
 * per row), `tbWithHeld`. Three fields are extracted: the examination, the grades table, the withheld table.
 *
 * What a gift is for: credits, grades A1 to C6, English Language and Mathematics among them, the standard universities
 * across the region ask for. Without both, the result counts as none. The verdict rule (D185) keeps the count only.
 */

export const WAEC_SOURCE = "WAEC";
export const WAEC_GOAL_TYPE = 28;

export function waecProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:waec-result-shown:v1"));
}

/** The subject the funder signs: the same for every gift on the line, as the baccalauréat's (D162). */
export const WAEC_SUBJECT: Hex = keccak256(stringToHex("viky:subject:waec-result-shown:v1"));

/** A provider of ours, pinned once registered from a real result: nothing yet. */
export type WaecProvider = Readonly<{ id: string; version: string; requestHash: string }>;
export const WAEC_PROVIDER: WaecProvider | null = null;

export const WAEC_NOT_REGISTERED = "This condition's provider is not registered yet: it is built from a real WAEC result first, and nothing can be shown until then.";

/** Where the person goes, in their own browser: the result checker, where they type their card. */
export const WAEC_LOGIN_URL = "https://www.waecdirect.org/";

export const WAEC_CREDITS = Object.freeze({ min: 1, max: 9, suggested: 5 });
export const WAEC_DURATION_DAYS = Object.freeze({ min: 30, max: 400, suggested: 240 });

const CREDIT_GRADES = new Set(["A1", "B2", "B3", "C4", "C5", "C6"]);

/** The subjects and grades of the `tbSubjectGrades` table, as the page prints them. */
export function waecGradesOf(table: string): ReadonlyArray<{ subject: string; grade: string }> {
  const rows: Array<{ subject: string; grade: string }> = [];
  for (const row of table.matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/g)) {
    const subject = row[1].replace(/\s+/g, " ").trim().toUpperCase();
    const grade = row[2].trim().toUpperCase();
    if (subject && grade) rows.push({ subject, grade });
  }
  return rows;
}

/** Credits, English Language and Mathematics among them; without both, none. */
export function waecCredits(grades: ReadonlyArray<{ subject: string; grade: string }>): number {
  const credited = grades.filter((row) => CREDIT_GRADES.has(row.grade));
  const has = (subject: string) => credited.some((row) => row.subject === subject);
  return has("ENGLISH LANGUAGE") && has("MATHEMATICS") ? credited.length : 0;
}

/** The year of the examination as the page prints it, "WASSCE FOR SCHOOL CANDIDATES 2018", or nothing. */
export function waecYearOf(examination: string): number | undefined {
  const text = examination.toUpperCase();
  if (!text.includes("WASSCE")) return undefined;
  const year = /\b(19[89]\d|20\d{2})\b/.exec(text)?.[0];
  return year ? Number(year) : undefined;
}

export function waecCreditsInWords(credits: number): string {
  return `${credits} credit${credits === 1 ? "" : "s"}, English and Mathematics among them`;
}

/**
 * What the result shown says, for a gift made in `giftYear`: the credits, or a refusal by name. A result of an earlier
 * year than the gift's is another result, since the checker opens every one since 1980.
 */
export function readWaecResult(fields: Readonly<Record<string, string>>, giftYear: number): ShownReading {
  const year = waecYearOf(fields.examination ?? "");
  if (year === undefined) refuseShown("NO_RESULT", "The page shown carries no WASSCE result.");
  if ((fields.withheld ?? "").replace(/<[^>]*>|&nbsp;/g, "").trim()) refuseShown("RESULT_WITHHELD", "WAEC withholds part of that result, so it cannot pay.");
  if (year < giftYear) refuseShown("AN_EARLIER_RESULT", `That result is from ${year}, before this gift was made.`);
  const credits = waecCredits(waecGradesOf(fields.grades ?? ""));
  return { metricValue: BigInt(credits), eventAt: null, accountKey: null, inWords: waecCreditsInWords(credits) };
}
