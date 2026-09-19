import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { catalogueSections, CONDITIONS, FAMILIES, FRONTIERS, liveConditions, STATES, stateWords } from "../src/conditions";
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

test("the states are the four the founder named, in words, and there is no fifth", () => {
  assert.deepEqual(
    STATES.map((state) => state.title),
    ["Open", "Being tested", "Waiting for the source's answer", "No public page exists"],
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
  assert.deepEqual(waiting.map((condition) => condition.id), ["duolingo-english-test", "coursera-certificate"]);
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
  assert.deepEqual(FRONTIERS.map((frontier) => frontier.id), ["supervised-exams", "state-diplomas", "school-marks"]);
  // Each line rests on a page read on a day, and the two read from a source's own site say which day.
  assert.match(String(FRONTIERS.find((frontier) => frontier.id === "supervised-exams")?.why), /19 Sep 2026/);
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
    FAMILIES.filter(({ id }) => CONDITIONS.some((condition) => condition.family === id)).map(({ title }) => title),
    "the families are the register's, in its order",
  );
  for (const section of sections) {
    const names = section.conditions.map((condition) => condition.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")), `${section.family} is alphabetical inside`);
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
  assert.match(readFileSync("app/judges/JudgesConditions.tsx", "utf8"), /stateWords\(condition\.state\)\.title/);
});
