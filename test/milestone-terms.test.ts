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

test("the funder chooses one number, and what is refused is only a start already at the target (D91)", () => {
  // The ceiling used to be today's reading plus ten, which killed a gift for a recipient who simply played two
  // winning games between paying and connecting. It is one below the target now, and nothing tighter.
  assert.equal(startingCeiling(CHESS_RATING, 1500), 1499);
  assert.equal(smallestTarget(CHESS_RATING, 1420), 1470);
  assert.equal(inPlainWords(CHESS_RATING, 1420, 1500), "Today they are at 1420. The gift is theirs when they reach 1500.");
  assert.doesNotMatch(inPlainWords(CHESS_RATING, 1420, 1500), /start from/);
});

test("the ceiling is always below the target, which is what the contract also insists on", () => {
  for (const target of [1, 5, 50, 400, 1500, 2800]) {
    assert.ok(startingCeiling(CHESS_RATING, target) < target, `target ${target}`);
  }
});

test("a target too close to today is refused before anyone signs", () => {
  checkTarget(CHESS_RATING, 1420, 1470);
  assert.throws(() => checkTarget(CHESS_RATING, 1420, 1469), MilestoneTermsError);
  assert.throws(() => checkTarget(CHESS_RATING, 1420, 1420), /Choose 1470 or more/);
  assert.throws(() => checkTarget(CHESS_RATING, 1420, 0), /Choose what they should reach/);
});

test("a certificate asks no question about a starting point", () => {
  assert.equal(startingCeiling(CERTIFICATE, 1), 0);
  checkTarget(CERTIFICATE, 0, 1);
  assert.throws(() => checkTarget(CERTIFICATE, 1, 1), /already have it/);
  assert.match(inPlainWords(CERTIFICATE, 0, 1), /^The gift is theirs when they have it/);
});
