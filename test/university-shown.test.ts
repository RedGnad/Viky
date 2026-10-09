import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { UNIVERSITY_GOAL_TYPE, countryInWords, enrolledBy, isPortalId, universityShownProviderId, universitySubject } from "../src/university-shown";
import { UNIVERSITY_SHOWN } from "../src/shown-conditions";
import { UNIVERSITY_GRADE_MILESTONE, UNIVERSITY_SHOWN_MILESTONE, UNIVERSITY_YEAR_MILESTONE } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";
import { conditionAnswered, type GiftDraft } from "../src/gift-draft";
import { UNIVERSITY_GRADE_SHOWN, UNIVERSITY_YEAR_SHOWN } from "../src/shown-conditions";
import {
  gradeInWords,
  gradeOutOf,
  gradeOf,
  gradeScaleInWords,
  gradeScaleOf,
  gradeScaleProblem,
  gradeShownBy,
  gradeTargetInWords,
  gradeTargetProblem,
  gradeUnits,
  letterOfRank,
  letterRank,
  SCALE_CHOICES,
  scaleKey,
  scaleMismatch,
  scaleOfChoice,
  scaleOfKey,
  isGradeShape,
  isUniversityGoal,
  resultsProblem,
  UNIVERSITY_GRADE_GOAL_TYPE,
  UNIVERSITY_YEAR_GOAL_TYPE,
  universityGradeProviderId,
  universityGradeSubject,
  universityYearProviderId,
  universityYearSubject,
  yearPassedBy,
  type ResultsExtract,
} from "../src/university-shown";

/**
 * Staying enrolled, shown from the person's own student portal (D165): one goal for every portal, the portal bound
 * into the subject the funder signs, and "enrolled" decided by the portal's own row.
 */

test("one goal for the whole family, pinned by name, and the portal is what tells two gifts apart", () => {
  assert.equal(UNIVERSITY_GOAL_TYPE, 14);
  assert.equal(universityShownProviderId(), keccak256(stringToHex("viky:provider:university-enrollment-shown:v1")));
  assert.equal(universityShownProviderId(), "0xa95adf80ba13395dcc23c8048874f1ddfba5321a9eb5e1f90711c6a81c3d64df", "the id written in OPERATIONS for the owner to sign");
  assert.notEqual(universitySubject("ucad-sn"), universitySubject("sorbonne-fr"), "a proof shown from another portal fails the contract's own check");
  assert.equal(universitySubject("UCAD-SN "), universitySubject("ucad-sn"), "the same portal, however it was typed");
  assert.equal(UNIVERSITY_SHOWN.condition.attestationProviderId, universityShownProviderId());
  assert.equal(UNIVERSITY_SHOWN.subjectOf?.({ giftId: "1", conditionId: "university-enrollment-shown", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal: "ucad-sn" }), universitySubject("ucad-sn"));
  assert.equal(UNIVERSITY_SHOWN.subjectOf?.({ giftId: "1", conditionId: "university-enrollment-shown", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal: null }), null, "a gift naming no portal has no subject to sign against");
});

test("a portal id is ours to write: lower case, letters, digits and dashes", () => {
  for (const good of ["ucad-sn", "sorbonne-fr", "ufhb-ci", "x1"]) assert.ok(isPortalId(good), good);
  for (const bad of ["UCAD", "ucad sn", "-ucad", "ucad-", "", "a".repeat(65), 12]) assert.equal(isPortalId(bad), false, String(bad));
});

test("the country reads in words on the chooser's line, and an unknown code reads as itself", () => {
  assert.equal(countryInWords("SN"), "Senegal");
  assert.equal(countryInWords("fr"), "France");
  assert.equal(countryInWords("Q"), "Q", "a code that is not one reads as itself rather than throwing at the chooser");
});

test("enrolled is what the portal's own row says it is, on the one field it names, and nothing else is read", () => {
  const status = { field: "status", matches: "^(Inscrit|Enrolled)", keeps: "whether the status says enrolled" };
  assert.equal(enrolledBy(status, { status: "Inscrit 2026-2027" }), true);
  assert.equal(enrolledBy(status, { status: "enrolled" }), true, "case does not matter");
  assert.equal(enrolledBy(status, { status: "Radié" }), false);
  assert.equal(enrolledBy(status, { year: "2026" }), false, "another field is not the field");
  const year = { field: "academicYear", matches: "2026", keeps: "the academic year on the page" };
  assert.equal(enrolledBy(year, { academicYear: "2026-2027" }), true);
  assert.equal(enrolledBy(year, { academicYear: "2024-2025" }), false);
  assert.equal(enrolledBy({ ...status, matches: "(" }, { status: "Inscrit" }), false, "a row with a broken pattern proves nobody enrolled");
});

/**
 * The year passed and a grade reached, shown from the results page of the same portal (D174): two more goals on the
 * rail, the results extraction on the row, a scale that is numeric or letters, and the reading by the row's own rule.
 */

const OUT_OF_20: ResultsExtract = {
  providerId: "67ec1b13-b206-4fac-a78c-fbd5a2af55b3",
  providerVersion: "1.0.0",
  requestHash: `0x${"cd".repeat(32)}`,
  admitted: { field: "decision", matches: "^(Admis|Passed)" },
  grade: { field: "average", scale: { kind: "numeric", max: 20, step: 0.01 } },
  year: { field: "academicYear", matches: "2026-2027" },
};
const THIS_YEAR = { academicYear: "2026-2027" };
const LETTERS: ResultsExtract = { ...OUT_OF_20, grade: { field: "grade", scale: { kind: "letters", grades: ["A", "B", "C", "D", "E", "F"] } } };

function record(portal: string | null) {
  return { giftId: "1", conditionId: "x", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal };
}

test("two more goals on the rail, each pinned by name, each with its own subject on the same portal", () => {
  assert.equal(UNIVERSITY_YEAR_GOAL_TYPE, 15);
  assert.equal(UNIVERSITY_GRADE_GOAL_TYPE, 16);
  assert.equal(universityYearProviderId(), keccak256(stringToHex("viky:provider:university-year-passed-shown:v1")));
  assert.equal(universityYearProviderId(), "0x6af90272bdbe3555ea1b6b91294da5d557c27b72a1cca333864412784dab1551", "the id written in OPERATIONS for the owner to sign");
  assert.equal(universityGradeProviderId(), keccak256(stringToHex("viky:provider:university-grade-shown:v1")));
  assert.equal(universityGradeProviderId(), "0xf05dcc4db7fc72177e9c9c0ebcc05438600e18b4fb66496bc10a2bdd29291ff2", "the id written in OPERATIONS for the owner to sign");
  for (const goalType of [14, 15, 16]) assert.ok(isUniversityGoal(goalType), String(goalType));
  assert.equal(isUniversityGoal(13), false);
  // Three conditions on one portal, three subjects: a proof of enrolment can never settle a gift on the year or the grade.
  const subjects = [universitySubject("ucad-sn"), universityYearSubject("ucad-sn"), universityGradeSubject("ucad-sn")];
  assert.equal(new Set(subjects).size, 3);
  assert.equal(universityYearSubject("UCAD-SN "), universityYearSubject("ucad-sn"));
  assert.notEqual(universityGradeSubject("ucad-sn"), universityGradeSubject("sorbonne-fr"));
  assert.equal(UNIVERSITY_YEAR_SHOWN.condition.attestationProviderId, universityYearProviderId());
  assert.equal(UNIVERSITY_GRADE_SHOWN.condition.attestationProviderId, universityGradeProviderId());
  assert.equal(UNIVERSITY_YEAR_SHOWN.subjectOf?.(record("ucad-sn")), universityYearSubject("ucad-sn"));
  assert.equal(UNIVERSITY_GRADE_SHOWN.subjectOf?.(record("ucad-sn")), universityGradeSubject("ucad-sn"));
  assert.equal(UNIVERSITY_GRADE_SHOWN.subjectOf?.(record(null)), null);
  for (const [goalType, providerId] of [
    [15, universityYearProviderId()],
    [16, universityGradeProviderId()],
  ] as const) {
    const goal = milestoneGoal(goalType);
    assert.equal(goal?.providerId, providerId);
    assert.equal(goal?.shape, SHAPE_HAVE_OR_NOT, "had or not: the year is passed or not, and the grade is compared with the target in hundredths");
  }
  assert.equal(UNIVERSITY_YEAR_MILESTONE.goalType, 15);
  assert.equal(UNIVERSITY_GRADE_MILESTONE.goalType, 16);
  assert.equal(UNIVERSITY_YEAR_MILESTONE.subject({ name: "", course: "ucad-sn" }), universityYearSubject("ucad-sn"));
  assert.equal(UNIVERSITY_GRADE_MILESTONE.subject({ name: "", course: "ucad-sn" }), universityGradeSubject("ucad-sn"));
});

test("a scale is numeric or letters, typed on the command line as the operator writes it", () => {
  assert.deepEqual(gradeScaleOf("20"), { kind: "numeric", max: 20, step: 0.01 });
  assert.deepEqual(gradeScaleOf("4"), { kind: "numeric", max: 4, step: 0.01 }, "a GPA");
  assert.deepEqual(gradeScaleOf("20/0.5"), { kind: "numeric", max: 20, step: 0.5 });
  assert.deepEqual(gradeScaleOf("letters:A, B,C"), { kind: "letters", grades: ["A", "B", "C"] });
  for (const bad of ["twenty", "0", "20/30", "20/0.001", "20/0", "letters:A", "", "1001"]) assert.equal(gradeScaleOf(bad), undefined, bad);
  assert.equal(gradeScaleProblem({ kind: "numeric", max: 20, step: 0.01 }), undefined);
  assert.match(String(gradeScaleProblem({ kind: "numeric", max: 20, step: 0.001 })), /step/);
  assert.match(String(gradeScaleProblem({ kind: "percent" })), /numeric or letters/);
  assert.equal(gradeScaleInWords({ kind: "numeric", max: 20, step: 0.01 }), "out of 20");
  assert.equal(gradeScaleInWords({ kind: "numeric", max: 20, step: 0.5 }), "out of 20, in steps of 0.5");
  assert.equal(gradeScaleInWords({ kind: "letters", grades: ["A", "B"] }), "letters");
});

test("a grade is carried in hundredths and read back in words on its scale", () => {
  assert.equal(gradeUnits(14.5), 1450);
  assert.equal(gradeUnits(3.5), 350);
  assert.equal(gradeUnits(14), 1400);
  assert.equal(gradeInWords(1400, { kind: "numeric", max: 20, step: 0.01 }), "14.00 / 20");
  assert.equal(gradeInWords(1450n, { kind: "numeric", max: 20, step: 0.01 }), "14.50 / 20");
  assert.equal(gradeInWords(350, { kind: "numeric", max: 4, step: 0.01 }), "3.50 / 4");
  assert.equal(gradeOf("14,50"), 14.5, "a comma is what half the portals print");
  assert.equal(gradeOf("14.5"), 14.5);
  assert.equal(gradeOf(" 14 "), 14);
  // As a portal stores it (EsupPortail's esup-mdw, read 9 Oct 2026): three decimals, cut to the hundredth and never
  // rounded, then perhaps the jury's points and the scale, which do not stop the reading and are not added to it.
  assert.equal(gradeOf("12.345"), 12.34, "cut, not rounded");
  assert.equal(gradeOf("12,349"), 12.34);
  assert.equal(gradeOf("9.999"), 9.99, "never a ten the page does not show");
  assert.equal(gradeOf("12.500"), 12.5);
  assert.equal(gradeOf("12.345(+0.5)"), 12.34, "the jury's points follow the grade, and are not added");
  assert.equal(gradeOf("12.345(+0.5)/20"), 12.34);
  assert.equal(gradeOf("12.5 (+ 0,5) / 20"), 12.5);
  assert.equal(gradeOf("14/20"), 14);
  assert.equal(gradeOutOf("14/20"), 20);
  assert.equal(gradeOutOf("12.345(+0.5)/20"), 20);
  assert.equal(gradeOutOf("14"), undefined);
  for (const bad of ["", "14.5555", "A", undefined, "-1", "DEF", "12.3.4", "12 points", "(+0.5)", "/20", "12/"]) assert.equal(gradeOf(bad), undefined, String(bad));
  // On the university's scale: the grade is read with what follows it, and a grade the page says is out of another
  // scale is not one on it.
  assert.deepEqual(gradeShownBy(OUT_OF_20, { average: "12.345(+0.5)/20", ...THIS_YEAR }), { kind: "read", metricValue: 1234, inWords: "12.34 / 20" });
  assert.deepEqual(gradeShownBy(OUT_OF_20, { average: "12.345", ...THIS_YEAR }), { kind: "read", metricValue: 1234, inWords: "12.34 / 20" });
  assert.equal((gradeShownBy(OUT_OF_20, { average: "7.5/10", ...THIS_YEAR }) as { code?: string }).code, "NO_GRADE");
  assert.equal((gradeShownBy(OUT_OF_20, { average: "DEF", ...THIS_YEAR }) as { code?: string }).code, "NO_GRADE");
  assert.ok(isGradeShape(14.5));
  assert.ok(isGradeShape(0.01));
  for (const bad of [0, -1, 14.555, 1_001, Number.NaN]) assert.equal(isGradeShape(bad), false, String(bad));
});

test("a target is refused by name when it is off its scale, and a letter target is its rank, before any money moves", () => {
  const halves = { kind: "numeric", max: 20, step: 0.5 } as const;
  assert.equal(gradeTargetProblem(halves, 14.5), undefined);
  assert.equal(gradeTargetProblem(halves, 20), undefined);
  for (const off of [14.3, 21, 0, 0.25]) assert.equal(gradeTargetProblem(halves, off)?.code, "INVALID_TARGET", String(off));
  assert.match(String(gradeTargetProblem(halves, 21)?.message), /out of 20, in steps of 0\.5/);
  // A letter target is its rank, 14 for A+ down to 1 for F (the founder, 28 Sep 2026).
  assert.equal(gradeTargetProblem(LETTERS.grade.scale, letterRank("B")!), undefined);
  assert.equal(gradeTargetProblem(LETTERS.grade.scale, 15)?.code, "INVALID_TARGET");
  assert.equal(gradeTargetProblem(LETTERS.grade.scale, 10.5)?.code, "INVALID_TARGET");
  // What the create route asks each condition of the row it found.
  // A grade with no results provider yet: made like any other, on the scale the funder chooses, which the first reviewed
  // results page confirms or refuses (the founder, 28 Sep 2026).
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: OUT_OF_20 }, 14.5), undefined);
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: OUT_OF_20 }, 21)?.code, "INVALID_TARGET");
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: LETTERS }, 14), undefined, "A+");
  // Before the university's scale is pinned: the funder's choice, required, and the target judged on it.
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: null }, 14)?.code, "SCALE_REQUIRED");
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: null }, 14.5, "20"), undefined);
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: null }, 14, "4")?.code, "INVALID_TARGET");
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: null }, 85, "100"), undefined);
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: null }, letterRank("B")!, "letters"), undefined);
  assert.equal(UNIVERSITY_GRADE_MILESTONE.portal?.refuses({ results: null }, 14, "percent")?.code, "SCALE_REQUIRED");
  // The year passed on a university with no results provider yet: made all the same, the provider asked for (D313).
  assert.equal(UNIVERSITY_YEAR_MILESTONE.portal?.refuses({ results: null }, 1), undefined);
  assert.equal(UNIVERSITY_YEAR_MILESTONE.portal?.sense, "results");
  assert.equal(UNIVERSITY_SHOWN_MILESTONE.portal?.sense, "enrolment");
  assert.equal(UNIVERSITY_YEAR_MILESTONE.portal?.refuses({ results: OUT_OF_20 }, 1), undefined);
  assert.equal(UNIVERSITY_YEAR_MILESTONE.portal?.refuses({ results: LETTERS }, 1), undefined, "the year passed reads no grade, so letters are no obstacle");
  assert.equal(UNIVERSITY_SHOWN_MILESTONE.portal?.refuses({ results: null }, 1), undefined, "any listed university takes a gift on enrolment");
  // The grade the funder types is on the scale, and what is signed is the integer in hundredths, on both sides.
  assert.equal(UNIVERSITY_GRADE_MILESTONE.targetUnits?.(14.5), 1450);
  assert.ok(UNIVERSITY_GRADE_MILESTONE.validTarget(14.5));
  assert.ok(!UNIVERSITY_GRADE_MILESTONE.validTarget(0));
  assert.equal(UNIVERSITY_YEAR_MILESTONE.targetUnits, undefined);
  assert.ok(UNIVERSITY_YEAR_MILESTONE.validTarget(1) && !UNIVERSITY_YEAR_MILESTONE.validTarget(2));
});

test("the results page is read by the row's own rule: passed, the grade on the scale, and only this year's page", () => {
  assert.deepEqual(yearPassedBy(OUT_OF_20, { decision: "Admis", ...THIS_YEAR }), { kind: "read", metricValue: 1, inWords: "Passed" });
  assert.deepEqual(yearPassedBy(OUT_OF_20, { decision: "passed", ...THIS_YEAR }), { kind: "read", metricValue: 1, inWords: "Passed" }, "case does not matter");
  const failed = yearPassedBy(OUT_OF_20, { decision: "Ajourné", ...THIS_YEAR });
  assert.equal(failed.kind === "refused" && failed.code, "NOT_PASSED");
  const otherField = yearPassedBy(OUT_OF_20, { average: "14", ...THIS_YEAR });
  assert.equal(otherField.kind === "refused" && otherField.code, "NOT_PASSED", "another field is not the field");
  const lastYear = yearPassedBy(OUT_OF_20, { decision: "Admis", academicYear: "2025-2026" });
  assert.equal(lastYear.kind === "refused" && lastYear.code, "WRONG_TERM", "a page of another year does not pay");
  const undated = yearPassedBy(OUT_OF_20, { decision: "Admis" });
  assert.equal(undated.kind === "refused" && undated.code, "WRONG_TERM", "the row names a year field, and the page carries none");
  const noYear: ResultsExtract = { providerId: OUT_OF_20.providerId, providerVersion: OUT_OF_20.providerVersion, requestHash: OUT_OF_20.requestHash, admitted: OUT_OF_20.admitted, grade: OUT_OF_20.grade };
  assert.deepEqual(yearPassedBy(noYear, { decision: "Admis" }), { kind: "read", metricValue: 1, inWords: "Passed" }, "without a year field, the day of the proof is what dates it");

  assert.deepEqual(gradeShownBy(OUT_OF_20, { average: "14,50", ...THIS_YEAR }), { kind: "read", metricValue: 1450, inWords: "14.50 / 20" });
  assert.deepEqual(gradeShownBy(OUT_OF_20, { average: "20", ...THIS_YEAR }), { kind: "read", metricValue: 2000, inWords: "20.00 / 20" });
  assert.deepEqual(gradeShownBy(OUT_OF_20, { average: "0", ...THIS_YEAR }), { kind: "read", metricValue: 0, inWords: "0.00 / 20" }, "a zero is a grade, and the contract says not there yet");
  for (const [fields, code] of [
    [{ average: "21", ...THIS_YEAR }, "NO_GRADE"],
    // Out of another scale than the university's, said by the page itself: not a grade on it. ("14/20" is read, above.)
    [{ average: "14/10", ...THIS_YEAR }, "NO_GRADE"],
    [{ average: "14 sur 20", ...THIS_YEAR }, "NO_GRADE"],
    [{ decision: "Admis", ...THIS_YEAR }, "NO_GRADE"],
    [{ average: "14", academicYear: "2024-2025" }, "WRONG_TERM"],
  ] as const) {
    const verdict = gradeShownBy(OUT_OF_20, fields);
    assert.equal(verdict.kind === "refused" && verdict.code, code, JSON.stringify(fields));
  }
  // Letters are read by their rank, in hundredths like a number, and said as letters.
  assert.deepEqual(gradeShownBy(LETTERS, { grade: "b+", ...THIS_YEAR }), { kind: "read", metricValue: letterRank("B+")! * 100, inWords: "B+" });
  const notALetter = gradeShownBy(LETTERS, { grade: "Excellent", ...THIS_YEAR });
  assert.equal(notALetter.kind === "refused" && notALetter.code, "NO_GRADE");
});

test("letters rank in one order, a scale chosen before the pin is checked against the pinned one, and a target is said on its scale", () => {
  assert.equal(letterRank("A+"), 14);
  assert.equal(letterRank(" a- "), 12);
  assert.equal(letterRank("F"), 1);
  assert.equal(letterRank("G"), undefined);
  assert.equal(letterOfRank(10), "B");
  assert.equal(letterOfRank(15), undefined);
  assert.deepEqual(SCALE_CHOICES, ["20", "4", "100", "letters"]);
  assert.equal(scaleMismatch(scaleOfChoice("20")!, gradeScaleOf("20/0.5")!), undefined, "out of 20 in halves is out of 20");
  assert.equal(scaleMismatch(scaleOfChoice("letters")!, LETTERS.grade.scale), undefined);
  const mismatch = scaleMismatch(scaleOfChoice("20")!, gradeScaleOf("4")!);
  assert.equal(mismatch?.code, "SCALE_MISMATCH");
  assert.equal(mismatch?.message, "This university grades out of 4, not out of 20 as this gift was made on, so nothing was counted. The money stays where it is.");
  assert.equal(scaleMismatch(scaleOfChoice("100")!, LETTERS.grade.scale)?.code, "SCALE_MISMATCH");
  assert.equal(scaleKey(gradeScaleOf("20/0.5")!), "20/0.5");
  assert.equal(scaleKey(LETTERS.grade.scale), "letters");
  assert.deepEqual(scaleOfKey("20/0.5"), gradeScaleOf("20/0.5"));
  assert.equal(gradeTargetInWords(14.5, "20"), "14.50 out of 20");
  assert.equal(gradeTargetInWords(10, "letters"), "B");
  assert.equal(gradeTargetInWords(12, undefined), "12.00 on the university's own scale");
});

test("a results extraction is written only whole", () => {
  assert.equal(resultsProblem(OUT_OF_20), undefined);
  assert.equal(resultsProblem(LETTERS), undefined, "a scale of letters, read by rank");
  assert.match(String(resultsProblem({ ...OUT_OF_20, providerId: "nope" })), /provider's id/);
  assert.match(String(resultsProblem({ ...OUT_OF_20, requestHash: "0x12" })), /request's hash/);
  assert.match(String(resultsProblem({ ...OUT_OF_20, admitted: { field: "decision", matches: "(" } })), /regular expression/);
  assert.match(String(resultsProblem({ ...OUT_OF_20, grade: { field: "", scale: OUT_OF_20.grade.scale } })), /grade/);
  assert.match(String(resultsProblem({ ...OUT_OF_20, grade: { field: "average", scale: { kind: "numeric", max: 20, step: 40 } } })), /step/);
  assert.match(String(resultsProblem({ ...OUT_OF_20, year: { field: "academicYear", matches: "" } })), /year/);
  assert.match(String(resultsProblem(null)), /results extraction/);
});

test("the funder's draft takes a grade with decimals, and a whole number everywhere else", () => {
  const draft = (over: Partial<GiftDraft>): GiftDraft =>
    ({ recipientName: "Ama", funderName: "", conditionId: "university-grade-shown", subject: "", course: "ucad-sn", target: "14.5", scale: "20", dollars: "20", days: "180", ...over }) as unknown as GiftDraft;
  assert.ok(conditionAnswered(draft({})));
  // The scale, the university's pinned one or the funder's choice, and the target on it (the founder, 28 Sep 2026).
  assert.ok(!conditionAnswered(draft({ scale: undefined })), "no scale, no grade");
  assert.ok(!conditionAnswered(draft({ scale: "4" })), "14.5 is not a grade out of 4");
  assert.ok(conditionAnswered(draft({ scale: "4", target: "3.5" })));
  assert.ok(conditionAnswered(draft({ scale: "letters", target: "10" })), "B");
  assert.ok(!conditionAnswered(draft({ scale: "letters", target: "10.5" })));
  assert.ok(conditionAnswered(draft({ scale: "20/0.5", scaleFixed: true, target: "14.5" })), "a pinned scale in halves");
  assert.ok(conditionAnswered(draft({ target: "14" })));
  assert.ok(!conditionAnswered(draft({ target: "14,5" })), "a comma is not a number to the sheet, and the refusal says a dot");
  assert.ok(!conditionAnswered(draft({ target: "0" })));
  assert.ok(!conditionAnswered(draft({ target: "14.555" })));
  assert.ok(!conditionAnswered(draft({ course: undefined })), "no portal chosen, no gift");
  assert.ok(conditionAnswered(draft({ conditionId: "university-year-passed-shown", target: "1" })));
  assert.ok(!conditionAnswered(draft({ conditionId: "toefl-mybest-shown", course: undefined, target: "90.5" })), "a score is a whole number, as it always was");
  assert.ok(conditionAnswered(draft({ conditionId: "toefl-mybest-shown", course: undefined, target: "90" })));
});
