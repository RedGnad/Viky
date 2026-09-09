/**
 * Monad charges the declared gas limit, not the gas used, so the margin above an estimate stays
 * tight. Category Labs recommends 7.5 % (Lock-in shipped 5 %). Rounded up to the next unit.
 */
export const MONAD_GAS_MARGIN_BPS = 750n;

export function addMonadGasBuffer(estimate: bigint): bigint {
  if (estimate <= 0n) throw new Error("Gas estimate must be positive");
  return estimate + (estimate * MONAD_GAS_MARGIN_BPS + 9_999n) / 10_000n;
}
