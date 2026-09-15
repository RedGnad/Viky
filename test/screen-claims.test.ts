import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { announcedAccount, sessionRemaining } from "../src/account/session-gate";
import { formatAusdExact, theirsSoFar } from "../src/gift-reader";
import { catchUpDay, deadlineInWords } from "../src/catch-up";
import { ARRIVAL_FLOOR, CONVERSION_RESERVE, fundingStageShown, nextFundingStep, paymentArrived } from "../src/funding-step";
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

  // Nothing there, or not enough above the reserve: keep waiting. Converting below Monad's 10 MON reserve
  // is refused by the chain, so a small arrival is not something to act on (D56).
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, wanted }), { do: "wait", sawSomething: false });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVAL_FLOOR, wanted }), { do: "wait", sawSomething: true });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVAL_FLOOR + CONVERSION_RESERVE, wanted }), {
    do: "wait",
    sawSomething: true,
  });
  // Whatever it decides to convert, what stays behind clears the reserve.
  assert.ok(CONVERSION_RESERVE > 10n * 10n ** 18n, "more than the 10 MON the chain reserves");

  // A real payment: 25 EUR buys roughly 1,163 MON, so this is the ordinary case.
  const payment = 1_163n * 10n ** 18n;
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

test("once there is an account, the account step gives way to the check and its button to pay", () => {
  // The defect of 15 Sep: the funder made their account on this step and was left with nothing to press but Back.
  assert.equal(fundingStageShown("account", true), "check");
  assert.equal(fundingStageShown("account", false), "account");
  for (const stage of ["who", "howMuch", "check"] as const) {
    assert.equal(fundingStageShown(stage, true), stage);
    assert.equal(fundingStageShown(stage, false), stage);
  }
});

test("a payment that outlasts the session is used where it sits, and the waiting page never reads a closed account", () => {
  // The defect of 15 Sep: the payment took twelve minutes, the session closed after ten, and nothing was made of it.
  // The same test decides what the waiting page converts and what the check offers to use.
  assert.equal(paymentArrived(ARRIVAL_FLOOR + CONVERSION_RESERVE), false);
  assert.equal(paymentArrived(ARRIVAL_FLOOR + CONVERSION_RESERVE + 1n), true);
  for (const arriving of [0n, ARRIVAL_FLOOR, 1_231n * 10n ** 18n]) {
    const converts = nextFundingStep({ held: 0n, arriving, wanted: 25_000_000n }).do === "convert";
    assert.equal(converts, paymentArrived(arriving), `${arriving}`);
  }
  const fund = readFileSync("app/components/FundGift.tsx", "utf8");
  assert.doesNotMatch(fund, /address!/, "a closed session leaves no account to read");
  // The terms are written down before the rail opens, and forgotten once the gift is made.
  assert.ok(fund.indexOf("savePendingGift(") > 0 && fund.indexOf("savePendingGift(") < fund.indexOf("window.open(WAY_IN.page"));
  const give = fund.slice(fund.indexOf("const give = useCallback"), fund.indexOf("// While the payment page is open"));
  assert.match(give, /forgetPendingGift\(\)/);
});

test("the amount written before sending all of it is exactly the amount that leaves", () => {
  // The defect of 15 Sep: the balance read to the cent while the signature moved all six decimals.
  assert.equal(formatAusdExact(28_564_213n), "$28.564213");
  assert.equal(formatAusdExact(28_560_000n), "$28.56");
  assert.equal(formatAusdExact(28_500_000n), "$28.50");
  assert.equal(formatAusdExact(28_560_010n), "$28.56001");
  assert.equal(formatAusdExact(0n), "$0.00");
  for (const units of [1n, 999_999n, 2_857_142n, 28_564_213n, 123_456_789_012n]) {
    const [whole, fraction] = formatAusdExact(units).slice(1).split(".");
    assert.equal(BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0")), units, `nothing of ${units} rounded away`);
  }
  // And the screen writes the very balance it sends, never a rounded copy of it.
  const cashOut = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(cashOut, /sendOwnMoney\(\{ account, to: ownAccount\.trim\(\) as Hex, amount: holding \}\)/);
  assert.match(cashOut, /formatAusdExact\(holding\)/);
});

test("a day that is neither counted nor lost is named, with the moment it stops being catchable", () => {
  const DAY = 86_400_000;
  const window = { startDay: 20_708, endDay: 20_714, creditedDays: 1, missedDays: 0 };
  const catchUp = 86_400 + 6 * 3_600; // the newer contract: 30 hours

  // Day 20709 is open, and catchable until 30 hours after the end of it.
  const onDayThree = 20_710 * DAY + 3_600_000;
  const open = catchUpDay(window, catchUp, onDayThree);
  assert.equal(open?.day, 20_709);
  assert.equal(open?.deadlineMs, 20_710 * DAY + catchUp * 1_000);

  // Today is never "catchable": it is simply not over.
  assert.equal(catchUpDay(window, catchUp, 20_709 * DAY + 3_600_000), undefined);
  // Nothing open once everything so far is settled.
  assert.equal(catchUpDay({ ...window, creditedDays: 2 }, catchUp, onDayThree), undefined);
  // Nor once the deadline has passed: by then it is a missed day, and the screen says that instead.
  assert.equal(catchUpDay(window, catchUp, open!.deadlineMs + 1), undefined);
  // Nor beyond the end of the window.
  assert.equal(catchUpDay({ ...window, creditedDays: 7 }, catchUp, onDayThree), undefined);
  // Nor before anything has started.
  assert.equal(catchUpDay({ ...window, startDay: 0 }, catchUp, onDayThree), undefined);

  // The two live contracts disagree, which is D50's third point; both are expressible.
  assert.equal(catchUpDay(window, 86_400, onDayThree)?.deadlineMs, 20_710 * DAY + 86_400_000);
});

test("the deadline is said in words, never as a day number", () => {
  const base = Date.UTC(2026, 8, 14, 12, 0);
  assert.match(deadlineInWords(base + 3_600_000, base, "en-GB"), /^today at /);
  assert.match(deadlineInWords(base + 20 * 3_600_000, base, "en-GB"), /^tomorrow at /);
  assert.match(deadlineInWords(base + 72 * 3_600_000, base, "en-GB"), /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at /);
});
