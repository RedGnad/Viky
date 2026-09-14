import { addMonadGasBuffer } from "./monad-gas";

/**
 * The floor the relayer declares for every GiftEscrow entry point, never the whole answer any more.
 *
 * These figures came from the Foundry suite against a **mock** token (`forge test --gas-report`,
 * 10 Sep 2026), and the real AUSD is a proxy that costs meaningfully more. The withdrawal path was
 * declared 172,000 against a real cost near 170,000, so it was mined and failed with nothing to report,
 * which is why no withdrawal ever worked (D52). What is declared now is what the chain says the call
 * costs, plus the Monad margin, with these kept only as a floor (`relayGasLimit` in src/relayer.ts).
 *
 * Monad charges the declared limit rather than what is used, and its docs ask for an accurate limit for
 * that reason, so estimating per call is not belt and braces: it is the documented way.
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
