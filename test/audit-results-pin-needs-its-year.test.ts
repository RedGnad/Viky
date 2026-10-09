import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resultsYearProblem } from "../src/university-shown";

/**
 * A guard on the university path (the audit of 8 Oct 2026, point 10): a results page could be pinned with no year, and
 * last year's "Admis" would then pay a gift made today. Its twin, the session that reads the gift's own condition, is
 * a change to the session route and waits for the passes of 10 Oct 2026 (the founder, 9 Oct 2026).
 */
test("a results page is not pinned without its year, unless the operator says so in so many words", () => {
  assert.match(String(resultsYearProblem(undefined, false)), /--year "<regex>" is asked for a results page: without it, last year's page would pay a gift made today/);
  assert.match(String(resultsYearProblem("", false)), /--any-year/);
  assert.equal(resultsYearProblem("^2026-2027$", false), null);
  assert.equal(resultsYearProblem(undefined, true), null, "a page that shows no year, on the operator's own word");
  assert.equal(resultsYearProblem("^2026-2027$", true), "--year and --any-year say opposite things: keep one");

  const command = readFileSync("scripts/portal-pin.ts", "utf8");
  assert.match(command, /const yearProblem = resultsYearProblem\(yearMatches, process\.argv\.includes\("--any-year"\)\);\n\s*if \(yearProblem\) throw new Error\(`\$\{yearProblem\}: nothing pinned`\);/);
  // Refused before anything is written: the pin and the settlement come after.
  assert.ok(command.indexOf("const yearProblem = resultsYearProblem(") < command.indexOf("await pinProvider(portal.portalId, review.sense"));
  assert.doesNotMatch(command, /\[--year "<regex>"\]/, "the usage no longer says the year is optional");
});
