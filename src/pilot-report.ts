/**
 * The pilot's report (the founder, 1 Oct 2026): what each gift did, read from the chain and the database, and the
 * totals a reader may quote. Pure: `scripts/pilot-report.ts` reads, this decides and writes.
 *
 * Two rules it exists to keep.
 *
 * - **No figure is inflated.** The founder's own accounts and the accounts a judge code credited are not testers. Every
 *   gift belongs to exactly one group, and the totals are given per group, never summed across them.
 * - **Nobody is named.** No first name, no source account, no whole account: a gift is its number, an account its first
 *   and last characters.
 */

export type AccountKind = "founder" | "judge" | "tester";

/** An account as the report prints it: enough to tell two apart, never the whole of it. */
export function shortAccount(account: string): string {
  return account.length > 12 ? `${account.slice(0, 6)}…${account.slice(-4)}` : account;
}

export function kindOfAccount(account: string, founders: ReadonlySet<string>, judged: ReadonlySet<string>): AccountKind {
  const one = account.toLowerCase();
  return founders.has(one) ? "founder" : judged.has(one) ? "judge" : "tester";
}

/** Money that reached the funder's account shortly before the gift: who sent it, in which transaction. */
export type Arrival = Readonly<{
  coin: "AUSD" | "USDC";
  units: bigint;
  /** The sender the token's own transfer names. */
  from: string;
  /** Who sent the transaction that carried it, and to what. */
  txFrom: string;
  txTo: string | null;
  hash: string;
}>;

/** How a gift was paid for. `basis` says what was read to decide it, so no label is a guess left unsaid. */
export type Funding =
  | Readonly<{ how: "card"; service: string; basis: string }>
  | Readonly<{ how: "judge credit"; basis: string }>
  | Readonly<{ how: "balance"; basis: string }>
  | Readonly<{ how: "received"; from: string; basis: string }>;

/** The exchange a card's coin is changed through: the address its quotes ask an account to call (read 1 Oct 2026). */
export const KURU_ROUTER = "0xb3e6778480b2e488385e8205ea05e20060b813cb";

/**
 * The addresses a card service pays from, as the chain has shown them. Empty until a real payment by each has been
 * read: Ramp's, Rampnow's and Swapper's are learnt from their first payment, never assumed.
 */
export const CARD_SENDERS: Readonly<Record<string, string>> = {};

/**
 * How a gift was paid for, from what reached the funder's account in the hours before it (`arrivals`, latest first).
 *
 * - A judge credit, when the account was credited by the judge code before the gift.
 * - A card through Mercuryo, when what a gift holds came out of the exchange in a transaction the account sent itself:
 *   that is the chain's own coin, bought by card, being changed, and Mercuryo's way in is the only one that sells it.
 * - A card through a service whose paying address is known (`CARD_SENDERS`).
 * - Money back from an earlier gift, when a gift contract sent it: the account's own balance.
 * - Received from another account, of Viky's or not, abbreviated.
 * - The account's own balance when nothing arrived in those hours.
 */
export function fundingOf(input: Readonly<{
  funder: string;
  arrivals: readonly Arrival[];
  judgeCreditBefore: boolean;
  giftContracts: ReadonlySet<string>;
  vikyAccounts: ReadonlySet<string>;
  hours: number;
}>): Funding {
  const funder = input.funder.toLowerCase();
  const latest = input.arrivals[0];
  if (latest) {
    const from = latest.from.toLowerCase();
    if (from === KURU_ROUTER && latest.txFrom.toLowerCase() === funder) {
      return { how: "card", service: "Mercuryo", basis: "the chain's own coin, changed by the account itself through the exchange just before the gift" };
    }
    if (CARD_SENDERS[from]) return { how: "card", service: CARD_SENDERS[from], basis: `${latest.coin} sent by that service's own paying address` };
    if (input.giftContracts.has(from)) return { how: "balance", basis: "money back from an earlier gift" };
    if (!input.judgeCreditBefore) {
      return { how: "received", from: shortAccount(latest.from), basis: input.vikyAccounts.has(from) ? "sent by another Viky account" : "sent by an address Viky does not know" };
    }
  }
  if (input.judgeCreditBefore) return { how: "judge credit", basis: "the account was credited by the judge code before this gift" };
  return { how: "balance", basis: `nothing reached the account in the ${input.hours} hours before the gift` };
}

/** A way money left an account, in the words the report totals by. */
export type OutRoute = "bank exit" | "card exit" | "send" | "gift card" | "top-up";
export type Outflow = Readonly<{ route: OutRoute; dollars: string; at: string }>;

/** What a gift came to. */
export type Outcome = "reached" | "returned" | "partly earned" | "running" | "never opened";

export type PilotGift = Readonly<{
  gift: string;
  /** What it asks, as the register names it. */
  condition: string;
  funder: Readonly<{ account: string; kind: AccountKind }>;
  recipient: Readonly<{ account: string; kind: AccountKind }> | null;
  /** In dollars, as the chain holds them. */
  put: string;
  earned: string;
  returned: string;
  createdAt: string;
  funding: Funding;
  /** The link opened and the gift taken. */
  openedAt: string | null;
  /** The source account connected. */
  connectedAt: string | null;
  /**
   * The first reading that counted, a day's or a climb's: when its transaction was sent. For a daily gift that is the
   * reading its count starts from, which is not yet a day earned.
   */
  firstCountedAt: string | null;
  readings: Readonly<{ attested: number; daysEarned: number; daysReturned: number; looks: number }>;
  outcome: Outcome;
  /** How the recipient's money left their account after this gift was opened. */
  out: readonly Outflow[];
}>;

/** The four groups, each gift in exactly one. */
export type Group = "testers" | "founder to tester" | "founder only" | "judge credit";

export const GROUPS: Readonly<Record<Group, string>> = {
  testers: "Testers' own gifts: neither side is the founder's account, and no judge credit paid for it",
  "founder to tester": "The founder's gifts to testers: his money, a tester's effort",
  "founder only": "The founder's own tries: his account on both sides, a gift of his nobody opened, or a gift made to him",
  "judge credit": "Paid from a judge credit, or by an account the judge code credited",
};

export function groupOf(gift: Pick<PilotGift, "funder" | "recipient" | "funding">): Group {
  if (gift.funding.how === "judge credit" || gift.funder.kind === "judge" || gift.recipient?.kind === "judge") return "judge credit";
  if (gift.funder.kind === "founder") return gift.recipient?.kind === "tester" ? "founder to tester" : "founder only";
  return gift.recipient?.kind === "founder" ? "founder only" : "testers";
}

export type Totals = Readonly<{
  gifts: number;
  funders: number;
  recipients: number;
  put: string;
  earned: string;
  returned: string;
  /** Hours from a gift being made to its link opened, and to its first counted reading; nothing when no gift has one. */
  hoursToOpen: number | null;
  hoursToFirstCount: number | null;
  out: Readonly<Record<OutRoute, number>>;
}>;

const cents = (dollars: string) => BigInt(Math.round(Number(dollars) * 1_000_000));
const dollars = (units: bigint) => (Number(units) / 1_000_000).toFixed(2);
const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;
const mean = (values: readonly number[]) => (values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10);

export function totalsOf(gifts: readonly PilotGift[]): Totals {
  const out: Record<OutRoute, number> = { "bank exit": 0, "card exit": 0, send: 0, "gift card": 0, "top-up": 0 };
  // One account's money leaving is counted once, however many gifts that account opened.
  const seen = new Set<string>();
  for (const gift of gifts) {
    for (const flow of gift.out) {
      const key = `${gift.recipient?.account}|${flow.route}|${flow.at}|${flow.dollars}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out[flow.route] += 1;
    }
  }
  return {
    gifts: gifts.length,
    funders: new Set(gifts.map((gift) => gift.funder.account)).size,
    recipients: new Set(gifts.flatMap((gift) => (gift.recipient ? [gift.recipient.account] : []))).size,
    put: dollars(gifts.reduce((sum, gift) => sum + cents(gift.put), 0n)),
    earned: dollars(gifts.reduce((sum, gift) => sum + cents(gift.earned), 0n)),
    returned: dollars(gifts.reduce((sum, gift) => sum + cents(gift.returned), 0n)),
    hoursToOpen: mean(gifts.flatMap((gift) => (gift.openedAt ? [hoursBetween(gift.createdAt, gift.openedAt)] : []))),
    hoursToFirstCount: mean(gifts.flatMap((gift) => (gift.firstCountedAt ? [hoursBetween(gift.createdAt, gift.firstCountedAt)] : []))),
    out,
  };
}

export type PilotReport = Readonly<{
  readAt: string;
  /** What the separation rests on, said so a reader can check it. */
  founderAccounts: readonly string[];
  judgeAccounts: readonly string[];
  groups: Readonly<Record<Group, Totals>>;
  gifts: readonly (PilotGift & { group: Group })[];
}>;

export function buildReport(input: Readonly<{ readAt: string; founderAccounts: readonly string[]; judgeAccounts: readonly string[]; gifts: readonly PilotGift[] }>): PilotReport {
  const gifts = input.gifts.map((gift) => ({ ...gift, group: groupOf(gift) }));
  const groups = Object.fromEntries((Object.keys(GROUPS) as Group[]).map((group) => [group, totalsOf(gifts.filter((gift) => gift.group === group))])) as Record<Group, Totals>;
  return { readAt: input.readAt, founderAccounts: input.founderAccounts.map(shortAccount), judgeAccounts: input.judgeAccounts.map(shortAccount), groups, gifts };
}

const day = (stamp: string | null) => (stamp ? `${stamp.slice(0, 10)} ${stamp.slice(11, 16)} UTC` : "never");
const hours = (value: number | null) => (value === null ? "no gift has one" : value < 1 ? `${Math.round(value * 60)} min` : `${value} h`);

function fundingInWords(funding: Funding): string {
  if (funding.how === "card") return `card, ${funding.service} (${funding.basis})`;
  if (funding.how === "received") return `received from ${funding.from} (${funding.basis})`;
  return `${funding.how} (${funding.basis})`;
}

/** The report as a person reads it: the totals of each group first, then one block per gift. */
export function reportInWords(report: PilotReport): string {
  const lines: string[] = [];
  lines.push(`Viky pilot, read ${day(report.readAt)} from the chain and the database.`);
  lines.push(`The founder's accounts: ${report.founderAccounts.join(", ") || "none given, so nothing below is separated from him"}.`);
  lines.push(`Accounts a judge code credited: ${report.judgeAccounts.join(", ") || "none"}.`);
  lines.push("Each gift is in one group only. The groups are never added together.");
  for (const group of Object.keys(GROUPS) as Group[]) {
    const totals = report.groups[group];
    lines.push("");
    lines.push(`${GROUPS[group]}.`);
    if (totals.gifts === 0) {
      lines.push("  None.");
      continue;
    }
    lines.push(`  ${totals.gifts} gift(s), ${totals.funders} funder(s), ${totals.recipients} recipient(s).`);
    lines.push(`  Put in: $${totals.put}. Earned: $${totals.earned}. Returned: $${totals.returned}.`);
    lines.push(`  From a gift made to its link opened, on average: ${hours(totals.hoursToOpen)}. To its first counted reading: ${hours(totals.hoursToFirstCount)}.`);
    const routes = (Object.keys(totals.out) as OutRoute[]).filter((route) => totals.out[route] > 0).map((route) => `${totals.out[route]} ${route}`);
    lines.push(`  Money taken out by recipients: ${routes.join(", ") || "none yet"}.`);
  }
  lines.push("");
  lines.push("Gift by gift.");
  for (const gift of report.gifts) {
    lines.push("");
    lines.push(`Gift ${gift.gift}, ${gift.condition}: $${gift.put}, ${gift.outcome}. Group: ${gift.group}.`);
    lines.push(`  From ${gift.funder.account} (${gift.funder.kind}) to ${gift.recipient ? `${gift.recipient.account} (${gift.recipient.kind})` : "nobody yet"}.`);
    lines.push(`  Made ${day(gift.createdAt)}. Paid by: ${fundingInWords(gift.funding)}.`);
    lines.push(`  Opened ${day(gift.openedAt)}. Source connected ${day(gift.connectedAt)}. First counted reading ${day(gift.firstCountedAt)}.`);
    lines.push(`  Readings: ${gift.readings.attested} attested, ${gift.readings.looks} look(s), ${gift.readings.daysEarned} day(s) earned, ${gift.readings.daysReturned} returned.`);
    lines.push(`  Earned $${gift.earned}, returned $${gift.returned}.`);
    lines.push(`  Out of the recipient's account since: ${gift.out.map((flow) => `${flow.route} $${flow.dollars} on ${flow.at.slice(0, 10)}`).join("; ") || "nothing"}.`);
  }
  return lines.join("\n");
}
