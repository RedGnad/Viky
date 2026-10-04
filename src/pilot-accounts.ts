import { getAddress, isAddress } from "viem";
import type { IndexedGift } from "./envio-index";

/**
 * Whose accounts made and opened the gifts the judges page counts (the founder, 1 and 2 Oct 2026).
 *
 * The five accounts below are the founder's own test accounts, named by him on 1 Oct 2026. They are public on the
 * chain like every account, and they are listed here so that the page can say which gifts are his own tries: a count
 * of gifts that did not tell them apart would read as people using Viky when it was one person testing it. Any
 * account that is not in this list, nor an operator account of this deployment, is somebody else's, and nothing more
 * is said of whose.
 */
export const FOUNDER_TEST_ACCOUNTS: readonly string[] = [
  "0xb12e0c72209bd4becfdafa96a8f3e7ebc93b8376",
  "0x350af869aba6ff26ab33517ecd3e38acaf107761",
  "0x91c964e745ffd6265c75df33ca9137d81c3c454d",
  "0x881350ea7a98f607f42dc4c2e2edde70f8724c3d",
  "0x57193d615c1f11c5afaf8166fab8fe93dcb61697",
];

/** The founder's accounts as one set of lower-case addresses: the five above and this deployment's operator accounts. */
export function founderAccounts(operators: Iterable<string> = []): ReadonlySet<string> {
  const all = new Set(FOUNDER_TEST_ACCOUNTS.map((account) => account.toLowerCase()));
  for (const account of operators) if (isAddress(account)) all.add(account.toLowerCase());
  return all;
}

/** An account as the page prints it: checksummed, its head and its tail. */
export function shortOf(account: string): string {
  const whole = isAddress(account) ? getAddress(account) : account;
  return `${whole.slice(0, 6)}…${whole.slice(-4)}`;
}

/** Which of the three a gift is, by who funded it and who opened it. A gift nobody opened yet is judged by its funder alone. */
export type GiftBetween = "two others" | "founder to another" | "another to founder" | "the founder's own try";

export function between(gift: Pick<IndexedGift, "funder" | "recipient">, founders: ReadonlySet<string>): GiftBetween {
  const funderIsFounder = founders.has(gift.funder.toLowerCase());
  const recipientIsFounder = gift.recipient === null ? funderIsFounder : founders.has(gift.recipient.toLowerCase());
  if (funderIsFounder && recipientIsFounder) return "the founder's own try";
  if (funderIsFounder) return "founder to another";
  if (recipientIsFounder) return "another to founder";
  return "two others";
}

export type Usage = Readonly<{
  gifts: number;
  opened: number;
  /** What was put into the gifts in all, what their recipients earned, and what was sent back to their funders. */
  funded: bigint;
  earned: bigint;
  sentBack: bigint;
  funders: Readonly<{ all: number; founders: number }>;
  recipients: Readonly<{ all: number; founders: number }>;
  between: Readonly<Record<GiftBetween, number>>;
  /** How many of the gifts are on the second version of the contracts, and on the third daily contract. */
  onSecondVersion: number;
  onThirdVersion: number;
}>;

/** Who has used Viky, counted from the index's gifts: nothing here is typed in, and the founder's accounts are told apart. */
export function usageOf(gifts: readonly IndexedGift[], founders: ReadonlySet<string>): Usage {
  const funders = new Set(gifts.map((gift) => gift.funder.toLowerCase()));
  const recipients = new Set(gifts.flatMap((gift) => (gift.recipient ? [gift.recipient.toLowerCase()] : [])));
  const counted: Record<GiftBetween, number> = { "two others": 0, "founder to another": 0, "another to founder": 0, "the founder's own try": 0 };
  for (const gift of gifts) counted[between(gift, founders)] += 1;
  const sum = (pick: (gift: IndexedGift) => bigint) => gifts.reduce((total, gift) => total + pick(gift), 0n);
  return {
    gifts: gifts.length,
    opened: gifts.filter((gift) => gift.recipient !== null).length,
    funded: sum((gift) => gift.fundedAmount),
    earned: sum((gift) => gift.amountEarned),
    sentBack: sum((gift) => gift.amountRefunded),
    funders: { all: funders.size, founders: [...funders].filter((account) => founders.has(account)).length },
    recipients: { all: recipients.size, founders: [...recipients].filter((account) => founders.has(account)).length },
    between: counted,
    onSecondVersion: gifts.filter((gift) => gift.version === 2).length,
    onThirdVersion: gifts.filter((gift) => gift.version === 3).length,
  };
}
