import assert from "node:assert/strict";
import test from "node:test";
import { announcedAccount } from "../src/account/session-gate";
import { theirsSoFar } from "../src/gift-reader";

/**
 * Tests for the sentences the screens show about money and about the state of a gift
 * (docs/SCREEN-CLAIMS.md). Each one fails if the promise stops being kept, not merely if a function
 * changes shape.
 */

const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761" as const;
const B = "0x91C964e745ffd6265c75df33cA9137D81c3c454d" as const;

test('"You are signed in" waits for the server, not just for the passkey', () => {
  // The defect this pins: the account was announced as soon as the passkey opened, so the gift list asked
  // the server with no session, was refused, and kept "Account authentication is required" on screen.
  assert.equal(announcedAccount(A, undefined), undefined, "the passkey alone must not announce an account");
  assert.equal(announcedAccount(undefined, A), undefined, "a server session alone must not either");
  assert.equal(announcedAccount(A, A), A, "both agreeing is what lets the app act");
  assert.equal(announcedAccount(A, B), undefined, "two different accounts must never be treated as one");
  assert.equal(announcedAccount(undefined, undefined), undefined);
});

test('"Theirs so far" counts what was earned, not what is left to take', () => {
  // The trap: `earnedBalance` is the withdrawable balance and drops to zero the moment the recipient takes
  // it. Showing that as "theirs so far" would tell a funder the gift had earned nothing.
  const perDay = 2_857_142n;
  assert.equal(theirsSoFar({ creditedDays: 0, perDay }), 0n);
  assert.equal(theirsSoFar({ creditedDays: 1, perDay }), perDay);
  assert.equal(theirsSoFar({ creditedDays: 7, perDay }), 7n * perDay);

  // A withdrawal empties the withdrawable balance; what they earned is unchanged.
  const afterThreeDays = { creditedDays: 3, perDay };
  const earnedBalanceAfterTakingItAll = 0n;
  assert.equal(theirsSoFar(afterThreeDays), 3n * perDay);
  assert.notEqual(theirsSoFar(afterThreeDays), earnedBalanceAfterTakingItAll);
});
