import assert from "node:assert/strict";
import test from "node:test";
import { GIFT_GAS_CEILING, giftGasLimit } from "../src/gift-gas";

// The highest figures the Foundry gas report produced on 10 Sep 2026 (mock AUSD). If the contract grows
// past a ceiling, this test fails before the relayer starts declaring limits that are too small.
const OBSERVED_MAX = {
  createGift: 274_423,
  claim: 75_400,
  checkIn: 118_131,
  drain: 54_458,
  finalise: 73_934,
  refundUnearned: 138_150,
  withdrawEarned: 119_680,
  withdrawEarnedWithIntent: 123_098,
  cancel: 153_780,
  registerGoal: 59_809,
  setCreationPaused: 51_088,
  setCheckInPaused: 51_009,
} as const;

test("every ceiling sits above the observed maximum and the declared limit adds the Monad margin", () => {
  for (const [name, observed] of Object.entries(OBSERVED_MAX) as Array<[keyof typeof OBSERVED_MAX, number]>) {
    const ceiling = GIFT_GAS_CEILING[name];
    assert.ok(ceiling > observed, `${name}: ceiling ${ceiling} must exceed observed ${observed}`);
    const limit = giftGasLimit(name);
    assert.equal(limit, BigInt(ceiling) + (BigInt(ceiling) * 750n + 9_999n) / 10_000n);
    assert.ok(limit > BigInt(ceiling), `${name}: margin applied`);
  }
});
