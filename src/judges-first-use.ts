import type { SentConversion } from "./exit-store";
import { formatAusd } from "./gift-reader";
import { localInWords, operatorInWords } from "./mobile-money";
import type { ArrivedPayout } from "./mobile-money-store";

/**
 * What the judges page says of a way that is switched on (the founder, 3 Oct 2026): "Open. Nobody has used it yet."
 * until somebody has, then the first use as it happened, with its transactions. A way switched off says so, and a
 * ledger that cannot be read says that, never a count it does not have.
 */
export type FirstUse = Readonly<{ words: string; transactions: ReadonlyArray<Readonly<{ label: string; hash: string }>> }>;

/** A moment as this page writes it: "3 Oct 2026, 14:05 UTC". */
export function momentInWords(at: Date): string {
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${day}, ${at.toISOString().slice(11, 16)} UTC`;
}

const times = (count: number) => (count === 1 ? "once" : `${count} times`);

/** The mobile money way out: the first payout Switch says arrived, its amount both ways, its country and its operator. */
export function mobileMoneyUse(on: boolean, read: Readonly<{ count: number; first: ArrivedPayout | null }> | null, countryName: (code: string) => string): FirstUse {
  if (!on) return { words: "Switched off on this deployment, so it is offered nowhere.", transactions: [] };
  if (read === null) return { words: "Open. The payouts could not be read right now.", transactions: [] };
  if (read.count === 0 || read.first === null) return { words: "Open. Nobody has used it yet.", transactions: [] };
  const first = read.first;
  const amount = `${localInWords(first.localAmount, first.localCurrency)} (${formatAusd(first.units)})`;
  const words = `Open. Used ${times(read.count)}. The first arrived on ${momentInWords(first.at)}: ${amount} to a number on ${operatorInWords(first.network)}, in ${countryName(first.country)}.`;
  const transactions = [
    ...(first.depositTx ? [{ label: "its dollars sent to Switch", hash: first.depositTx }] : []),
    { label: "the exchange that made them", hash: first.exitTx },
  ];
  return { words, transactions };
}

/** Rampnow's way in: the first USDC the converter changed into what a gift holds, and the least it was to give. */
export function conversionUse(on: boolean, read: Readonly<{ count: number; first: SentConversion | null }> | null): FirstUse {
  if (!on) return { words: "Switched off on this deployment.", transactions: [] };
  if (read === null) return { words: "Open. The conversions could not be read right now.", transactions: [] };
  if (read.count === 0 || read.first === null) return { words: "Open. Nobody has used it yet.", transactions: [] };
  const first = read.first;
  const words = `Open. Used ${times(read.count)}. The first conversion was sent on ${momentInWords(first.at)}: ${formatAusd(first.amount)} of USDC, for at least ${formatAusd(first.minOut)} of AUSD.`;
  return { words, transactions: first.txHash ? [{ label: "the conversion", hash: first.txHash }] : [] };
}
