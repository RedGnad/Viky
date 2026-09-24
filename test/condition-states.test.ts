import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUILDING, catalogueSections, conditionById, CONDITIONS, FAMILIES, FRONTIERS, liveConditions, STATES, stateOf, stateWords } from "../src/conditions";
import { CATALOGUE } from "../src/sentences";

/**
 * "What Viky can check", the public catalogue (design audit of 16 Sep 2026, section 5).
 *
 * The chooser offers only what is proved. This page is the other half of that rule: it says what exists, what is being
 * tried and what nobody can check at all, in four states and no fifth. What these tests defend is the join between the
 * two halves, because that is where a catalogue starts lying: a condition is Open here exactly when the chooser offers
 * it, anything else says in its own words what has to happen first, and the screen prints the register rather than a
 * list of its own.
 */

const page = readFileSync("app/what-viky-can-check/page.tsx", "utf8");

test("the states are the three the founder kept, in words, and there is no fourth", () => {
  assert.deepEqual(
    STATES.map((state) => state.title),
    ["Open", "Waiting for the source's answer", "No public page exists"],
  );
  for (const state of STATES) {
    assert.match(state.meaning, /\.$/, `${state.id} says what it means in a sentence`);
    assert.ok(state.meaning.length > 20 && state.meaning.length <= 200, `${state.id} says it in one line`);
  }
  assert.throws(() => stateWords("almost-there" as never), /no such state/);
});

test("Open is the same fact as live, in both directions", () => {
  const open = CONDITIONS.filter((condition) => condition.state === "open");
  assert.deepEqual(
    open.map((condition) => condition.id),
    liveConditions().map((condition) => condition.id),
    "the page cannot call a condition open that the chooser refuses to offer, nor the other way round",
  );
  assert.ok(open.length > 0, "at least one condition is open, or the product offers nothing");
});

test("a condition that is not open says what has to happen first, and an open one says nothing", () => {
  for (const condition of CONDITIONS) {
    if (condition.state === "open") {
      assert.equal(condition.beforeItOpens, undefined, `${condition.id} is open and has nothing to wait for`);
      continue;
    }
    const line = condition.beforeItOpens;
    assert.ok(line, `${condition.id} is not offered and does not say why`);
    assert.match(line, /\.$/, `${condition.id} says it in sentences`);
    assert.ok(line.length <= 260, `${condition.id} writes a paragraph where one line was asked for`);
  }
  // The two waiting on a source name what that source's own terms require, because that is the whole reason they wait.
  const waiting = CONDITIONS.filter((condition) => condition.state === "asked-the-source");
  // Both left this list as their goals were registered: the English test on 19 Sep 2026, the course certificate on
  // 20 Sep (D109). What each source's terms ask did not go away with them: it is on the judges page, where what a
  // reading is worth is written, and it is said as a fact rather than as a decision of ours.
  assert.deepEqual(waiting.map((condition) => condition.id), []);
  for (const condition of waiting) assert.match(String(condition.beforeItOpens), /terms/, `${condition.id} names the clause`);
});

test("what nobody can check is listed with what was read, and it is not pretended to be a condition", () => {
  const ids = new Set(CONDITIONS.map((condition) => condition.id));
  for (const frontier of FRONTIERS) {
    assert.equal(frontier.state, "no-public-page", `${frontier.id} is there for one reason only`);
    assert.ok(!ids.has(frontier.id), `${frontier.id} is not a condition, and nothing offers it`);
    assert.match(frontier.why, /\.$/);
    assert.ok(frontier.why.length > 60, `${frontier.id} says why, not just that`);
  }
  assert.deepEqual(FRONTIERS.map((frontier) => frontier.id), ["supervised-exams", "university-enrolment", "state-diplomas", "school-marks"]);
  // Each line says whether the other reading is being built for it (D163): the exams and enrolment (D165), and only they, today.
  for (const frontier of FRONTIERS) assert.ok(frontier.building === null || /\.$/.test(frontier.building), `${frontier.id} says it in a sentence`);
  assert.deepEqual(FRONTIERS.filter((frontier) => frontier.building).map((frontier) => frontier.id), ["supervised-exams", "university-enrolment", "state-diplomas", "school-marks"]);
  for (const frontier of FRONTIERS.filter((frontier) => frontier.building)) assert.match(String(frontier.building), /SHOWN BY THEM/, `${frontier.id} names the two words the condition will carry`);
  assert.match(stateWords("no-public-page").meaning, /^No public page shows it\. The person can show it from their own account, and Viky is building that\.$/);
  // Each line rests on a page read on a day, and the two read from a source's own site say which day.
  assert.match(String(FRONTIERS.find((frontier) => frontier.id === "supervised-exams")?.why), /19 Sep 2026/);
  assert.match(String(FRONTIERS.find((frontier) => frontier.id === "supervised-exams")?.building), /the TOEFL score is open/, "the line says the TOEFL is open, not being built");
  assert.match(String(FRONTIERS.find((frontier) => frontier.id === "state-diplomas")?.why), /diplome\.gouv\.fr/);
});

test("the page lists every condition the register holds, offered or not, by family", () => {
  const sections = catalogueSections();
  assert.deepEqual(
    sections.flatMap((section) => section.conditions).map((condition) => condition.id).sort(),
    CONDITIONS.map((condition) => condition.id).sort(),
    "a condition missing from this page is a condition nobody can ask about",
  );
  assert.deepEqual(
    sections.map((section) => section.title),
    FAMILIES.filter(({ id }) => CONDITIONS.some((condition) => condition.family === id) || sections.some((section) => section.family === id && section.building.length > 0)).map(({ title }) => title),
    "the families are the register's, in its order, and a family with only a line being built would be on the page too",
  );
  // A line being built with a public page prints under its family, once (D169): the TOEFL score and enrolment are
  // said by the frontier's lines, so the five examination results (D176) print under Pass an exam, and the year
  // passed and the grade (D174) under Study.
  assert.deepEqual(
    sections.flatMap((section) => section.building).map((condition) => condition.id),
    ["cambridge-english-shown", "ielts-shown", "bac-morocco-shown", "bac-cameroon-shown", "bac-france-shown", "waec-result-shown", "udemy-course-shown", "chsi-enrolment-shown", "university-year-passed-shown", "university-grade-shown", "ecoledirecte-grade-shown"],
  );
  assert.deepEqual(sections.find((section) => section.family === "move")?.conditions.map((condition) => condition.id), ["fitbit-daily", "strava-daily"], "the family Move, its two lines open (D188, D191)");
  assert.deepEqual(sections.find((section) => section.family === "school")?.building.map((condition) => condition.id), ["ecoledirecte-grade-shown"], "the family School, for its one line being built (D179)");
  assert.deepEqual(sections.find((section) => section.family === "course")?.building.map((condition) => condition.id), ["udemy-course-shown"], "beside the Coursera and edX certificates (D178, D218)");
  assert.deepEqual(sections.find((section) => section.family === "exam")?.conditions.map((condition) => condition.id), ["toefl-mybest-shown"], "the TOEFL score is open in its family, the others being built beside it");
  assert.deepEqual(sections.find((section) => section.family === "study")?.building.map((condition) => condition.family), ["study", "study", "study"]);
  const language = sections.find((section) => section.family === "language");
  assert.ok(language, "the language family is on the page");
  assert.ok(
    language.conditions.findIndex((condition) => condition.id === "duolingo-daily") <
      language.conditions.findIndex((condition) => condition.id === "duolingo-english-test"),
    "the daily lesson comes before the test",
  );
  for (const section of sections) {
    const names = section.conditions.map((condition) => condition.name);
    // In the register's own order inside a family, not the alphabet's (D139): the first line of a family is the one
    // to offer first, and the founder put the daily lesson before the test because it asks less of the recipient.
    assert.deepEqual(names, CONDITIONS.filter((condition) => condition.family === section.family).map((condition) => condition.name), `${section.family} follows the register`);
  }
});

test("the screen prints the register and writes no catalogue of its own", () => {
  assert.match(page, /catalogueSections\(\)/);
  assert.match(page, /FRONTIERS\.map/);
  assert.match(page, /stateWords\(/);
  for (const condition of CONDITIONS) assert.ok(!page.includes(condition.name), `${condition.id} is written into the screen`);
  for (const state of STATES) assert.ok(!page.includes(`"${state.title}"`), `${state.title} is written into the screen`);
  for (const frontier of FRONTIERS) assert.ok(!page.includes(frontier.name), `${frontier.id} is written into the screen`);
});

test("a state is a sentence on the page, never a badge", () => {
  // A badge is a coloured box holding one word. The states are printed inside a paragraph, and nothing about them is
  // coloured: a pill would rank four states that are not a scale, and would say green where the words say waiting.
  assert.doesNotMatch(page, /rounded-full/);
  assert.doesNotMatch(page, /bg-\[var\(--(accent|good|warn|bad)/);
  assert.match(page, /<p className=\{HELP\}>\s*\n\s*<span className="font-medium text-\[var\(--text\)\]">\{state\.title\}\.<\/span>/);
});

test("it is reachable without an account and from the judges page, and it says the chooser still offers only the proved", () => {
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /href="\/what-viky-can-check"/, "Home, where a reader without an account is");
  assert.match(readFileSync("app/kit/Me.tsx", "utf8"), /href="\/what-viky-can-check"/, "and where a reader with one is");
  assert.match(readFileSync("app/judges/JudgesConditions.tsx", "utf8"), /href="\/what-viky-can-check"/);
  assert.match(CATALOGUE.intro, /only what is open is shown to you/);
  // The judges page says where each condition stands in the same words as the public page, not in its own.
  assert.match(readFileSync("app/judges/JudgesConditions.tsx", "utf8"), /stateOf\(condition\)\.title/);
});

/**
 * The two natures of a condition (D162): read for the person, or shown by the person. Every condition says which,
 * and every one of the pilot is read: a shown one is a different promise and comes with its own decision.
 */
test("every condition says its nature, and every one of the pilot is read for the person", () => {
  for (const condition of CONDITIONS) assert.ok(condition.nature === "read" || condition.nature === "shown" || condition.nature === "connected", `${condition.id} has no nature`);
  assert.deepEqual(CONDITIONS.filter((condition) => condition.nature === "shown").map((condition) => condition.id), ["toefl-mybest-shown", "university-enrollment-shown"], "the TOEFL score is open since its path was complete (D184)");
  // What is being built lives beside the register, resolvable by id and offered to an operator alone (D164, D165, D174, D176).
  assert.deepEqual(
    BUILDING.map((condition) => condition.id),
    ["cambridge-english-shown", "ielts-shown", "bac-morocco-shown", "bac-cameroon-shown", "bac-france-shown", "udemy-course-shown", "chsi-enrolment-shown", "waec-result-shown", "university-year-passed-shown", "university-grade-shown", "ecoledirecte-grade-shown"],
  );
  for (const id of BUILDING.map((condition) => condition.id)) {
    const shown = conditionById(id);
    assert.ok(shown?.nature === "shown" || shown?.nature === "connected", `${id} is shown by them, or connected by them (D188)`);
    assert.equal(shown?.live, false, `${id} is not open until a real proof has run end to end, then the founder's word`);
    // No fifth state (D169): a line being built carries none, and the page says "Being built" of it.
    assert.equal(shown?.state, undefined, `${id} carries no state while it is being built`);
    assert.throws(() => stateOf(shown as never), /carries no state/);
    assert.ok(shown?.beforeItOpens, `${id} says what has to happen first`);
    assert.ok(!CONDITIONS.includes(shown as never), `${id} is not in the register: a piece is missing`);
  }
  for (const condition of CONDITIONS) assert.equal(stateOf(condition).id, condition.state, `${condition.id} is in the register and carries a state`);
  // A frontier line that says "Being built" either names the line it is about, so the catalogue never prints it
  // twice, or names none because its lines print under their own family (the three bac lines, D176).
  assert.deepEqual(FRONTIERS.filter((frontier) => frontier.conditionId).map((frontier) => frontier.conditionId), ["university-enrollment-shown"]);
  for (const frontier of FRONTIERS) {
    if (frontier.conditionId) assert.ok(frontier.building, `${frontier.id} names a line and says nothing is being built`);
    if (!frontier.building) assert.equal(frontier.conditionId, undefined, `${frontier.id} names a line and says nothing is being built`);
  }
  const printed = new Set(catalogueSections().flatMap((section) => section.building).map((condition) => condition.id));
  for (const id of ["bac-morocco-shown", "bac-cameroon-shown", "bac-france-shown", "ecoledirecte-grade-shown"]) assert.ok(printed.has(id), `${id} prints under its family, since no frontier line names it`);
});
