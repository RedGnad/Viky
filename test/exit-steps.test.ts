import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AUSD, MON, USDC } from "../src/coins";
import { dollarsToChange, dustInWords, feeApplied, floorToOrder, readyFor, twoDecimalsDown, unitsOfTwoDecimals } from "../src/exit-steps";
import { CONVERSION_RESERVE } from "../src/funding-step";
import { WAY_OUT_CARD, WAY_OUT_EURO, WAYS_OUT } from "../src/rails";
import { CASH_OUT } from "../src/sentences";

/**
 * The arithmetic of the three steps of the way out (flows W3 to W9, 17 Sep 2026). A payout service is ordered
 * for a two-decimal number and expects that number, so the person only ever meets such numbers, cut down and
 * never rounded up: the figure that failed the first real order was 9.999586, which no order field takes.
 */

test("a balance is cut to two decimals, never rounded up", () => {
  assert.equal(twoDecimalsDown(9_999_586n, 6), "9.99", "the first real conversion, and what Ramp was ordered for");
  assert.equal(twoDecimalsDown(9_990_000n, 6), "9.99");
  assert.equal(twoDecimalsDown(20_994_751n, 6), "20.99");
  assert.equal(twoDecimalsDown(138_436_143_573_911_778_147n, 18), "138.43");
  assert.equal(twoDecimalsDown(5n, 6), "0.00");
  assert.equal(twoDecimalsDown(0n, 6), "0.00");
});

test("the two-decimal number is exactly what leaves, in the coin's own units", () => {
  assert.equal(unitsOfTwoDecimals("9.99", 6), 9_990_000n);
  assert.equal(unitsOfTwoDecimals("10", 6), 10_000_000n);
  assert.equal(unitsOfTwoDecimals("138.43", 18), 138_430_000_000_000_000_000n);
  for (const units of [9_999_586n, 20_994_751n, 1_000_000n, 123_456_789n]) {
    const cut = unitsOfTwoDecimals(twoDecimalsDown(units, 6), 6);
    assert.ok(cut <= units && units - cut < 10_000n, `${units} cut to ${cut}, dust under a cent`);
  }
});

test("what stays behind is said honestly", () => {
  assert.equal(dustInWords(0n, 6), "");
  assert.equal(dustInWords(9_586n, 6), "Less than 0.01", "the dust of the first real conversion");
  assert.equal(dustInWords(10_000n, 6), "0.01");
  assert.equal(dustInWords(15_000n, 6), "About 0.01", "never rounded up to a figure that is not there");
  assert.equal(dustInWords(1_234_567n, 6), "About 1.23");
  assert.equal(dustInWords(6_143_573_911_778_147n, 18), "Less than 0.01");
});

test("what is ready to send comes from the balance of the coin that service buys, above the reserve", () => {
  const euro = readyFor(WAY_OUT_EURO, USDC, 9_999_586n);
  assert.deepEqual(euro, { number: "9.99", units: 9_990_000n, dust: 9_586n });
  assert.equal(readyFor(WAY_OUT_EURO, USDC, 5_000n), undefined, "under a cent is nothing to order");
  assert.equal(readyFor(WAY_OUT_EURO, USDC, 0n), undefined);

  // The chain's own coin keeps the reserve an account cannot spend (D53): only what sits above it is ready.
  const held = CONVERSION_RESERVE + 138_436_143_573_911_778_147n;
  const card = readyFor(WAY_OUT_CARD, MON, held);
  assert.equal(card?.number, "138.43");
  assert.equal(card?.units, 138_430_000_000_000_000_000n);
  assert.equal(readyFor(WAY_OUT_CARD, MON, CONVERSION_RESERVE), undefined, "the reserve alone is not money to send");
  assert.equal(readyFor(WAY_OUT_CARD, MON, CONVERSION_RESERVE - 1n), undefined);
});

test("the amount to get ready is read in dollars and cents, against what a gift holds", () => {
  const refusals = CASH_OUT.refusals;
  assert.deepEqual(dollarsToChange("10", 20_994_751n, refusals), { units: 10_000_000n });
  assert.deepEqual(dollarsToChange("20,99", 20_994_751n, refusals), { units: 20_990_000n }, "a comma is what half the world types");
  assert.deepEqual(dollarsToChange("10.999", 20_994_751n, refusals), { refusal: refusals.shape }, "three decimals are refused, never guessed at");
  assert.deepEqual(dollarsToChange("1e3", 20_994_751n, refusals), { refusal: refusals.shape });
  assert.deepEqual(dollarsToChange("0", 20_994_751n, refusals), { refusal: refusals.shape });
  assert.deepEqual(dollarsToChange("25", 20_994_751n, refusals), { refusal: refusals.tooMuch("20.99") }, "the refusal carries the figure they do have");
  assert.equal(AUSD.decimals, 6);
});

test("the fee on the review is the one that applies, and the net is what reaches the bank", () => {
  // 8.66 EUR: 0.99 % is 0.09, under the 1.99 minimum, so the minimum applies and 6.67 reaches the bank.
  assert.deepEqual(feeApplied(8.66, WAY_OUT_EURO.fee), { fee: 1.99, net: 6.67 });
  // 1,000 EUR: 0.99 % is 9.90, over the minimum, so the share applies.
  assert.deepEqual(feeApplied(1_000, WAY_OUT_EURO.fee), { fee: 9.9, net: 990.1 });
  // Never a negative net.
  assert.deepEqual(feeApplied(1, WAY_OUT_EURO.fee), { fee: 1.99, net: 0 });
});

test("the floor the quote shows is cut to the number that can be ordered", () => {
  assert.equal(floorToOrder("$9.995586"), "9.99");
  assert.equal(floorToOrder("$10"), "10.00");
  assert.equal(floorToOrder("$0.5"), "0.50");
  assert.equal(floorToOrder("$28.56"), "28.56");
});

/**
 * Look 2 (D88) gives a screen one accent surface, and it marks the one action the screen is waiting for. The way out
 * is where that was broken: two rails, two accent buttons, and steps 2 and 3 on one screen each carrying one.
 */
test("the way out shows one accent surface at a time, on the action it is waiting for (S4)", () => {
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  // The base: the first way offered carries the accent, the others the same action in the plain shape.
  assert.match(screen, /className=\{index === 0 \? PRIMARY_BUTTON : SECONDARY_BUTTON\}/);
  // Steps 2 and 3 share a screen: placing the order leads until a code can be sent to, and then sending does.
  assert.match(screen, /const sendable = deposit\.trim\(\) !== "" && problemWithCode === null;/);
  assert.match(screen, /className=\{sendable \? SECONDARY_BUTTON : PRIMARY_BUTTON\}/, "the order button steps back");
  assert.match(screen, /className=\{sendable \? PRIMARY_BUTTON : SECONDARY_BUTTON\}/, "and sending takes the accent");
  // No rail names another on screen: what each serves is its own conditions, and the order is the screen's business.
  for (const way of WAYS_OUT) for (const other of WAYS_OUT) if (other !== way) assert.doesNotMatch(way.where, new RegExp(other.name, "i"));
});
