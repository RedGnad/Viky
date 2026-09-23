import { gradeScaleOf, resultsProblem, type ResultsExtract } from "../src/university-shown";

/**
 * The results page of a portal, read from the environment of an operator's command (D174). Shared by `pnpm portal:add`,
 * where it is optional, and `pnpm portal:results`, where it is the whole point. Nothing is asked interactively.
 *
 *   RESULTS_PROVIDER_ID=<uuid> RESULTS_PROVIDER_VERSION=1.0.0 RESULTS_REQUEST_HASH=0x… \
 *   RESULTS_ADMITTED_FIELD=decision RESULTS_ADMITTED_MATCHES="^(Admis|Passed)" \
 *   RESULTS_GRADE_FIELD=average RESULTS_GRADE_SCALE=20 \
 *   RESULTS_YEAR_FIELD=academicYear RESULTS_YEAR_MATCHES="2026-2027"
 *
 * The scale: `20` is out of 20 in hundredths, `4` a GPA, `20/0.5` out of 20 in halves, `letters:A,B,C,D,E,F` a scale
 * of letters (declared, and refused at creation until a later PR). The year's field and pattern are optional
 * together: without them, the day of the proof is what dates it, and with them a page of another year does not pay.
 */
export function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Whether the command names a results page at all: the provider id is the one variable that decides. */
export function resultsNamed(): boolean {
  return Boolean(process.env.RESULTS_PROVIDER_ID?.trim());
}

export function resultsFromEnv(): ResultsExtract {
  const scale = gradeScaleOf(need("RESULTS_GRADE_SCALE"));
  if (!scale) throw new Error("RESULTS_GRADE_SCALE is not a scale: 20, 4, 20/0.5 or letters:A,B,C");
  const yearField = process.env.RESULTS_YEAR_FIELD?.trim();
  const yearMatches = process.env.RESULTS_YEAR_MATCHES?.trim();
  if (Boolean(yearField) !== Boolean(yearMatches)) throw new Error("RESULTS_YEAR_FIELD and RESULTS_YEAR_MATCHES go together");
  const results: ResultsExtract = {
    providerId: need("RESULTS_PROVIDER_ID"),
    providerVersion: need("RESULTS_PROVIDER_VERSION"),
    requestHash: need("RESULTS_REQUEST_HASH"),
    admitted: { field: need("RESULTS_ADMITTED_FIELD"), matches: need("RESULTS_ADMITTED_MATCHES") },
    grade: { field: need("RESULTS_GRADE_FIELD"), scale },
    ...(yearField && yearMatches ? { year: { field: yearField, matches: yearMatches } } : {}),
  };
  const problem = resultsProblem(results);
  if (problem) throw new Error(`The results page needs ${problem}`);
  return results;
}
