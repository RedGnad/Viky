import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHOICE_GROUPS, CONDITIONS, groupMembers, liveConditions } from "../src/conditions";
import { UNIVERSITY_GRADE_MILESTONE, UNIVERSITY_SHOWN_MILESTONE, UNIVERSITY_YEAR_MILESTONE } from "../src/milestone-conditions";
import { OFFER } from "../src/sentences";
import { gradeTargetProblem, scaleOfKey, suggestedGrade } from "../src/university-shown";

/**
 * The choice of a service (the founder, 29 Sep 2026): the three university conditions are one line, "At university",
 * whose questions ask what they will show; the title says what is chosen and nothing about a length, which the card
 * labels itself; and a grade starts on the university's own scale.
 */

test("the three university conditions are one group, in the register's order, each with its own words", () => {
  assert.deepEqual(
    groupMembers("university").map((condition) => [condition.id, condition.group?.mode]),
    [
      ["university-enrollment-shown", "Enrolled"],
      ["university-year-passed-shown", "The year passed"],
      ["university-grade-shown", "A grade"],
    ],
  );
  assert.deepEqual(CHOICE_GROUPS.university, { name: "At university", question: "What will they show?" });
  assert.equal(CONDITIONS.filter((condition) => condition.group).length, 3, "no other condition is grouped");
  assert.deepEqual(groupMembers("university", liveConditions()).map((condition) => condition.id), groupMembers("university").filter((condition) => condition.live).map((condition) => condition.id));
});

test("the sheet draws a group once, and switching what they show keeps the university and the length", () => {
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(sheet, /if \(among\.find\(\(other\) => other\.group\?\.id === option\.group!\.id\) !== option\) return \[\];/);
  assert.match(sheet, /legend=\{CHOICE_GROUPS\[condition\.group\.id\]\.question\}/);
  const switchMode = sheet.slice(sheet.indexOf("const switchMode"), sheet.indexOf("/** The daily source"));
  assert.doesNotMatch(switchMode, /course: undefined|courseTitle: undefined|days:/, "the university and the length stay");
});

test("the title says what is chosen, never how long, and the card says what its length sets", () => {
  assert.equal(UNIVERSITY_SHOWN_MILESTONE.words.detailQuestion, "Which university");
  assert.equal(UNIVERSITY_YEAR_MILESTONE.words.detailQuestion, "Which university");
  assert.equal(UNIVERSITY_GRADE_MILESTONE.words.detailQuestion, "Which university, and the grade");
  assert.deepEqual(OFFER.lengthFor, { stamp: "Time to show it", climb: "Time to reach it" });
});

test("a grade starts at a passing grade on the university's own scale, and is never refused the moment it is set", () => {
  assert.equal(suggestedGrade("20"), "12");
  assert.equal(suggestedGrade("4"), "3");
  assert.equal(suggestedGrade("100"), "60");
  assert.equal(suggestedGrade(null), "12", "no scale yet: the funder chooses one next");
  for (const key of ["20", "4", "100", "letters", "20/0.5"]) {
    const scale = scaleOfKey(key);
    assert.ok(scale, key);
    assert.equal(gradeTargetProblem(scale, Number(suggestedGrade(key))), undefined, key);
  }
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(sheet, /target: certificate\.portal\?\.scaled \? suggestedGrade\(one\.scale\) : String\(certificate\.target\.suggested\),/);
});
