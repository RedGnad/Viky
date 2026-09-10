import assert from "node:assert/strict";
import test from "node:test";
import { checkInDayIndex, formatAusd, utcDayOf } from "../src/gift-reader";
import { contractRefusal } from "../src/gift-api";

test("day arithmetic matches the contract: UTC day numbers and the index inside the window", () => {
  assert.equal(utcDayOf(1_800_000_000), Math.floor(1_800_000_000 / 86_400));
  const startDay = utcDayOf(1_800_000_000) + 1;
  assert.equal(checkInDayIndex({ startDay: 0 }, 1_800_000_000), 0, "no baseline yet");
  assert.equal(checkInDayIndex({ startDay }, 1_800_000_000), 0, "the baseline day is not open");
  assert.equal(checkInDayIndex({ startDay }, startDay * 86_400 + 3_600), 1);
  assert.equal(checkInDayIndex({ startDay }, (startDay + 6) * 86_400), 7);
});

test("money is shown as dollars with two decimals, never raw units", () => {
  assert.equal(formatAusd(0n), "$0.00");
  assert.equal(formatAusd(1_000_000n), "$1.00");
  assert.equal(formatAusd(7_000_004n), "$7.00");
  assert.equal(formatAusd(1_234_567n), "$1.23");
  assert.equal(formatAusd(500_000_000_000n), "$500000.00");
});

test("every contract refusal maps to a sentence a person can act on", () => {
  assert.deepEqual(contractRefusal("InsufficientProgress"), { code: "NOT_ENOUGH_PROGRESS", message: "Not enough progress yet for a full day. Keep going and check in again." });
  assert.equal(contractRefusal("SomethingNew")?.code, "REFUSED");
  assert.equal(contractRefusal(undefined), null);
  const forbidden = /\b(wallet|gas|chain|seed|token|transaction hash|address)\b/i;
  for (const name of ["InsufficientProgress", "NothingToCredit", "OutsideWindow", "NullifierAlreadyUsed", "IdentityMismatch", "AlreadyClaimed", "InsufficientEarned", "IntentExpired"]) {
    assert.doesNotMatch(contractRefusal(name)?.message ?? "", forbidden, name);
  }
});
