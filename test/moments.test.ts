import assert from "node:assert/strict";
import test from "node:test";
import { contractDayInWords, contractRangeInWords, dateInWords, momentInWords, nextPassMs } from "../src/moments";
import { COUNTING_PASS_UTC } from "../src/pass-schedule";

/** Item 12 of the product structure: every judgement is dated, in the reader's own clock. */

const DAY = 86_400_000;
const START = 20_714; // 18 Sep 2026

test("a moment always carries its date, whether it is today, tomorrow or later", () => {
  const now = new Date(2026, 8, 17, 23, 59).getTime();
  assert.match(momentInWords(new Date(2026, 8, 17, 23, 59, 30).getTime(), now), /^today, 17 Sep, at /);
  assert.match(momentInWords(new Date(2026, 8, 18, 2, 30).getTime(), now), /^tomorrow, 18 Sep, at /);
  assert.match(momentInWords(new Date(2026, 8, 19, 8, 0).getTime(), now), /^Sat 19 Sep at /);
});

test("the next reading is the next time the counting pass runs, never one already past", () => {
  const before = Date.UTC(2026, 8, 17, 0, 10);
  assert.equal(nextPassMs(COUNTING_PASS_UTC, before), Date.UTC(2026, 8, 17, 0, 30));
  const after = Date.UTC(2026, 8, 17, 0, 31);
  assert.equal(nextPassMs(COUNTING_PASS_UTC, after), Date.UTC(2026, 8, 18, 0, 30));
});

test("a gift's days are the contract's UTC days, written as one range", () => {
  assert.equal(contractDayInWords(START), "18 Sep");
  assert.equal(contractRangeInWords(START, START + 6), "18 to 24 Sep 2026");
  assert.equal(contractRangeInWords(START + 10, START + 16), "28 Sep to 4 Oct 2026");
  assert.equal(contractRangeInWords(Math.floor(Date.UTC(2026, 11, 28) / DAY), Math.floor(Date.UTC(2027, 0, 3) / DAY)), "28 Dec 2026 to 3 Jan 2027");
  assert.equal(dateInWords(new Date(2026, 9, 1, 12).getTime()), "1 Oct 2026");
});
