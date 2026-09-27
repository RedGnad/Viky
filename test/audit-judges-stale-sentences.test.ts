// Sentences of the judges page that the chain no longer answers (the money path audit of 27 Sep 2026): the earlier
// contract's balance, the goals signed on 26 Sep 2026, and when the founder's key took the contracts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MILESTONE_GOALS } from "../src/milestone-goals";

const page = readFileSync(new URL("../app/judges/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");

test("the page no longer says the earlier contract still holds its first gift's money", () => {
  assert.doesNotMatch(page, /still holds the 8\.571432 AUSD/);
  assert.match(page, /its last refund went back to its funder on 23 Sep 2026/);
});

test("the goals signed on 26 Sep 2026 are said open, never waiting for a signature", () => {
  assert.doesNotMatch(page, /offered until goal 3[1-3] is signed/);
  for (const goal of [31, 32, 33]) {
    assert.ok(MILESTONE_GOALS.some((g) => g.goalType === goal), `goal ${goal} is in the register the Safe signed`);
    assert.ok(page.includes(`Open since goal ${goal} was signed on 26 Sep 2026.`));
  }
});

test("the founder's key is said to have held each contract from its own day, not from one date", () => {
  assert.doesNotMatch(page, /which had held them since 18 Sep 2026/);
});
