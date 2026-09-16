import assert from "node:assert/strict";
import test from "node:test";
import { MON, USDC } from "../src/coins";
import { amountToSend, exactAmountText } from "../src/send-amount";

/**
 * A payout service is ordered for an exact quantity and expects exactly that to arrive; more or less can fail the
 * order and send it back, less what the network took (D75). So what leaves is what the person typed, to the last of
 * the coin's decimals, and never a rounded copy of it.
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

/**
 * The way out changes money into what a payout service takes, and the two services take different coins (D77).
 * The chain's own coin has eighteen decimals, not six. A parser fixed at six would have truncated an amount by
 * twelve digits, which looks like a rounding error and is not: it is most of somebody's money.
 */
test("a coin with eighteen decimals is read to its last one, not to the sixth", () => {
  const held = 138_436_143_573_911_778_147n; // what three dollars bought on 16 Sep 2026
  assert.equal(amountToSend("138.436143573911778147", held, MON).units, held);
  assert.equal(amountToSend("0.000000000000000001", held, MON).units, 1n, "the smallest it has");
  // Read at six decimals this would have become 138.436143, losing 99.99% of nothing and 100% of the rest.
  assert.notEqual(amountToSend("138.436143573911778147", held, MON).units, 138_436_143n);
  assert.match(String(amountToSend("138.4361435739117781471", held, MON).refusal), /eighteen decimals at most/);
});

test("the figure a refusal quotes is written in the coin that is leaving", () => {
  assert.match(String(amountToSend("2", 1_500_000n, USDC).refusal), /You have \$1\.50\./);
  assert.match(String(amountToSend("2", 1_500_000_000_000_000_000n, MON).refusal), /You have 1\.50 MON\./);
});

/** What the field opens on: the whole balance in full, with nothing in front and no symbol after it. */
test("the field is prefilled with a figure that parses back to the same amount", () => {
  for (const [units, coin] of [
    [28_564_213n, USDC],
    [138_436_143_573_911_778_147n, MON],
  ] as const) {
    const text = exactAmountText(units, coin);
    assert.equal(amountToSend(text, units, coin).units, units, `${text} must survive the round trip`);
  }
});
