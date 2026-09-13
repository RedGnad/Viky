import assert from "node:assert/strict";
import test from "node:test";
import {
  CERTIFICATE,
  CHESS_RATING,
  checkTarget,
  inPlainWords,
  MilestoneTermsError,
  smallestTarget,
  startingCeiling,
} from "../src/milestone-terms";

test("the funder chooses one number, and the ceiling comes from where the person stands", () => {
  assert.equal(startingCeiling(CHESS_RATING, 1420, 1500), 1430);
  assert.equal(smallestTarget(CHESS_RATING, 1420), 1470);
  assert.equal(
    inPlainWords(CHESS_RATING, 1420, 1500),
    "Today they are at 1420. The gift is theirs when they reach 1500, and only if they start from under 1430.",
  );
});

test("the ceiling is always below the target, which is what the contract also insists on", () => {
  // A target just above today would otherwise produce a ceiling at or above it, and the contract would
  // refuse the terms after the funder had already agreed to them.
  for (const standing of [0, 5, 1420, 2800]) {
    for (const target of [standing + 1, standing + 5, standing + 50, standing + 400]) {
      assert.ok(startingCeiling(CHESS_RATING, standing, target) < target, `${standing} -> ${target}`);
    }
  }
});

test("a target too close to today is refused before anyone signs", () => {
  checkTarget(CHESS_RATING, 1420, 1470);
  assert.throws(() => checkTarget(CHESS_RATING, 1420, 1469), MilestoneTermsError);
  assert.throws(() => checkTarget(CHESS_RATING, 1420, 1420), /Choose 1470 or more/);
  assert.throws(() => checkTarget(CHESS_RATING, 1420, 0), /Choose what they should reach/);
});

test("a certificate asks no question about a starting point", () => {
  assert.equal(startingCeiling(CERTIFICATE, 0, 1), 0);
  checkTarget(CERTIFICATE, 0, 1);
  assert.throws(() => checkTarget(CERTIFICATE, 1, 1), /already have it/);
  assert.match(inPlainWords(CERTIFICATE, 0, 1), /^The gift is theirs when they have it/);
});
