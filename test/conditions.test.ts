import assert from "node:assert/strict";
import test from "node:test";
import { globSync, readFileSync } from "node:fs";
import { attestedSourceIds } from "../src/attested-sources";
import { CONDITIONS, conditionById, conditionOfGoal, DUOLINGO_DAILY, liveConditions } from "../src/conditions";
import { GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";

/**
 * The register is the spine (structure of 17 Sep 2026, C1): screens read it, and only what works from end to
 * end is offered. These tests keep both true.
 */

test("only a condition wired from end to end is live, and today that is the Duolingo lesson", () => {
  assert.deepEqual(
    liveConditions().map((condition) => condition.id),
    ["duolingo-daily"],
    "a second live condition needs its own line: contract deployed, a real gift run, a line on the judges page",
  );
  assert.equal(DUOLINGO_DAILY.goalType, GOAL_TYPE_DUOLINGO_XP);
  assert.equal(conditionOfGoal(GOAL_TYPE_DUOLINGO_XP)?.id, "duolingo-daily");
  assert.equal(conditionById("chess-rating")?.live, false);
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

test("no destination or card names a source in its own words: the register does", () => {
  // The kit is what the structure builds; a task screen still on its old line may name Duolingo until its line.
  for (const file of globSync("app/kit/**/*.tsx")) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Duolingo|Chess\.com|Coursera|Strava/, `${file} names a source itself`);
  }
});
