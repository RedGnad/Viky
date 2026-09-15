import assert from "node:assert/strict";
import test from "node:test";
import { amountToSend } from "../src/send-amount";

/**
 * A payout service is ordered for an exact quantity and expects exactly that to arrive; more or less can fail the
 * order and send it back, less what the network took (D75). So what leaves is what the person typed, to the last of
 * the coin's six decimals, and never a rounded copy of it.
 */

const HOLDING = 28_564_213n;

test("what is typed is taken to the last of the six decimals", () => {
  assert.equal(amountToSend("28.564213", HOLDING).units, 28_564_213n);
  assert.equal(amountToSend(" 28.56 ", HOLDING).units, 28_560_000n);
  assert.equal(amountToSend("28,56", HOLDING).units, 28_560_000n, "a comma is what half the world types");
  assert.equal(amountToSend("28", HOLDING).units, 28_000_000n);
  assert.equal(amountToSend("0.000001", HOLDING).units, 1n, "the smallest the coin has");
  // A seventh decimal is refused rather than trimmed, even when it is a zero: the amount that leaves is the amount
  // that was typed, and nothing here decides what somebody meant.
  assert.match(String(amountToSend("28.5642130", HOLDING).refusal), /six decimals at most/);
});

test("anything the coin cannot carry is refused, and says what to type", () => {
  for (const typed of ["", " ", "abc", "1e3", "-1", "28.5642131", "28.1.2", "1 000", "Infinity", "0x14", "."]) {
    const refusal = amountToSend(typed, HOLDING).refusal;
    assert.match(String(refusal), /six decimals at most/, `"${typed}" must be refused`);
  }
  assert.match(String(amountToSend("0", HOLDING).refusal), /above zero/);
  assert.match(String(amountToSend("0.000000", HOLDING).refusal), /above zero/);
});

test("more than the account holds is refused, with the exact figure it does hold", () => {
  assert.equal(amountToSend("28.564214", HOLDING).units, undefined);
  assert.match(String(amountToSend("28.564214", HOLDING).refusal), /You have \$28\.564213\. Send that or less\./);
  assert.equal(amountToSend("28.564213", HOLDING).units, HOLDING, "the whole balance is allowed, to the last decimal");
  assert.match(String(amountToSend("1", 0n).refusal), /You have \$0\.00\./);
});
