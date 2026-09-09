import { addMonadGasBuffer } from "./monad-gas";

/**
 * Explicit gas limits the relayer declares for every GiftEscrow entry point. Monad charges the declared
 * limit, so each is the highest figure observed in the Foundry suite (`forge test --gas-report`,
 * 10 Sep 2026, mock AUSD) rounded up to a ceiling that leaves room for the real AUSD proxy and for
 * cold page-based storage, then the 7.5 % margin of `addMonadGasBuffer`. The first mainnet gift
 * (KT1) records the actual usage next to these figures in docs/spikes/KT1.md.
 */
export const GIFT_GAS_CEILING = {
  createGift: 320_000, // observed max 274,423 with the mock token
  claim: 100_000, // observed max 75,400
  checkIn: 160_000, // observed max 118,131
  drain: 80_000, // observed max 54,458
  finalise: 100_000, // observed max 73,934
  refundUnearned: 170_000, // observed max 138,150
  withdrawEarned: 150_000, // observed max 119,680
  withdrawEarnedWithIntent: 160_000, // observed max 123,098
  cancel: 180_000, // observed max 153,780
  registerGoal: 80_000, // observed max 59,809
  setCreationPaused: 60_000, // observed max 51,088
  setCheckInPaused: 60_000, // observed max 51,009
} as const;

export type GiftFunction = keyof typeof GIFT_GAS_CEILING;

/** The limit to declare: the ceiling plus the Monad margin. */
export function giftGasLimit(functionName: GiftFunction): bigint {
  return addMonadGasBuffer(BigInt(GIFT_GAS_CEILING[functionName]));
}
