import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chooserSections, CONDITIONS, FAMILIES, SECTIONS_FROM, type Condition, type ConditionFamily } from "../src/conditions";

/**
 * The chooser's families (design audit of 16 Sep 2026, section 3).
 *
 * Two rules are worth a test each. A family is a fact in the register, so a screen can never invent one or reorder
 * them to suit itself. And the shape of the list follows the number of conditions rather than anybody's taste: one
 * list while there are few, one section per family from six on.
 */

function made(id: string, name: string, family: ConditionFamily): Condition {
  return { id, name, family, kind: "daily", goalType: 1, live: true, source: "S", help: "h", link: { kind: "link", label: "l", help: "h" }, reading: "r", words: { earnedDay: "e", connect: "c", doIt: "d", eachDay: "x" } } as unknown as Condition;
}

test("the families are the chooser's, in its order, in everyday verbs and naming no source", () => {
  // The order and the fourth are chooser.html's, 20 Sep 2026. A certification is awarded by somebody who is not the
  // person and is not a course taken, so it is a family and not a shelf beside Coursera.
  assert.deepEqual(
    FAMILIES.map((family) => family.title),
    ["Learn a language", "Play", "Finish a course", "Get certified"],
  );
  const sources = CONDITIONS.map((condition) => condition.source);
  for (const { title } of FAMILIES) {
    for (const source of sources) assert.ok(!title.includes(source), `${title} names ${source}`);
  }
});

test("every condition in the register is filed under a family that exists", () => {
  const known = new Set(FAMILIES.map((family) => family.id));
  for (const condition of CONDITIONS) assert.ok(known.has(condition.family), `${condition.id} is filed under ${condition.family}`);
  // The audit's own filing, so a condition cannot drift into another family unnoticed.
  const filed = Object.fromEntries(CONDITIONS.map((condition) => [condition.id, condition.family]));
  assert.equal(filed["duolingo-daily"], "language");
  assert.equal(filed["duolingo-english-test"], "language");
  assert.equal(filed["coursera-certificate"], "course");
  assert.equal(filed["credly-badge"], "certification");
  assert.equal(filed["chess-rating"], "play");
  assert.equal(filed["chess-tactics"], "play");
});

test("under six conditions it stays one list", () => {
  for (let count = 0; count < SECTIONS_FROM; count += 1) {
    const offered = Array.from({ length: count }, (_, index) => made(`c${index}`, `Name ${index}`, "play"));
    assert.equal(chooserSections(offered), null, `${count} conditions`);
  }
  assert.equal(SECTIONS_FROM, 6);
});

test("from six on it is one section per family, in the register's order and alphabetical inside", () => {
  const offered = [
    made("b", "Reach a chess rating on Chess.com", "play"),
    made("a", "A Duolingo lesson each day", "language"),
    made("c", "Get a Coursera certificate", "course"),
    made("d", "Reach a score on the Duolingo English Test", "language"),
    made("e", "Reach a chess rating on Lichess", "play"),
    made("f", "Get a certification on Credly", "certification"),
  ];
  const sections = chooserSections(offered);
  assert.ok(sections);
  assert.deepEqual(sections.map((section) => section.title), ["Learn a language", "Play", "Finish a course", "Get certified"]);
  assert.deepEqual(
    sections[0].conditions.map((condition) => condition.name),
    ["A Duolingo lesson each day", "Reach a score on the Duolingo English Test"],
    "alphabetical inside a family, so an editor's order is never read as advice",
  );
  assert.deepEqual(sections[1].conditions.map((condition) => condition.name), ["Reach a chess rating on Chess.com", "Reach a chess rating on Lichess"]);
});

test("a family with nothing offered does not appear at all", () => {
  const offered = Array.from({ length: 6 }, (_, index) => made(`c${index}`, `Name ${index}`, index < 3 ? "language" : "play"));
  const sections = chooserSections(offered);
  assert.ok(sections);
  assert.deepEqual(sections.map((section) => section.family), ["language", "play"]);
  assert.ok(!sections.some((section) => section.title === "Get certified"), "an empty heading would advertise what the chooser refuses to offer");
});

test("the screen takes the families from the register and writes none of its own", () => {
  const screen = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(screen, /chooserSections\(offered\)/);
  assert.match(screen, /legend=\{section\.title\}/, "the heading is the register's title");
  // A title written as a literal is what this catches; "Move" inside a word like priceMoved is not one.
  for (const { title } of FAMILIES) {
    assert.doesNotMatch(screen, new RegExp(`["'>]\\s*${title}\\s*["'<]`), `${title} is written into the screen`);
  }
  // One radio group whichever shape is drawn, so the selection stays single across sections.
  assert.equal(screen.match(/name="condition"/g)?.length, 2, "both branches name the same group");
});

test("a condition that turned live is offered once, never beside its own preview", () => {
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  // The preview door exists for what is wired and not live yet. Once a condition turns live it comes from
  // liveConditions(), so whoever draws the list must drop it from whatever the door still names: on 19 Sep 2026 the
  // assistant drew "Reach a chess rating on Chess.com" twice, two radios with the same words and the same help.
  assert.match(sheet, /preview\.map\([\s\S]{0,120}!c!?\.live/);
});
