import type { SentConversion, SentExchange } from "./exit-store";
import { formatAusd } from "./gift-reader";
import { localInWords, operatorInWords } from "./mobile-money";
import type { ArrivedPayout } from "./mobile-money-store";

/**
 * What the judges page says of a way that is switched on (the founder, 3 Oct 2026): "Open. Nobody has used it yet."
 * until somebody has, then the first use as it happened, with its transactions. A way switched off says so, and a
 * ledger that cannot be read says that, never a count it does not have.
 */
export type FirstUse = Readonly<{ words: string; transactions: ReadonlyArray<Readonly<{ label: string; hash: string }>> }>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * A moment as this page writes it: "3 Oct 2026, 14:05 UTC". The months are written here, three letters each: the
 * system's own short name for September is "Sept" in British English, and the rest of the product writes "16 Sep".
 */
export function momentInWords(at: Date): string {
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${at.toISOString().slice(11, 16)} UTC`;
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

/**
 * What followed the bank way's first exchange, and is in no journal of Viky's: the account sent the USDC on to the
 * address Ramp's page gave, and Ramp's screen then said "Payout completed".
 *
 * The send is on the chain: the one transfer of USDC out of that account between the exchange and the next morning,
 * read on 9 Oct 2026 in windows of 100 blocks. Ramp's word was read by the founder on Ramp's own screen that evening,
 * after the send. So the page says what Ramp reports, and never that money arrived at a bank: that is on the bank's
 * side, and nothing here reads it.
 */
export const FIRST_BANK_PAYOUT = {
  /** The exchange it followed: said under that exchange and no other. */
  exchangeTx: "0x7599b203c1897f6659b2c72a3603a57fd9002c8c2a92efc463d8db6bc2e1f3ae",
  sent: { at: new Date("2026-09-16T21:41:36Z"), usdc: 9_990_000n, txHash: "0xd9f9d8e871f5df6b2914e1afc5bf2a07a22b5974763fd3a5edb2521ee586fe52" },
  reported: "Ramp reports the payout completed.",
} as const;

export type FollowedExchange = typeof FIRST_BANK_PAYOUT;

/**
 * A way out that needs no setting, the bank or the card: the first exchange the journal holds for it, the dollars
 * changed and the least they were to give of the coin its payout service buys. What the service then pays is on its
 * side and in no journal here; where it was recorded by hand for that same exchange (`followed`), the page says the
 * send and the service's own word, and no more than that.
 */
export function exchangeUse(read: Readonly<{ count: number; first: SentExchange | null }> | null, atLeast: (minOut: bigint) => string, followed?: FollowedExchange): FirstUse {
  if (read === null) return { words: "Open. The exchanges could not be read right now.", transactions: [] };
  if (read.count === 0 || read.first === null) return { words: "Open. Nobody has used it yet.", transactions: [] };
  const first = read.first;
  const exchange = `Open. Used ${times(read.count)}. The first exchange was sent on ${momentInWords(first.at)}: ${formatAusd(first.amount)} changed, for at least ${atLeast(first.minOut)}.`;
  const transactions = first.txHash ? [{ label: "the exchange", hash: first.txHash }] : [];
  if (!followed || first.txHash?.toLowerCase() !== followed.exchangeTx) return { words: exchange, transactions };
  const words = `${exchange} ${formatAusd(followed.sent.usdc)} of USDC were sent on to Ramp on ${momentInWords(followed.sent.at)}. ${followed.reported}`;
  return { words, transactions: [...transactions, { label: "the USDC sent to Ramp", hash: followed.sent.txHash }] };
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
