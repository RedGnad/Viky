import assert from "node:assert/strict";
import test from "node:test";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, conditionById, WAEC_RESULT_SHOWN } from "../src/conditions";
import { certificateById, WAEC_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { shownConditionById, WAEC_SHOWN } from "../src/shown-conditions";
import { ShownProofError } from "../src/shown-proof";
import { readWaecResult, WAEC_GOAL_TYPE, waecCredits, waecGradesOf, waecProviderId, waecYearOf } from "../src/waec-shown";

/** WASSCE credits, shown from WAEC's own checker (D217). The markup is the one of a real 2018 result, the values invented. */
const ROW = 'style="background-color:#E9D772;color:#000000;font-family:Arial, Verdana, Sans-serrif;font-size:9pt;font-weight:bold;vertical-align:top;"';
function gradesTable(rows: ReadonlyArray<[string, string]>): string {
  const body = rows.map(([subject, grade]) => `\t<tr ${ROW}>\n\t\t<td align="left" width="40%">${subject.padEnd(30)}</td>\n\t\t<td align="left" width="60%">${grade}</td>\n\t</tr>`).join("\n");
  return `<table id="tbSubjectGrades" class="result" style="width: 100%">\n\t<tbody>${body}\n</tbody></table>`;
}
const FIVE = gradesTable([
  ["ENGLISH LANGUAGE", "C5"],
  ["MATHEMATICS", "B3"],
  ["BIOLOGY", "C6"],
  ["CHEMISTRY", "D7"],
  ["PHYSICS", "A1"],
  ["ECONOMICS", "C4"],
  ["CIVIC EDUCATION", "F9"],
]);

test("credits are A1 to C6, and count only with English Language and Mathematics among them", () => {
  assert.equal(waecGradesOf(FIVE).length, 7);
  assert.equal(waecCredits(waecGradesOf(FIVE)), 5);
  assert.equal(waecCredits(waecGradesOf(gradesTable([["ENGLISH LANGUAGE", "A1"], ["MATHEMATICS", "E8"], ["PHYSICS", "A1"]]))), 0, "no credit in Mathematics, no count");
  assert.equal(waecCredits(waecGradesOf(gradesTable([["MATHEMATICS", "A1"], ["PHYSICS", "A1"]]))), 0, "no English Language, no count");
});

test("the examination's year, as the page prints it", () => {
  assert.equal(waecYearOf("WASSCE FOR SCHOOL CANDIDATES 2018"), 2018);
  assert.equal(waecYearOf("WASSCE FOR PRIVATE CANDIDATES 2027 - FIRST SERIES"), 2027);
  assert.equal(waecYearOf("BECE 2027"), undefined);
});

test("a result of the gift's year reads its credits, and an earlier, withheld or absent one is refused by name", () => {
  const fields = { examination: "WASSCE FOR SCHOOL CANDIDATES 2027", grades: FIVE, withheld: "\n" };
  const reading = readWaecResult(fields, 2027);
  assert.equal(reading.metricValue, 5n);
  assert.equal(reading.inWords, "5 credits, English and Mathematics among them");
  assert.equal(reading.accountKey, null);
  const refusedWith = (code: string) => (error: unknown) => error instanceof ShownProofError && error.code === code;
  assert.throws(() => readWaecResult({ ...fields, examination: "WASSCE FOR SCHOOL CANDIDATES 2018" }, 2027), refusedWith("AN_EARLIER_RESULT"));
  assert.throws(() => readWaecResult({ ...fields, withheld: "<tr><td>CHEMISTRY</td></tr>" }, 2027), refusedWith("RESULT_WITHHELD"));
  assert.throws(() => readWaecResult({ grades: FIVE }, 2027), refusedWith("NO_RESULT"));
});

test("the line: shown by them, School & studies, goal 28, being built, the verdict rule", () => {
  assert.equal(WAEC_RESULT_SHOWN.nature, "shown");
  assert.equal(WAEC_RESULT_SHOWN.family, "exam");
  assert.equal(WAEC_RESULT_SHOWN.live, false);
  assert.ok(BUILDING.includes(WAEC_RESULT_SHOWN));
  assert.ok(WAEC_RESULT_SHOWN.name.length <= 30);
  assert.equal(conditionById("waec-result-shown"), WAEC_RESULT_SHOWN);
  assert.equal(certificateById("waec-result-shown"), WAEC_MILESTONE);
  assert.equal(shownConditionById("waec-result-shown"), WAEC_SHOWN);
  assert.ok(proofOfCondition("waec-result-shown"));
  assert.equal(privacyOf(WAEC_RESULT_SHOWN).kept, "verdict");
  assert.match(String(WAEC_MILESTONE.notOpen), /not registered yet/);
  assert.equal(WAEC_MILESTONE.targetUnits, undefined, "a count of credits is signed as it is typed");
  assert.ok(WAEC_MILESTONE.validTarget(5) && !WAEC_MILESTONE.validTarget(0) && !WAEC_MILESTONE.validTarget(10) && !WAEC_MILESTONE.validTarget(4.5));
  assert.equal(WAEC_GOAL_TYPE, 28);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 28 && goal.providerId === waecProviderId()));
});

test("until our provider is registered, a gift on the line has no provider, and the condition refuses without a gift", async () => {
  assert.equal(await WAEC_SHOWN.providerOf?.({ giftId: "1", conditionId: "waec-result-shown", mode: "", standingAtOffer: 0, standingReadAt: new Date("2027-03-01T00:00:00Z"), portal: null }), null);
  assert.throws(() => WAEC_SHOWN.condition.read({}), (error: unknown) => error instanceof ShownProofError && error.code === "NO_GIFT_YEAR");
});
