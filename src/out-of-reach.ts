import { perDollar } from "./currencies";
import type { Rates } from "./rates";

/**
 * Whether an amount in a card's or a phone company's own currency is surely more than the person holds (the founder,
 * 28 Sep 2026): its face value alone, at the day's rate, before Bitrefill's margin and Relay's fee, is above what they
 * hold. Only then is it marked "More than you have"; an amount near what they hold stays open, and its exact price,
 * asked before anything moves, decides. Bitrefill's own package prices are not used: they come in satoshis.
 */
export function surelyOutOfReach(faceValue: number, currency: string, held: bigint, rates: Rates | undefined): boolean {
  const per = perDollar(currency.toUpperCase(), rates);
  if (per === undefined || !Number.isFinite(faceValue) || faceValue <= 0) return false;
  return (faceValue / per) * 1_000_000 > Number(held);
}
