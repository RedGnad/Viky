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

test("the withdrawal's floor is above what the real token costs, on both contracts (the audit of 1 Oct 2026)", async () => {
  // Measured by `eth_call` with an explicit limit against the real AUSD: the daily contract's withdrawal fails at
  // 172,000 and passes at 180,789; the milestone contract's fails at 182,750 and passes at 188,743. The floor is what
  // is declared when the estimate itself fails, so it must be above the cost, not above a mock token's.
  const { milestoneGasLimit } = await import("../src/milestone-gas");
  assert.ok(giftGasLimit("withdrawEarnedWithIntent") >= 182_000n);
  assert.ok(giftGasLimit("withdrawEarnedWithIntent") > 180_789n);
  assert.ok(milestoneGasLimit("withdrawEarnedWithIntent") >= 190_000n);
  assert.ok(milestoneGasLimit("withdrawEarnedWithIntent") > 188_743n);
});

test("the first reading of the second version, which checks one signature more, still sits under the floors", async () => {
  // `forge test --gas-report` on 2 Oct 2026, mock token (a reading moves no token): the daily contract's check-in at
  // most 145,548, the first reading and the days it settles included; the milestone contract's proof at most 126,059.
  // The declared limit is the chain's own estimate plus the margin; the floor only keeps a low estimate from
  // under-declaring, and must stay above what the call can cost.
  const { MILESTONE_GAS_CEILING } = await import("../src/milestone-gas");
  assert.ok(GIFT_GAS_CEILING.checkIn > 145_548);
  assert.ok(MILESTONE_GAS_CEILING.prove > 126_059);
});
