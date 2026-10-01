import { config } from "dotenv";
import { createPublicClient, getAddress, http, type Hex, type Log, type PublicClient } from "viem";
import { giftsOf, logsBetween, readingsIn, verdictOf, type FoundReading, type GiftKind, type GiftVerdict, type VerifyContracts } from "../src/consent-verify";

/**
 * Checks, from outside Viky, that every reading that moved money was taken under the recipient's own yes
 * (the audit of 1 Oct 2026, section 3.7). It needs no account, no key and no secret: a Monad RPC.
 *
 * For every gift of the second version of the two gift contracts, it reads on the anchor the consent key the
 * recipient's account bound itself, and every yes and stop anchored for the gift, and checks each Ed25519 signature
 * here. Then every reading that moved money, a day counted or a target reached, must come after a yes and before
 * any stop that followed it. What it finds is held against what the contract counts, so a reading that was not
 * found shows.
 *
 * What a pass proves: for each of those readings, the account's own consent key had signed a yes for that gift, the
 * yes was on the chain before the reading, and no stop stood between them. What it does not prove: what the yes
 * says, beyond its digest. The text is the recipient's own and is not published; they can check the digest of the
 * text their screen shows against the entry.
 *
 * Where the readings are found:
 *   by default       the public journal of each gift on the site (a list of transactions), each one then read back
 *                    from the chain. The site is only where to look: it cannot hide a reading without the count
 *                    the contract keeps disagreeing.
 *   --from-block N   the chain alone: every log of the two contracts from block N, in pieces of 100 blocks (the
 *                    public RPC's limit). Slow over many days, and it asks nothing of anybody.
 *
 * Usage:
 *   pnpm verify:consent
 *   pnpm verify:consent --gift 12
 *   pnpm verify:consent --from-block 41000000 [--piece 100]
 *   pnpm verify:consent --site https://viky.cash --daily 0x... --milestone 0x... --anchor 0x...
 *
 * The three addresses default to NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS, NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS and
 * NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS; the RPC to MONAD_RPC_URL, then https://rpc.monad.xyz.
 */

config({ path: [".env.local", ".env"], quiet: true });

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function addressOf(flag: string, setting: string): Hex | null {
  const value = (argument(flag) ?? process.env[setting])?.trim();
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`--${flag} is not an address`);
  return getAddress(value);
}

/** The transactions a gift's public journal names: where to look, and nothing that is believed. */
async function journalTransactions(site: string, giftId: string): Promise<Hex[]> {
  const answer = await fetch(new URL(`/api/gift/${giftId}/journal`, site));
  if (answer.status === 404) return [];
  if (!answer.ok) throw new Error(`${site} answered ${answer.status} for the journal of gift ${giftId}`);
  const body = (await answer.json()) as { days?: { txHash?: string | null }[]; readings?: { txHash?: string | null }[] };
  const hashes = [...(body.days ?? []), ...(body.readings ?? [])].map((entry) => entry.txHash).filter((hash): hash is string => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash));
  return [...new Set(hashes.map((hash) => hash.toLowerCase() as Hex))];
}

async function logsOfTransactions(client: PublicClient, hashes: readonly Hex[]): Promise<Log[]> {
  const logs: Log[] = [];
  for (const hash of hashes) logs.push(...((await client.getTransactionReceipt({ hash })).logs as Log[]));
  return logs;
}

const dateOf = (seconds: number) => new Date(seconds * 1_000).toISOString().replace(".000Z", "Z");

function print(verdict: GiftVerdict): void {
  const moved = verdict.readings.filter((reading) => reading.days > 0 || reading.reached);
  const head = `gift ${verdict.giftId} (${verdict.kind})`;
  if (!verdict.recipient) {
    console.log(`${verdict.problems.length ? "FAIL" : "ok  "} ${head}: not opened, nothing read`);
  } else {
    const entries = verdict.entries.map((entry) => `${entry.kind} ${dateOf(entry.anchoredAt)}${entry.stands ? "" : " (signature does not verify)"}`).join(", ") || "none";
    console.log(`${verdict.problems.length ? "FAIL" : "ok  "} ${head}: ${moved.length} reading${moved.length === 1 ? "" : "s"} moved money, ${verdict.found} of ${verdict.counted} counted by the contract found`);
    console.log(`       recipient ${verdict.recipient}, consent key ${verdict.key ?? "not bound"}`);
    console.log(`       anchored: ${entries}`);
    for (const reading of verdict.readings) console.log(`       ${reading.held === "yes" ? "ok  " : "FAIL"} ${dateOf(reading.at)} ${reading.txHash} ${reading.reached ? "target reached" : `${reading.days} day${reading.days === 1 ? "" : "s"} counted`}, held: ${reading.held}`);
  }
  for (const problem of verdict.problems) console.log(`       PROBLEM: ${problem}`);
}

async function main() {
  const rpc = process.env.MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz";
  const client = createPublicClient({ transport: http(rpc) }) as PublicClient;
  const anchor = addressOf("anchor", "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS");
  const contracts: VerifyContracts | null = anchor ? { daily: addressOf("daily", "NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS"), milestone: addressOf("milestone", "NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS"), anchor } : null;
  if (!contracts || (!contracts.daily && !contracts.milestone)) {
    throw new Error("Nothing to verify: the anchor and the second version of the gift contracts are not set. Name them with --anchor, --daily and --milestone.");
  }
  const only = argument("gift");
  const site = argument("site") ?? "https://viky.cash";
  const fromBlock = argument("from-block");
  console.log(`info RPC ${rpc}`);
  console.log(`info anchor ${contracts.anchor}, daily ${contracts.daily ?? "none"}, milestone ${contracts.milestone ?? "none"}`);

  const gifts: { kind: GiftKind; giftId: string; recipient: Hex | null; counted: number }[] = [];
  for (const [kind, contract] of [["daily", contracts.daily], ["milestone", contracts.milestone]] as const) {
    if (!contract) continue;
    for (const gift of await giftsOf(client, kind, contract)) if (!only || gift.giftId === only) gifts.push({ kind, ...gift });
  }
  if (gifts.length === 0) throw new Error(only ? `Gift ${only} is not on these contracts` : "These contracts hold no gift yet");

  let readings: FoundReading[];
  if (fromBlock !== undefined) {
    const latest = await client.getBlockNumber();
    console.log(`info readings: every log of the two contracts from block ${fromBlock} to ${latest}`);
    let said = 0n;
    const logs = await logsBetween(client, contracts, BigInt(fromBlock), latest, BigInt(argument("piece") ?? "100"), (done, of) => {
      if (done * 10n / of > said) console.log(`info ${(said = done * 10n / of) * 10n} %`);
    });
    readings = await readingsIn(client, contracts, logs);
  } else {
    console.log(`info readings: the transactions each gift's journal names on ${site}, read back from the chain`);
    const hashes = new Set<Hex>();
    for (const gift of gifts) for (const hash of await journalTransactions(site, gift.giftId)) hashes.add(hash);
    readings = await readingsIn(client, contracts, await logsOfTransactions(client, [...hashes]));
  }

  let failed = 0;
  for (const gift of gifts.sort((a, b) => Number(BigInt(a.giftId) - BigInt(b.giftId)))) {
    const verdict = await verdictOf(client, contracts.anchor, gift, readings);
    print(verdict);
    if (verdict.problems.length > 0) failed += 1;
  }
  console.log("");
  if (failed > 0) throw new Error(`${failed} of ${gifts.length} gift${gifts.length === 1 ? "" : "s"} did not pass`);
  console.log(`PASSED: ${gifts.length} gift${gifts.length === 1 ? "" : "s"}, every reading that moved money was taken under a yes anchored before it.`);
}

main().catch((error) => {
  console.error("VERIFY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
