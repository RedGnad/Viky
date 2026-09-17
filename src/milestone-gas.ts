import { addMonadGasBuffer } from "./monad-gas";

/**
 * The floor the relayer declares for every MilestoneGift entry point. As for the daily contract (src/gift-gas.ts), the
 * declared limit is the chain's own estimate plus the Monad margin, and these figures only keep a low estimate from
 * under-declaring. They come from `forge test --gas-report` on 17 Sep 2026 against the mock token, with the same
 * headroom the daily contract needed once the real AUSD proxy was measured (D52).
 */
export const MILESTONE_GAS_CEILING = {
  createGift: 360_000, // observed max 312,200 with the mock token
  claim: 130_000, // observed max 103,275
  prove: 160_000, // observed max 127,740
  expire: 100_000, // observed max 80,579
  refundUnearned: 170_000, // observed max 84,714
  withdrawEarned: 160_000, // observed max 119,689
  withdrawEarnedWithIntent: 170_000, // observed max 123,196
  cancel: 180_000, // observed max 120,078
} as const;

export type MilestoneFunction = keyof typeof MILESTONE_GAS_CEILING;

export function milestoneGasLimit(functionName: MilestoneFunction): bigint {
  return addMonadGasBuffer(BigInt(MILESTONE_GAS_CEILING[functionName]));
}
