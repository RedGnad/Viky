import "../src/load-env";
import { neon } from "@neondatabase/serverless";
import { getAddress, parseAbiItem, type Hex } from "viem";
import { CONDITIONS } from "../src/conditions";
import { databaseUrl } from "../src/database-guard";
import { giftPublicClient, readGift, theirsSoFar } from "../src/gift-reader";
import { readMilestoneGift } from "../src/milestone-reader";
import { AUSD_ADDRESS, USDC_ADDRESS } from "../src/monad/chain";
import { buildReport, fundingOf, kindOfAccount, reportInWords, shortAccount, type Arrival, type Outcome, type Outflow, type PilotGift } from "../src/pilot-report";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW, MILESTONE_GIFT } from "../src/viky-contracts";

/**
 * `pnpm pilot:report` (the founder, 1 Oct 2026): what the pilot did, gift by gift, for the traction file. Read only:
 * it reads the database and the chain and writes nothing to either. `--json` prints the same report as JSON.
 *
 * Whose accounts are the founder's comes from `VIKY_OPERATOR_ACCOUNTS`, `PILOT_FOUNDER_ACCOUNTS` and `--founder=a,b`:
 * the report says which it used, because a founder's account left out would be counted as a tester. `--hours=2` is how
 * far back from each gift the chain is read for what paid for it (the public RPC answers logs a hundred blocks at a time).
 *
 * No first name, no source account and no whole account is read into the report: the queries do not select them.
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`).
 */

type Row = Record<string, unknown>;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const iso = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);
const dollars = (units: bigint) => (Number(units) / 1_000_000).toFixed(2);
const accounts = (list: string | undefined) => (list ?? "").split(",").map((one) => one.trim().toLowerCase()).filter((one) => /^0x[0-9a-f]{40}$/.test(one));

async function main() {
  const sql = neon(databaseUrl());
  const rows = async (text: string): Promise<Row[]> => (await sql.query(text)) as Row[];
  /** A table a deployment has not made yet holds nothing: that is not an error of the report. */
  const optional = async (text: string): Promise<Row[]> => rows(text).catch(() => []);
  const client = giftPublicClient();
  const hours = Number(flag("hours") ?? 2);

  const founders = new Set([...accounts(process.env.VIKY_OPERATOR_ACCOUNTS), ...accounts(process.env.PILOT_FOUNDER_ACCOUNTS), ...accounts(flag("founder"))]);
  const credits = await optional(`SELECT account, created_at FROM viky_judge_credits WHERE state IN ('sent', 'sending')`);
  const judged = new Set(credits.map((row) => String(row.account).toLowerCase()));

  const gifts = await rows(
    `SELECT g.gift_id, g.funder, g.recipient, g.escrow, g.goal_type, g.created_at, g.claimed_at, g.bound_at, g.created_tx, m.condition_id, m.mode
       FROM viky_gifts g LEFT JOIN viky_milestone_gifts m ON m.gift_id = g.gift_id ORDER BY g.created_at`,
  );
  const by = (list: Row[]) => new Map(list.map((row) => [String(row.gift_id), row]));
  const days = by(await optional(`SELECT gift_id, count(*) FILTER (WHERE outcome = 'earned')::int AS earned, count(*) FILTER (WHERE outcome = 'returned')::int AS returned FROM viky_days GROUP BY gift_id`));
  const sessions = by(await optional(`SELECT gift_id, count(*) FILTER (WHERE consumed_at IS NOT NULL)::int AS used, min(consumed_at) AS first FROM viky_proof_sessions GROUP BY gift_id`));
  const readings = by(await optional(`SELECT gift_id, count(*) FILTER (WHERE attested)::int AS attested, count(*) FILTER (WHERE NOT attested)::int AS looks, count(*)::int AS all_of_them FROM viky_milestone_readings GROUP BY gift_id`));
  const connections = by(await optional(`SELECT gift_id, connected_at FROM viky_connections`));
  // When a reading first counted is the day its transaction was sent: a day's row in the database can be written later.
  const counted = by(await optional(`SELECT gift_id, min(created_at) AS first FROM viky_relayed WHERE kind IN ('check-in', 'prove') GROUP BY gift_id`));
  const createdIn = by(await optional(`SELECT gift_id, min(block_number) AS block FROM viky_relayed WHERE kind = 'create' AND block_number IS NOT NULL GROUP BY gift_id`));
  const exits = await optional(`SELECT account, amount, token_out, sent_at FROM viky_exits WHERE state = 'sent'`);
  const sends = await optional(`SELECT account, amount, sent_at FROM viky_sends`);
  const orders = await optional(`SELECT account, kind, ausd_units, updated_at FROM viky_phone_orders WHERE state IN ('paid', 'delivered')`);
  const known = new Set([...gifts.flatMap((row) => [row.funder, row.recipient]), ...(await optional(`SELECT account FROM viky_accounts`)).map((row) => row.account)].filter(Boolean).map((one) => String(one).toLowerCase()));
  const giftContracts = new Set([GIFT_ESCROW, EARLIER_GIFT_ESCROW, MILESTONE_GIFT].map((one) => one.toLowerCase()));

  // The chain's own pace, read rather than assumed, to turn hours into blocks.
  const head = await client.getBlock();
  const earlier = await client.getBlock({ blockNumber: head.number - 10_000n });
  const blocksAnHour = Math.round((10_000 / Number(head.timestamp - earlier.timestamp)) * 3_600);

  /** What reached an account in the hours before a block, latest first, with who sent each transaction. */
  const arrivalsBefore = async (account: Hex, block: bigint): Promise<Arrival[]> => {
    const first = block - BigInt(Math.round(hours * blocksAnHour));
    const ranges: [bigint, bigint][] = [];
    for (let from = first; from <= block; from += 100n) ranges.push([from, from + 99n > block ? block : from + 99n]);
    const found: { coin: "AUSD" | "USDC"; units: bigint; from: string; hash: Hex; block: bigint }[] = [];
    for (let at = 0; at < ranges.length; at += 6) {
      const answers = await Promise.all(ranges.slice(at, at + 6).map(([fromBlock, toBlock]) => client.getLogs({ address: [AUSD_ADDRESS, USDC_ADDRESS], event: TRANSFER, args: { to: account }, fromBlock, toBlock })));
      for (const log of answers.flat()) found.push({ coin: log.address.toLowerCase() === AUSD_ADDRESS.toLowerCase() ? "AUSD" : "USDC", units: log.args.value ?? 0n, from: String(log.args.from), hash: log.transactionHash, block: log.blockNumber });
    }
    found.sort((left, right) => Number(right.block - left.block));
    return Promise.all(
      found.slice(0, 3).map(async (one) => {
        const sent = await client.getTransaction({ hash: one.hash });
        return { coin: one.coin, units: one.units, from: one.from, txFrom: sent.from, txTo: sent.to, hash: one.hash };
      }),
    );
  };

  const outOf = (account: string, since: string | null): Outflow[] => {
    const mine = (row: Row) => String(row.account).toLowerCase() === account && (!since || Date.parse(String(iso(row.sent_at ?? row.updated_at))) >= Date.parse(since));
    return [
      ...exits.filter(mine).map((row) => ({ route: String(row.token_out).toLowerCase() === USDC_ADDRESS.toLowerCase() ? ("bank exit" as const) : ("card exit" as const), dollars: dollars(BigInt(String(row.amount))), at: iso(row.sent_at)! })),
      ...sends.filter(mine).map((row) => ({ route: "send" as const, dollars: dollars(BigInt(String(row.amount))), at: iso(row.sent_at)! })),
      ...orders.filter(mine).map((row) => ({ route: row.kind === "gift_card" ? ("gift card" as const) : ("top-up" as const), dollars: dollars(BigInt(String(row.ausd_units))), at: iso(row.updated_at)! })),
    ].sort((left, right) => left.at.localeCompare(right.at));
  };

  const built: PilotGift[] = [];
  for (const row of gifts) {
    const id = String(row.gift_id);
    const funder = getAddress(String(row.funder));
    const recipient = row.recipient ? getAddress(String(row.recipient)) : null;
    const escrow = getAddress(String(row.escrow ?? GIFT_ESCROW));
    const milestone = escrow === MILESTONE_GIFT;
    const state = milestone ? await readMilestoneGift(escrow, id, client) : await readGift(escrow, id, client);
    const earned = "earned" in state ? state.earned : theirsSoFar(state);
    const over = "settled" in state ? state.settled || state.cancelled : state.finalised || state.cancelled;
    const outcome: Outcome = !recipient ? "never opened" : earned >= state.amount ? "reached" : !over ? "running" : earned === 0n ? "returned" : "partly earned";
    const block = createdIn.get(id)?.block ? BigInt(String(createdIn.get(id)!.block)) : (await client.getTransactionReceipt({ hash: String(row.created_tx) as Hex })).blockNumber;
    const createdAt = iso(row.created_at)!;
    const judgeCreditBefore = credits.some((credit) => String(credit.account).toLowerCase() === funder.toLowerCase() && Date.parse(String(iso(credit.created_at))) <= Date.parse(createdAt));
    const firstCounted = iso(counted.get(id)?.first);
    const openedAt = iso(row.claimed_at);
    built.push({
      gift: id,
      condition: row.condition_id ? `${row.condition_id}${row.mode ? `, ${row.mode}` : ""}` : (CONDITIONS.find((condition) => condition.goalType === Number(row.goal_type))?.id ?? `goal ${row.goal_type}`),
      funder: { account: shortAccount(funder), kind: kindOfAccount(funder, founders, judged) },
      recipient: recipient ? { account: shortAccount(recipient), kind: kindOfAccount(recipient, founders, judged) } : null,
      put: dollars(state.amount),
      earned: dollars(earned),
      returned: dollars(state.refundedToFunder),
      createdAt,
      funding: fundingOf({ funder, arrivals: await arrivalsBefore(funder, block), judgeCreditBefore, giftContracts, vikyAccounts: known, hours }),
      openedAt,
      connectedAt: iso(connections.get(id)?.connected_at ?? row.bound_at),
      firstCountedAt: firstCounted,
      readings: {
        attested: Number(readings.get(id)?.attested ?? 0) + Number(sessions.get(id)?.used ?? 0),
        looks: Number(readings.get(id)?.looks ?? 0),
        daysEarned: Number(days.get(id)?.earned ?? 0),
        daysReturned: Number(days.get(id)?.returned ?? 0),
      },
      outcome,
      out: recipient ? outOf(recipient.toLowerCase(), openedAt) : [],
    });
  }

  const report = buildReport({ readAt: new Date().toISOString(), founderAccounts: [...founders].map((one) => getAddress(one)), judgeAccounts: [...judged].map((one) => getAddress(one)), gifts: built });
  console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : reportInWords(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
