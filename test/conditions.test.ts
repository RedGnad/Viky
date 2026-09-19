import assert from "node:assert/strict";
import test from "node:test";
import { globSync, readFileSync } from "node:fs";
import { attestedSourceIds } from "../src/attested-sources";
import { CONDITIONS, conditionById, conditionOfGoal, DUOLINGO_DAILY, liveConditions } from "../src/conditions";
import { GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";
import { certificateById, milestoneById } from "../src/milestone-conditions";

/**
 * The register is the spine (structure of 17 Sep 2026, C1): screens read it, and only what works from end to
 * end is offered. These tests keep both true.
 */

test("only a condition a gift can be made on today is live, and that is the lesson and the chess rating", () => {
  // D109, 19 Sep 2026: while we build, a condition wired from end to end is offered as soon as a gift can be created
  // on it. Chess.com joined with two real gifts already running on it, 1,000,000 and 1,000,002; the English test
  // joined the day goal 5 was registered on the milestone contract, read back from the chain on 19 Sep 2026 with the
  // provider id it expects and the having-it-or-not shape.
  assert.deepEqual(
    liveConditions().map((condition) => condition.id),
    ["duolingo-daily", "chess-rating", "duolingo-english-test"],
    "a live condition needs the whole line behind it: contract deployed, its goal registered, a reading that runs",
  );
  assert.equal(DUOLINGO_DAILY.goalType, GOAL_TYPE_DUOLINGO_XP);
  assert.equal(conditionOfGoal(GOAL_TYPE_DUOLINGO_XP)?.id, "duolingo-daily");
  assert.equal(conditionById("coursera-certificate")?.live, false, "its goal is not on the contract, and its source has a question to answer");
});

test("every condition names a reading that exists, and a milestone has no goal type on the daily contract", () => {
  const readings = attestedSourceIds();
  for (const condition of CONDITIONS) {
    assert.ok(readings.includes(condition.reading), `${condition.id} reads ${condition.reading}, which no attested source defines`);
    if (condition.kind === "milestone") assert.equal(condition.goalType, null, `${condition.id} is a milestone`);
    else assert.ok(typeof condition.goalType === "number", `${condition.id} needs the daily contract's goal type`);
    assert.ok(condition.name.length > 0 && condition.help.length > 0 && condition.source.length > 0);
    assert.ok(condition.words.connect.includes(condition.source), `${condition.id}'s connect sentence names its source`);
  }
});

test("no destination, card, or step of offering a gift names a source in its own words: the register does", () => {
  // The kit is what the structure builds; offering a gift (S2) and a gift's page (S3) were rebuilt on it.
  for (const file of [...globSync("app/kit/**/*.tsx"), "app/components/PayGift.tsx", "app/components/GiftPage.tsx", "src/sentences.ts", "src/pending-gift.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Duolingo|Chess\.com|Coursera|Strava/, `${file} names a source itself`);
  }
});

test("what a funder is offered comes from the register: the question, its check, and what counts as a day", () => {
  const live = liveConditions();
  for (const condition of live) {
    // A gift has to be makeable on anything live, which means a goal on the daily contract for a habit, and the
    // milestone half of the register for a target: a live condition with neither could be chosen and never created.
    if (condition.kind === "daily") assert.ok(condition.goalType !== null, `${condition.id} is live, so a gift can be made on it`);
    // A climb keeps its cadences in one half of the register and something granted once keeps its own in the other
    // (D47). What matters is that a live milestone has whichever half its shape needs, never that it has the climb's.
    else assert.ok(milestoneById(condition.id) ?? certificateById(condition.id), `${condition.id} is a live milestone with neither a climb nor a certificate written`);
    assert.ok(condition.words.eachDay.length > 0);
    if (condition.link.kind === "username") {
      assert.ok(condition.link.row.length > 0 && condition.link.noneGiven.length > 0);
      assert.ok(condition.link.check, `${condition.id} is live and read by name, so the name is checked before money moves`);
      assert.equal(condition.link.check?.valid(condition.link.example), true, "its own example passes its own check");
      assert.equal(condition.link.check?.valid("not a name!"), false);
    }
    if (condition.target || condition.link.kind === "username") {
      assert.ok(condition.detailTitle, `${condition.id} asks the funder something on the detail step, so that step has a title`);
    }
    if (condition.kind === "daily") {
      assert.ok(condition.target, `${condition.id} is daily, so a day has a bar`);
      assert.ok((condition.target?.suggested ?? 0) >= (condition.target?.min ?? 1));
    }
  }
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(sheet, /liveConditions\(\)/, "the list of what they will do is the live register");
});
