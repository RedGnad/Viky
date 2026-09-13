import assert from "node:assert/strict";
import test from "node:test";
import { announcedAccount, sessionRemaining } from "../src/account/session-gate";
import { theirsSoFar } from "../src/gift-reader";
import { ARRIVAL_FLOOR, CONVERSION_RESERVE, nextFundingStep } from "../src/funding-step";
import { AmountError, dollarsToUnits, MIN_GIFT_UNITS } from "../src/money";

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

test("the amount taken is exactly the amount typed", () => {
  // Two defects this pins, both found by reading the screen against the code on 12 Sep 2026:
  // "20.999" became $21.00 and took a dollar more than the person wrote, and "1e3" was read as $1,000.
  assert.equal(dollarsToUnits("20"), 20_000_000n);
  assert.equal(dollarsToUnits("20.50"), 20_500_000n);
  assert.equal(dollarsToUnits("20.5"), 20_500_000n);
  assert.equal(dollarsToUnits(" 1 "), 1_000_000n);
  assert.equal(dollarsToUnits("1,50"), 1_500_000n, "a comma is what half the world types");

  for (const typed of ["20.999", "1e3", "0x14", "-3", "abc", "", "  ", "20.", ".5", "1 000", "Infinity", "20.5.1"]) {
    assert.throws(() => dollarsToUnits(typed), AmountError, `"${typed}" must be refused, never guessed at`);
  }

  // Never silently below the contract's own floor: the person is told, not refused by the chain later.
  assert.throws(() => dollarsToUnits("0"), /smallest gift is \$1\.00/);
  assert.throws(() => dollarsToUnits("0.99"), /smallest gift is \$1\.00/);
  assert.equal(dollarsToUnits("1.00"), MIN_GIFT_UNITS);
});

test("the session countdown never shows a negative or a stale number", () => {
  assert.equal(sessionRemaining(undefined, 1_000), undefined, "a closed session shows no countdown");
  assert.deepEqual(sessionRemaining(1_000 + 61_000, 1_000), { minutes: 1, seconds: 1 });
  assert.deepEqual(sessionRemaining(1_000, 1_000), { minutes: 0, seconds: 0 }, "at the deadline it is zero");
  assert.deepEqual(sessionRemaining(1_000, 999_999), { minutes: 0, seconds: 0 }, "past the deadline it stays zero");
  assert.deepEqual(sessionRemaining(1_000 + 10 * 60_000, 1_000), { minutes: 10, seconds: 0 }, "a fresh session shows its full length");
});


test("the funder screen converts a payment that arrived, and never one that did not", () => {
  const wanted = 20_000_000n;

  // Enough already: make the gift, convert nothing.
  assert.deepEqual(nextFundingStep({ held: wanted, arriving: 10n ** 18n, wanted }), { do: "give" });
  assert.deepEqual(nextFundingStep({ held: wanted + 1n, arriving: 0n, wanted }), { do: "give" });

  // Nothing there, or only dust: keep waiting, and never convert what would cost more than it brings.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, wanted }), { do: "wait", sawSomething: false });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVAL_FLOOR, wanted }), { do: "wait", sawSomething: true });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVAL_FLOOR + CONVERSION_RESERVE, wanted }), {
    do: "wait",
    sawSomething: true,
  });

  // A real payment: convert it, keeping back exactly what the conversion costs.
  const payment = 10n ** 18n;
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: payment, wanted }), {
    do: "convert",
    amount: payment - CONVERSION_RESERVE,
  });

  // Half the gift already there and a payment arriving: the payment is still converted, never skipped.
  assert.deepEqual(nextFundingStep({ held: wanted / 2n, arriving: payment, wanted }), {
    do: "convert",
    amount: payment - CONVERSION_RESERVE,
  });

  // What is converted is never more than what arrived.
  for (const arriving of [payment, payment * 25n, ARRIVAL_FLOOR + CONVERSION_RESERVE + 1n]) {
    const step = nextFundingStep({ held: 0n, arriving, wanted });
    if (step.do === "convert") assert.ok(step.amount < arriving, `converted ${step.amount} of ${arriving}`);
  }
});
