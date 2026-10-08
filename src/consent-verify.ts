import { createPublicKey, verify } from "node:crypto";
import { BaseError, ContractFunctionRevertedError, parseEventLogs, type Abi, type Hex, type Log, type PublicClient } from "viem";
import { consentAnchorAbi } from "./consent-anchor-abi";
import { giftEscrowV2Abi } from "./gift-escrow-v2-abi";
import { milestoneGiftV2Abi } from "./milestone-gift-v2-abi";
import { consentAnchorMessage } from "./v2-protocol";

/**
 * Holds every reading that moved money against a yes written down in public before it (the audit of 1 Oct 2026,
 * section 3.7): what `pnpm verify:consent` runs. It reads the chain and nothing else that it believes: no database, no
 * key, no account.
 *
 * For each gift of the contracts opened by a link (the two daily contracts of the second and third versions, and the
 * milestone contract of the second) it reads, from the anchor, the consent key the gift's recipient bound and every
 * yes and stop anchored for that gift, and checks each one's Ed25519 signature itself:
 * the chain cannot, so an entry whose signature does not verify counts for nothing here. Then each reading that moved
 * money, a day counted or a target reached, must fall after a yes and before any stop that followed it, by the time of
 * the blocks that hold them.
 *
 * Where the readings are found is the one thing that may come from elsewhere, and it is never believed: a list of
 * transactions is only where to look. Each one is read back from the chain, and what was found is held against what the
 * contract itself counts (the days it credited, the amount it holds as earned), so a reading left out of the list shows
 * as a gift that is not fully accounted for.
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_KEY = `0x${"00".repeat(32)}`;

export type GiftKind = "daily" | "milestone";

/** The contracts read: every daily contract opened by a link, one after the other, the milestone contract, the anchor. */
export type VerifyContracts = Readonly<{ daily: readonly Hex[]; milestone: Hex | null; anchor: Hex }>;

/**
 * The contracts in service on Monad mainnet, as docs/CONTRACTS.md publishes them (test/consent-verify.test.ts holds the
 * two together): what the command reads in a clone where nothing is set, so that it needs a Monad RPC and nothing
 * else. The daily contracts are the second version, then the third, where a daily gift is made since 3 Oct 2026.
 */
export const PUBLISHED_CONTRACTS: VerifyContracts = {
  anchor: "0x2a15DF23fF62120700f14D1E5d5d56CA0dAd027e",
  milestone: "0x493c87A27E637bBc7179C17bE2B215fC18523CC0",
  daily: ["0xC83d8028347967Fc84D0e36Ae5876d9b29EAEc51", "0x591d76863177E70FfcA2C793212d4715A367Ec70"],
};

/**
 * Which contracts a run reads. What is named is read and nothing else: an address given on the command line, or else
 * the deployment's own settings. Where nothing at all is named, the published contracts. A run that names one address
 * never has a published one added to it: a rehearsal on a fork names its own, and must read those alone.
 */
export function contractsToVerify(named: Readonly<{ anchor: Hex | null; daily: readonly Hex[]; milestone: Hex | null }>): VerifyContracts | null {
  if (!named.anchor && named.daily.length === 0 && !named.milestone) return PUBLISHED_CONTRACTS;
  if (!named.anchor || (named.daily.length === 0 && !named.milestone)) return null;
  return { anchor: named.anchor, daily: named.daily, milestone: named.milestone };
}

/** One yes or one stop, as the anchor holds it, and whether the bound key really signed it. */
export type AnchoredEntry = Readonly<{ sequence: number; kind: "yes" | "stop" | "unknown"; anchoredAt: number; digest: Hex; stands: boolean }>;

/** A reading the contract acted on: where it is, when its block was made, and what it moved. */
export type FoundReading = Readonly<{ kind: GiftKind; giftId: string; recipient: Hex; txHash: Hex; at: number; days: number; reached: boolean }>;

export type ReadingVerdict = FoundReading & Readonly<{ held: "yes" | "stop" | "nothing" }>;

export type GiftVerdict = Readonly<{
  kind: GiftKind;
  giftId: string;
  recipient: Hex | null;
  /** The consent key the recipient bound on the anchor, or nothing. */
  key: Hex | null;
  entries: readonly AnchoredEntry[];
  readings: readonly ReadingVerdict[];
  /** What the contract itself counts as moved by readings: days credited, or one target reached. */
  counted: number;
  /** What the readings found add up to. Less than `counted` means a reading was not found. */
  found: number;
  problems: readonly string[];
}>;

function ed25519Verifies(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

const bytesOf = (hex: string) => Uint8Array.from(Buffer.from(hex.slice(2), "hex"));

/** The key an account bound and every entry anchored for one of its gifts, each signature checked here. */
export async function anchoredFor(client: PublicClient, anchor: Hex, account: Hex, giftId: string): Promise<{ key: Hex | null; entries: AnchoredEntry[] }> {
  const abi = consentAnchorAbi as unknown as Abi;
  const [bound, count] = await Promise.all([
    client.readContract({ address: anchor, abi, functionName: "consentKeyOf", args: [account] }) as Promise<Hex>,
    client.readContract({ address: anchor, abi, functionName: "entryCount", args: [account, BigInt(giftId)] }) as Promise<bigint>,
  ]);
  const key = bound.toLowerCase() === ZERO_KEY ? null : bound;
  const entries: AnchoredEntry[] = [];
  for (let sequence = 0; sequence < Number(count); sequence += 1) {
    const entry = (await client.readContract({ address: anchor, abi, functionName: "entryAt", args: [account, BigInt(giftId), BigInt(sequence)] })) as {
      kind: number;
      anchoredAt: bigint;
      digest: Hex;
      signatureR: Hex;
      signatureS: Hex;
    };
    const kind = Number(entry.kind) === 1 ? "yes" : Number(entry.kind) === 2 ? "stop" : "unknown";
    const message = kind === "unknown" ? null : consentAnchorMessage({ anchor, account, giftId, kind, sequence, digest: entry.digest });
    const stands = key !== null && message !== null && ed25519Verifies(bytesOf(key), new TextEncoder().encode(message), bytesOf(`0x${entry.signatureR.slice(2)}${entry.signatureS.slice(2)}`));
    entries.push({ sequence, kind, anchoredAt: Number(entry.anchoredAt), digest: entry.digest, stands });
  }
  return { key, entries };
}

/** What held at a moment: the latest entry that stands and was anchored by then. An entry that does not stand is nothing. */
export function heldAt(entries: readonly AnchoredEntry[], atSeconds: number): "yes" | "stop" | "nothing" {
  let held: "yes" | "stop" | "nothing" = "nothing";
  for (const entry of entries) {
    if (!entry.stands || entry.anchoredAt > atSeconds || entry.kind === "unknown") continue;
    held = entry.kind;
  }
  return held;
}

/** The readings a set of logs holds, for the two gift contracts. The block's own time is read for each. */
export async function readingsIn(client: PublicClient, contracts: VerifyContracts, logs: readonly Log[]): Promise<FoundReading[]> {
  const times = new Map<bigint, number>();
  const timeOf = async (blockNumber: bigint) => {
    if (!times.has(blockNumber)) times.set(blockNumber, Number((await client.getBlock({ blockNumber })).timestamp));
    return times.get(blockNumber)!;
  };
  const found: FoundReading[] = [];
  const from = (addresses: readonly (Hex | null)[]) => logs.filter((log) => addresses.some((address) => address !== null && log.address.toLowerCase() === address.toLowerCase()));
  // The second and third daily contracts write a day counted in the same event, so one ABI reads both.
  for (const log of parseEventLogs({ abi: giftEscrowV2Abi, eventName: "CheckInAccepted", logs: from(contracts.daily) as Log[] })) {
    const args = log.args as { giftId: bigint; recipient: Hex; creditedDays: number };
    found.push({ kind: "daily", giftId: args.giftId.toString(), recipient: args.recipient, txHash: log.transactionHash as Hex, at: await timeOf(log.blockNumber as bigint), days: Number(args.creditedDays), reached: false });
  }
  for (const log of parseEventLogs({ abi: milestoneGiftV2Abi, eventName: "MilestoneReached", logs: from([contracts.milestone]) as Log[] })) {
    const args = log.args as { giftId: bigint; recipient: Hex };
    found.push({ kind: "milestone", giftId: args.giftId.toString(), recipient: args.recipient, txHash: log.transactionHash as Hex, at: await timeOf(log.blockNumber as bigint), days: 0, reached: true });
  }
  return found;
}

/**
 * Every gift a contract opened by a link holds, newest first: its numbers run up from its first with no gap. The third
 * daily contract answers `nextGiftId` and `getGift` as the second does, so the second's ABI reads both.
 */
export async function giftsOf(client: PublicClient, kind: GiftKind, contract: Hex): Promise<{ giftId: string; recipient: Hex | null; counted: number }[]> {
  const abi = (kind === "daily" ? giftEscrowV2Abi : milestoneGiftV2Abi) as unknown as Abi;
  const next = (await client.readContract({ address: contract, abi, functionName: "nextGiftId" })) as bigint;
  const gifts: { giftId: string; recipient: Hex | null; counted: number }[] = [];
  for (let id = next - 1n; id > 0n; id -= 1n) {
    let gift: Record<string, unknown>;
    try {
      gift = (await client.readContract({ address: contract, abi, functionName: "getGift", args: [id] })) as Record<string, unknown>;
    } catch (error) {
      // Below the contract's first gift: the numbers under it belong to the contract it took over from. Only the
      // contract's own refusal says so: a node that did not answer is an error, never the end of the list.
      if (error instanceof BaseError && error.walk((cause) => cause instanceof ContractFunctionRevertedError)) break;
      throw error;
    }
    const recipient = String(gift.recipient).toLowerCase() === ZERO_ADDRESS ? null : (gift.recipient as Hex);
    // A daily gift counts its days; a milestone gift is reached once, and then holds its whole amount as earned.
    const counted = kind === "daily" ? Number(gift.creditedDays) : (gift.earned as bigint) > 0n ? 1 : 0;
    gifts.push({ giftId: id.toString(), recipient, counted });
  }
  return gifts;
}

/** One gift's verdict, from the readings found for it. */
export async function verdictOf(
  client: PublicClient,
  anchor: Hex,
  gift: { kind: GiftKind; giftId: string; recipient: Hex | null; counted: number },
  readings: readonly FoundReading[],
): Promise<GiftVerdict> {
  const mine = readings.filter((reading) => reading.kind === gift.kind && reading.giftId === gift.giftId);
  const problems: string[] = [];
  if (!gift.recipient) {
    if (mine.length > 0 || gift.counted > 0) problems.push("readings for a gift nobody opened");
    return { ...gift, key: null, entries: [], readings: mine.map((reading) => ({ ...reading, held: "nothing" })), found: 0, problems };
  }
  const { key, entries } = await anchoredFor(client, anchor, gift.recipient, gift.giftId);
  const verdicts = mine.map((reading) => ({ ...reading, held: heldAt(entries, reading.at) }));
  const found = mine.reduce((sum, reading) => sum + (gift.kind === "daily" ? reading.days : reading.reached ? 1 : 0), 0);
  for (const entry of entries) if (!entry.stands) problems.push(`entry ${entry.sequence} is not signed by the bound key`);
  for (const reading of verdicts) {
    if (reading.recipient.toLowerCase() !== gift.recipient.toLowerCase()) problems.push(`reading ${reading.txHash} names another recipient`);
    if (reading.held !== "yes") problems.push(`reading ${reading.txHash} was taken with ${reading.held === "stop" ? "a stop in force" : "no yes anchored before it"}`);
  }
  if (found !== gift.counted) problems.push(`the contract counts ${gift.counted} and the readings found add up to ${found}`);
  return { ...gift, key, entries, readings: verdicts, found, problems };
}

/** Every log of the two gift contracts over a range of blocks, asked in pieces the node accepts. */
export async function logsBetween(client: PublicClient, contracts: VerifyContracts, fromBlock: bigint, toBlock: bigint, piece = 100n, tell?: (done: bigint, of: bigint) => void): Promise<Log[]> {
  const address = [...contracts.daily, contracts.milestone].filter((one): one is Hex => one !== null);
  const logs: Log[] = [];
  if (address.length === 0) return logs;
  for (let start = fromBlock; start <= toBlock; start += piece) {
    const end = start + piece - 1n > toBlock ? toBlock : start + piece - 1n;
    logs.push(...(await client.getLogs({ address, fromBlock: start, toBlock: end })));
    tell?.(end - fromBlock + 1n, toBlock - fromBlock + 1n);
  }
  return logs;
}
