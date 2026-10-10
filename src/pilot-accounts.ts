import { getAddress, isAddress } from "viem";
import type { IndexedGift } from "./envio-index";

/**
 * Whose accounts made and opened the gifts the judges page counts (the founder, 1 and 2 Oct 2026).
 *
 * The four accounts below are the founder's own test accounts, named by him on 1 Oct 2026. They are public on the
 * chain like every account, and they are listed here so that the page can say which gifts are his own tries: a count
 * of gifts that did not tell them apart would read as people using Viky when it was one person testing it. Any
 * account that is not in this list, nor an operator account of this deployment, is somebody else's, and nothing more
 * is said of whose.
 *
 * A fifth stood in the list until 10 Oct 2026: the account that opened gift 1 and did its lesson on 12 Sep 2026. It
 * is an outside person's, the first who tried Viky, on a friend's phone (the founder, that day), and the page had
 * counted that person as him.
 *
 * A gift paid by an account the judge code credited is counted apart (the final audit of 9 Oct 2026): its money is
 * the treasury's, and it is a try of the path the judges page gives. Counted with the rest, every judge who followed
 * that path read as an outside person funding a gift, and the one credit given so far, a rehearsal of the founder's,
 * already did. The pilot report groups a gift the same way, and first (`groupOf`, src/pilot-report.ts).
 */
export const FOUNDER_TEST_ACCOUNTS: readonly string[] = [
  "0xb12e0c72209bd4becfdafa96a8f3e7ebc93b8376",
  "0x350af869aba6ff26ab33517ecd3e38acaf107761",
  "0x881350ea7a98f607f42dc4c2e2edde70f8724c3d",
  "0x57193d615c1f11c5afaf8166fab8fe93dcb61697",
];

/**
 * The founder's accounts as one set of lower-case addresses: the ones above and this deployment's operator accounts.
 * An account the deployment still names as an operator's is counted as his, whatever the list above says.
 */
export function founderAccounts(operators: Iterable<string> = []): ReadonlySet<string> {
  const all = new Set(FOUNDER_TEST_ACCOUNTS.map((account) => account.toLowerCase()));
  for (const account of operators) if (isAddress(account)) all.add(account.toLowerCase());
  return all;
}

/** The length of the list in a word, as the page says it: "the four listed". A figure past the words. */
const IN_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"] as const;
export function countOfFounderAccounts(): string {
  return IN_WORDS[FOUNDER_TEST_ACCOUNTS.length] ?? String(FOUNDER_TEST_ACCOUNTS.length);
}

const NOBODY: ReadonlySet<string> = new Set();

/** An account as the page prints it: checksummed, its head and its tail. */
export function shortOf(account: string): string {
  const whole = isAddress(account) ? getAddress(account) : account;
  return `${whole.slice(0, 6)}…${whole.slice(-4)}`;
}

/**
 * Which a gift is, by who funded it and who opened it. A gift nobody opened yet is a class of its own (the audit of
 * 9 Oct 2026): judged by its funder alone, one funded by somebody who is not the founder was counted "between two
 * people", which takes two, and the judges page said three such gifts where two had been opened.
 */
export type GiftBetween = "paid from a judge credit" | "two others" | "founder to another" | "another to founder" | "the founder's own try" | "not opened yet";

/** `credited` holds the accounts the judge code credited, in lower case: nobody where no credit was ever given. */
export function between(gift: Pick<IndexedGift, "funder" | "recipient">, founders: ReadonlySet<string>, credited: ReadonlySet<string> = NOBODY): GiftBetween {
  // First, whoever opened it and whether anybody did: what paid for it was a judge credit.
  if (credited.has(gift.funder.toLowerCase())) return "paid from a judge credit";
  if (gift.recipient === null) return "not opened yet";
  const funderIsFounder = founders.has(gift.funder.toLowerCase());
  const recipientIsFounder = founders.has(gift.recipient.toLowerCase());
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
  /** How many of the gifts an account the judge code credited paid for: counted apart from everything below. */
  fromJudgeCredit: number;
  /** Who funded and who opened the other gifts, the ones no judge credit paid for. */
  funders: Readonly<{ all: number; founders: number }>;
  recipients: Readonly<{ all: number; founders: number }>;
  between: Readonly<Record<GiftBetween, number>>;
  /** How many of the gifts are on the second version of the contracts, and on the third daily contract. */
  onSecondVersion: number;
  onThirdVersion: number;
}>;

/** Who has used Viky, counted from the index's gifts: nothing here is typed in, and the founder's accounts are told apart. */
export function usageOf(gifts: readonly IndexedGift[], founders: ReadonlySet<string>, credited: ReadonlySet<string> = NOBODY): Usage {
  // The accounts are those of the gifts no judge credit paid for: a judge's two accounts are not two people using Viky.
  const others = gifts.filter((gift) => !credited.has(gift.funder.toLowerCase()));
  const funders = new Set(others.map((gift) => gift.funder.toLowerCase()));
  const recipients = new Set(others.flatMap((gift) => (gift.recipient ? [gift.recipient.toLowerCase()] : [])));
  const counted: Record<GiftBetween, number> = { "paid from a judge credit": 0, "two others": 0, "founder to another": 0, "another to founder": 0, "the founder's own try": 0, "not opened yet": 0 };
  for (const gift of gifts) counted[between(gift, founders, credited)] += 1;
  const sum = (pick: (gift: IndexedGift) => bigint) => gifts.reduce((total, gift) => total + pick(gift), 0n);
  return {
    gifts: gifts.length,
    opened: gifts.filter((gift) => gift.recipient !== null).length,
    funded: sum((gift) => gift.fundedAmount),
    earned: sum((gift) => gift.amountEarned),
    sentBack: sum((gift) => gift.amountRefunded),
    fromJudgeCredit: gifts.length - others.length,
    funders: { all: funders.size, founders: [...funders].filter((account) => founders.has(account)).length },
    recipients: { all: recipients.size, founders: [...recipients].filter((account) => founders.has(account)).length },
    between: counted,
    onSecondVersion: gifts.filter((gift) => gift.version === 2).length,
    onThirdVersion: gifts.filter((gift) => gift.version === 3).length,
  };
}
