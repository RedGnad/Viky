import { strict as assert } from "node:assert";
import test from "node:test";
import { EXIT_WINDOW_SECONDS, planExit, type OpenExit } from "../src/exit-plan.js";

/** The two coins the two payout services take: a stablecoin, and the chain's own (D77). */
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const NATIVE = "0x0000000000000000000000000000000000000000" as const;

const open = (over: Partial<OpenExit> = {}): OpenExit => ({
  id: "e1",
  amount: 3_000_000n,
  tokenOut: USDC,
  minOut: 2_997_000n,
  signature: null,
  ...over,
});

test("a first attempt makes new terms", () => {
  assert.deepEqual(planExit(null, { amount: 3_000_000n, tokenOut: USDC, minOut: 2_997_000n }), { kind: "replace" });
});

test("a second attempt at the same thing reuses the terms already signed", () => {
  const plan = planExit(open({ signature: "0xabcd" }), { amount: 3_000_000n, tokenOut: USDC, minOut: 2_997_000n });
  assert.deepEqual(plan, { kind: "reuse", id: "e1" });
});

test("the coin is compared whatever its letters look like", () => {
  const plan = planExit(open({ signature: "0xabcd" }), {
    amount: 3_000_000n,
    tokenOut: USDC.toLowerCase() as typeof USDC,
    minOut: 2_997_000n,
  });
  assert.deepEqual(plan, { kind: "reuse", id: "e1" });
});

test("terms nobody signed can be thrown away and made again", () => {
  const plan = planExit(open(), { amount: 5_000_000n, tokenOut: USDC, minOut: 2_997_000n });
  assert.deepEqual(plan, { kind: "replace", discard: "e1" });
});

/**
 * Choosing the other payout service is not the same request, and this is the case that would have been missed:
 * the amount and the floor can match exactly while the coin differs, and reusing the first signature would
 * hand the person a coin the service they picked does not take.
 */
test("a different coin is a different request, not the same one", () => {
  assert.deepEqual(planExit(open(), { amount: 3_000_000n, tokenOut: NATIVE, minOut: 2_997_000n }), {
    kind: "replace",
    discard: "e1",
  });
  assert.deepEqual(planExit(open({ signature: "0xabcd" }), { amount: 3_000_000n, tokenOut: NATIVE, minOut: 2_997_000n }), {
    kind: "blocked",
    id: "e1",
  });
});

test("a signed set of terms holds until it expires, so no second signature can exist for the same money", () => {
  for (const wish of [
    { amount: 5_000_000n, tokenOut: USDC, minOut: 2_997_000n },
    { amount: 3_000_000n, tokenOut: USDC, minOut: 2_000_000n },
  ]) {
    assert.deepEqual(planExit(open({ signature: "0xabcd" }), wish), { kind: "blocked", id: "e1" });
  }
});

test("the window is short, because a signature nobody used is still spendable until it ends", () => {
  assert.ok(EXIT_WINDOW_SECONDS <= 20 * 60 && EXIT_WINDOW_SECONDS >= 5 * 60);
});

/**
 * The smallest payout is no longer a number of ours. It is published by each payout service, it moves with the
 * rate, and it is asked of them when it is needed: measured twice on 16 Sep 2026, USDC on Monad sold from 6.51
 * EUR while the same service's buy side said 6.25 at that moment. A constant here would have been wrong on
 * most days, and it is the kind of wrong nobody notices until an order is refused.
 */
test("no floor and no ceiling are remembered here, because they belong to the payout service", async () => {
  const plan = await import("../src/exit-plan.js");
  for (const gone of ["PAYOUT_MINIMUM", "PAYOUT_MAXIMUM", "shownFloor", "floorInWords"]) {
    assert.equal(gone in plan, false, `${gone} must not come back: the payout service publishes it, we ask`);
  }
});
