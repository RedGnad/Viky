import { strict as assert } from "node:assert";
import test from "node:test";
import { DAY_MARK, dayInWords, giftDays, stripFromRecord, stripOf } from "../src/day-states.js";

/**
 * The states of a day, and the one the counts cannot give. A recipient on the third day once read
 * "1 of 7 done, 0 missed" and concluded something was broken (D50); this is what replaces that arithmetic.
 */

const DAY = 86_400_000;
const START = 20_708; // 12 Sep 2026
const CATCH_UP = 30 * 3_600; // the corrected contract's window

const gift = (over: Partial<Parameters<typeof giftDays>[0]> = {}) => ({
  startDay: START,
  endDay: START + 6,
  durationDays: 7,
  creditedDays: 1,
  missedDays: 0,
  ...over,
});

/** 14 Sep at noon: day one settled, day two behind, day three today. */
const noonOn = (dayNumber: number) => dayNumber * DAY + 12 * 3_600_000;

test("before the first reading there is no window, and no days", () => {
  const { days, earned } = giftDays(gift({ startDay: 0, creditedDays: 0 }), CATCH_UP, noonOn(START));
  assert.deepEqual(days, []);
  assert.equal(earned, 0);
});

test("a day behind that a reading can still earn says so, with its deadline", () => {
  const { days } = giftDays(gift(), CATCH_UP, noonOn(START + 2));
  assert.equal(days.length, 7);
  assert.equal(days[0].state, "settled");
  assert.equal(days[1].state, "catchable");
  assert.ok(days[1].deadlineMs && days[1].deadlineMs > noonOn(START + 2), "and it has not passed");
  assert.equal(days[2].state, "today");
  assert.equal(days[3].state, "toCome");
});

test("once the window has closed the day is going back, not still winnable", () => {
  // 15 Sep at noon: day two of the gift (13 Sep) closed at 06:00 UTC on the 15th.
  const { days } = giftDays(gift(), CATCH_UP, noonOn(START + 3));
  assert.equal(days[1].state, "aboutToReturn");
  assert.equal(days[1].deadlineMs, undefined);
  assert.equal(days[2].state, "aboutToReturn", "and so is the day after it, which nothing has settled");
  assert.equal(days[3].state, "today");
});

test("today is never a missed day, whatever the arithmetic says", () => {
  const { days } = giftDays(gift({ creditedDays: 0 }), CATCH_UP, noonOn(START));
  assert.equal(days[0].state, "today");
  assert.ok(days.slice(1).every((day) => day.state === "toCome"));
});

test("the totals come from the contract and the order does not, which is stated rather than guessed", () => {
  const { days, earned, returned } = giftDays(gift({ creditedDays: 2, missedDays: 1 }), CATCH_UP, noonOn(START + 4));
  assert.equal(earned, 2);
  assert.equal(returned, 1);
  // Three settled days, and not one of them claims which of the two it was.
  assert.deepEqual(
    days.slice(0, 3).map((day) => day.state),
    ["settled", "settled", "settled"],
  );
});

test("every day says what it is in words, and the funder is named rather than blamed", () => {
  const { days } = giftDays(gift(), CATCH_UP, noonOn(START + 3));
  assert.equal(dayInWords(days[1], "Ama"), "Day 2, going back to Ama");
  assert.equal(dayInWords(days[0], "Ama"), "Day 1, finished");
  assert.match(dayInWords(days[3], "Ama"), /today/);
});

test("each state has a mark of its own, so colour is never the only carrier", () => {
  const marks = Object.values(DAY_MARK);
  assert.equal(new Set(marks).size, marks.length);
  assert.equal(marks.length, 5);
  // Names of shapes the row draws, never characters: no face the product loads has the geometric ones.
  assert.ok(marks.every((mark) => /^[a-z]+$/.test(mark)));
});

test("a finished gift shows every day settled and nothing still to come", () => {
  const { days } = giftDays(gift({ creditedDays: 4, missedDays: 3 }), CATCH_UP, noonOn(START + 10));
  assert.ok(days.every((day) => day.state === "settled"));
});

/**
 * A gift card's strip (founder's correction of 17 Sep 2026): a day earned and a day that went back were drawn alike,
 * so "2 of 7 days done, 1 missed" and "3 of 7 days done, 0 missed" gave the same picture. Gift 1, in production, has
 * missed days.
 */
test("two gifts whose counts differ never draw the same strip, and the strip carries the counts", () => {
  const now = noonOn(START + 5);
  const counting = { startDay: START, endDay: START + 6, durationDays: 7 };
  const oneMissed = stripOf({ ...counting, creditedDays: 2, missedDays: 1 }, CATCH_UP, now);
  const noneMissed = stripOf({ ...counting, creditedDays: 3, missedDays: 0 }, CATCH_UP, now);
  assert.notDeepEqual(oneMissed, noneMissed);
  assert.deepEqual(oneMissed.slice(0, 3), ["earned", "earned", "returned"]);
  assert.deepEqual(noneMissed.slice(0, 3), ["earned", "earned", "earned"]);

  // Every split of the same settled days gives its own strip, and the strip holds exactly the counts.
  const seen = new Set<string>();
  for (let credited = 0; credited <= 5; credited += 1) {
    const strip = stripOf({ ...counting, creditedDays: credited, missedDays: 5 - credited }, CATCH_UP, noonOn(START + 6));
    assert.equal(strip.filter((day) => day === "earned").length, credited);
    assert.equal(strip.filter((day) => day === "returned").length, 5 - credited);
    assert.equal(strip.length, 7);
    seen.add(strip.join(","));
  }
  assert.equal(seen.size, 6, "six splits, six different strips");

  // Before the first reading, the strip is the gift's length, every day still to come.
  assert.deepEqual(stripOf({ ...counting, startDay: 0, creditedDays: 0, missedDays: 0 }, CATCH_UP, now), Array(7).fill("toCome"));
});

/**
 * The keeper's record per day (D86): a settled day takes the outcome the contract's events gave it, so a day earned
 * after a missed one is drawn after it. Days with no record fall back to the counts.
 */
test("a recorded day is drawn at its date, and unrecorded days fall back to the counts without double counting", () => {
  const now = noonOn(START + 5);
  const counting = { startDay: START, endDay: START + 6, durationDays: 7, creditedDays: 2, missedDays: 1 };
  // Missed the first day, earned the next two: the counts alone would draw earned, earned, returned.
  const record = [
    { day: START, outcome: "returned" as const },
    { day: START + 1, outcome: "earned" as const },
    { day: START + 2, outcome: "earned" as const },
  ];
  assert.deepEqual(stripOf(counting, CATCH_UP, now, record).slice(0, 3), ["returned", "earned", "earned"]);
  assert.deepEqual(stripOf(counting, CATCH_UP, now).slice(0, 3), ["earned", "earned", "returned"]);
  assert.equal(stripFromRecord(counting, CATCH_UP, now, record), true);

  // Only the last settled day is recorded: the other two come from what the counts leave.
  const partial = [{ day: START + 2, outcome: "earned" as const }];
  assert.deepEqual(stripOf(counting, CATCH_UP, now, partial).slice(0, 3), ["earned", "returned", "earned"]);
  assert.equal(stripFromRecord(counting, CATCH_UP, now, partial), false);
  const strip = stripOf(counting, CATCH_UP, now, partial);
  assert.equal(strip.filter((day) => day === "earned").length, 2);
  assert.equal(strip.filter((day) => day === "returned").length, 1);
});
