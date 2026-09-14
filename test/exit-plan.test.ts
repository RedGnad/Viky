import { strict as assert } from "node:assert";
import test from "node:test";
import {
  EXIT_WINDOW_SECONDS,
  floorInWords,
  PAYOUT_MAXIMUM,
  PAYOUT_MINIMUM,
  planExit,
  shownFloor,
  type OpenExit,
} from "../src/exit-plan.js";

const ONE = 1_000_000_000_000_000_000n;
const PAYOUT = "0x00000000000000000000000000000000000A11cE" as const;
const OTHER = "0x0000000000000000000000000000000000000B0b" as const;

const open = (over: Partial<OpenExit> = {}): OpenExit => ({
  id: "e1",
  amount: 3_000_000n,
  payoutTo: PAYOUT,
  minOut: 126n * ONE,
  signature: null,
  ...over,
});

test("the floor is what the screen can show, never a rounding in our favour", () => {
  // 126.94106... becomes 126.9410: four decimals, always downwards.
  const quoted = 126_941_061_234_567_890_123n;
  const floor = shownFloor(quoted);
  assert.ok(floor <= quoted, "never promises more than the exchange offered");
  assert.equal(floorInWords(floor), "126.9410");
  assert.equal(shownFloor(0n), 0n);
});

test("what the screen prints and what the signature binds are the same number", () => {
  const floor = shownFloor(1_000_000_000_000_000_000n);
  assert.equal(floorInWords(floor), "1.0000");
  assert.equal(floorInWords(shownFloor(999_999_999_999_999_999n)), "0.9999");
});

test("a first attempt makes new terms", () => {
  assert.deepEqual(planExit(null, { amount: 3_000_000n, payoutTo: PAYOUT, minOut: 126n * ONE }), { kind: "replace" });
});

test("a second attempt at the same thing reuses the terms already signed", () => {
  const plan = planExit(open({ signature: "0xabcd" }), { amount: 3_000_000n, payoutTo: PAYOUT, minOut: 126n * ONE });
  assert.deepEqual(plan, { kind: "reuse", id: "e1" });
});

test("the destination is compared whatever its letters look like", () => {
  const plan = planExit(open({ signature: "0xabcd" }), {
    amount: 3_000_000n,
    payoutTo: PAYOUT.toLowerCase() as typeof PAYOUT,
    minOut: 126n * ONE,
  });
  assert.deepEqual(plan, { kind: "reuse", id: "e1" });
});

test("terms nobody signed can be thrown away and made again", () => {
  const plan = planExit(open(), { amount: 5_000_000n, payoutTo: PAYOUT, minOut: 126n * ONE });
  assert.deepEqual(plan, { kind: "replace", discard: "e1" });
});

test("a signed set of terms holds until it expires, so no second signature can exist for the same money", () => {
  for (const wish of [
    { amount: 5_000_000n, payoutTo: PAYOUT, minOut: 126n * ONE },
    { amount: 3_000_000n, payoutTo: OTHER, minOut: 126n * ONE },
    { amount: 3_000_000n, payoutTo: PAYOUT, minOut: 100n * ONE },
  ]) {
    assert.deepEqual(planExit(open({ signature: "0xabcd" }), wish), { kind: "blocked", id: "e1" });
  }
});

test("the window is short, because a signature nobody used is still spendable until it ends", () => {
  assert.ok(EXIT_WINDOW_SECONDS <= 20 * 60 && EXIT_WINDOW_SECONDS >= 5 * 60);
});

/**
 * The payout service will not take a small order at all, so this is a product fact before it is a number:
 * some whole gifts are worth less than the smallest payout (D60).
 */
test("the payout minimum is the one the service publishes, not one we chose", () => {
  assert.equal(PAYOUT_MINIMUM, 879_889_249_290_954_315_600n);
  assert.equal(PAYOUT_MAXIMUM, 513_493_669_141_047_227_556_000n);
  assert.ok(PAYOUT_MINIMUM < PAYOUT_MAXIMUM);
  // What three dollars converted to on 14 Sep, which is nowhere near enough to be paid out.
  assert.ok(shownFloor(126_505_864_465_022_796_899n) < PAYOUT_MINIMUM, "a few dollars cannot be cashed out");
  assert.equal(floorInWords(PAYOUT_MINIMUM), "879.8892");
});
