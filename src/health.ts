import { neon } from "@neondatabase/serverless";
import { formatEther, parseEther, type Hex } from "viem";
import { cycleUse, limitsOf, type CycleUse } from "./attested-calls";
import { workerFingerprint } from "./attested-read";
import { databaseUrl } from "./database-guard";
import { exitExchangeAddress, exitRouterAddress } from "./exit-relay";
import { exitRouterAbi } from "./exit-router-abi";
import { lastGuardedPass } from "./frequent-pass";
import { evidenceSignerAddress } from "./gift-attestation";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { giftEscrowV2Abi } from "./gift-escrow-v2-abi";
import { createMonadPublicClient } from "./monad/chain";
import { lastPasses } from "./pass-log";
import { READING_FINGERPRINT } from "./reading-fingerprint";
import { relayerClients, RELAYER_MIN_BALANCE } from "./relayer";
import { giftEscrowV2Address, giftEscrowV3Address, milestoneGiftV2Address } from "./v2";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW, MILESTONE_GIFT } from "./viky-contracts";

/**
 * Whether the things a gift depends on are standing (the audit of 1 Oct 2026): the database, the network, the worker
 * that reads the sources, the relayer's balance, the exchange's pin, the evidence key, and the passes. It is what
 * `/api/health` answers, and what the alerts of src/watch.ts read. Since 3 Oct 2026 it also counts what the month has
 * used of Reclaim's allowance (src/attested-calls.ts), which Reclaim's own dashboard does not show for the fetches.
 *
 * It carries no secret and nothing of any gift: a balance, a block number, the times of the last passes, and for
 * everything else whether it holds, in one of five fixed words. The reason a check failed is written to the logs and
 * never answered, because an error's own message can name a host or a key.
 */

/** The relayer balance under which the operator is told, well above the balance under which it stops (12 MON). */
export const RELAYER_ALERT_BELOW = parseEther("25");

/** The exchange's forwarder: `getRouter()` is where it sends an order, which is what the exit router pinned. */
const FORWARDER_ABI = [{ type: "function", name: "getRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

/**
 * How old the last run of a pass may be before it counts as missing. The two nightly passes run once a day, inside the
 * hour their schedule names (src/pass-log.ts), so two runs are at most twenty-five hours apart. The milestones' pass is
 * called every five minutes from outside (src/frequent-pass.ts): twenty minutes is four calls in a row lost.
 */
export const PASS_LATE_AFTER_SECONDS = { counting: 26 * 3_600, settling: 26 * 3_600, milestones: 20 * 60 } as const;

export type PassKind = keyof typeof PASS_LATE_AFTER_SECONDS;

/** Why a check does not hold, in a fixed word. */
export type HealthFault = "unreachable" | "differs" | "low" | "late" | "never ran";

export type Health = Readonly<{
  ok: boolean;
  at: string;
  database: { ok: boolean; fault?: HealthFault };
  rpc: { ok: boolean; fault?: HealthFault; block?: string };
  worker: { ok: boolean; fault?: HealthFault };
  relayer: { ok: boolean; fault?: HealthFault; mon?: string; underAlert?: boolean };
  exitPin: { ok: boolean; fault?: HealthFault };
  evidenceKey: { ok: boolean; fault?: HealthFault };
  passes: { ok: boolean } & Record<PassKind, { ok: boolean; fault?: HealthFault; last: string | null }>;
  /**
   * The cycle's use of Reclaim's allowance. `ok` says the count could be read, and nothing else: a limit reached is
   * said by `over`, by an email (src/watch.ts) and on each gift's page, and a monitor that turned red until the next
   * cycle would say nothing more.
   */
  reclaim: { ok: boolean; fault?: HealthFault; over?: boolean } & Partial<CycleUse>;
}>;

export type ExitPin = Readonly<{ pinned: Hex; pointsAt: Hex }>;
/** A new evidence signer announced on a contract of the second version, and the moment from which anybody may make it stand. */
export type AnnouncedSigner = Readonly<{ signer: Hex; readyAt: number }>;
export type EvidenceKeys = Readonly<{ ours: Hex; named: readonly Readonly<{ contract: Hex; signer: Hex; announced?: AnnouncedSigner }>[] }>;

export type HealthDeps = Readonly<{
  database: () => Promise<unknown>;
  block: () => Promise<bigint>;
  workerFingerprint: () => Promise<string | undefined>;
  relayerBalance: () => Promise<bigint>;
  exitPin: () => Promise<ExitPin>;
  evidenceKeys: () => Promise<EvidenceKeys>;
  lastPasses: () => Promise<Record<PassKind, Date | null>>;
  reclaimUse: (nowMs: number) => Promise<CycleUse>;
  now?: () => number;
  log?: (line: string) => void;
}>;

/** How long one check may take. A monitor that waits a minute for an answer learns nothing it can act on. */
export const HEALTH_CHECK_TIMEOUT_MS = 8_000;

function within<T>(work: Promise<T>, ms: number = HEALTH_CHECK_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Whether the exchange still sends orders where the exit router was told it must. */
export function pinHolds(pin: ExitPin): boolean {
  return same(pin.pinned, pin.pointsAt);
}

/** The contracts whose evidence signer is not the key this environment signs with. None is what is wanted. */
export function contractsNamingAnotherKey(keys: EvidenceKeys): readonly Hex[] {
  return keys.named.filter((entry) => !same(entry.signer, keys.ours)).map((entry) => entry.contract);
}

export async function readHealth(deps: HealthDeps = liveHealthDeps()): Promise<Health> {
  const now = deps.now ? deps.now() : Date.now();
  const log = deps.log ?? ((line: string) => console.error(line));
  /** One check: its answer, or the fixed word for not having one. The real reason goes to the logs only. */
  const check = async <T extends { ok: boolean }>(name: string, work: () => Promise<T>): Promise<T | { ok: false; fault: HealthFault }> => {
    try {
      return await within(work());
    } catch (error) {
      log(`health: ${name} could not be read: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
      return { ok: false, fault: "unreachable" };
    }
  };

  const [database, rpc, worker, relayer, exitPin, evidenceKey, passes, reclaim] = await Promise.all([
    check("database", async () => {
      await deps.database();
      return { ok: true };
    }),
    check("rpc", async () => ({ ok: true, block: (await deps.block()).toString() })),
    check("worker", async () => {
      const theirs = await deps.workerFingerprint();
      return theirs === READING_FINGERPRINT ? { ok: true } : { ok: false, fault: "differs" as const };
    }),
    check("relayer", async () => {
      const balance = await deps.relayerBalance();
      const mon = Number(formatEther(balance)).toFixed(2);
      // Under its own floor the relayer refuses every relay (src/relayer.ts): that is a failure. Under the alert line it
      // still works, and the operator has been told (src/watch.ts): that is said, and it is not a failure.
      if (balance < RELAYER_MIN_BALANCE) return { ok: false, fault: "low" as const, mon };
      return { ok: true, mon, underAlert: balance < RELAYER_ALERT_BELOW };
    }),
    check("exit pin", async () => (pinHolds(await deps.exitPin()) ? { ok: true } : { ok: false, fault: "differs" as const })),
    check("evidence key", async () => (contractsNamingAnotherKey(await deps.evidenceKeys()).length === 0 ? { ok: true } : { ok: false, fault: "differs" as const })),
    check("passes", async () => {
      const last = await deps.lastPasses();
      const one = (kind: PassKind): { ok: boolean; fault?: HealthFault; last: string | null } => {
        const at = last[kind];
        if (!at) return { ok: false, fault: "never ran", last: null };
        const late = now - at.getTime() > PASS_LATE_AFTER_SECONDS[kind] * 1_000;
        return late ? { ok: false, fault: "late", last: at.toISOString() } : { ok: true, last: at.toISOString() };
      };
      const each = { counting: one("counting"), settling: one("settling"), milestones: one("milestones") };
      return { ok: each.counting.ok && each.settling.ok && each.milestones.ok, ...each };
    }),
    check("reclaim", async () => {
      const use = await deps.reclaimUse(now);
      const limits = limitsOf(use);
      return { ok: true, over: limits.readings || limits.proofs, ...use };
    }),
  ]);

  const unread = { ok: false, fault: "unreachable" as const, last: null };
  const allPasses = "counting" in passes ? passes : { ok: false, counting: unread, settling: unread, milestones: unread };
  // The count of Reclaim's allowance is told and is no part of whether Viky stands: a gift does not depend on it.
  const ok = database.ok && rpc.ok && worker.ok && relayer.ok && exitPin.ok && evidenceKey.ok && allPasses.ok;
  return { ok, at: new Date(now).toISOString(), database, rpc, worker, relayer, exitPin, evidenceKey, passes: allPasses, reclaim };
}

/** The exchange's pin, read from the two contracts themselves. */
export async function readExitPin(): Promise<ExitPin> {
  const client = createMonadPublicClient();
  const exchange = exitExchangeAddress();
  const [pinned, pointsAt] = await Promise.all([
    client.readContract({ address: exitRouterAddress(), abi: exitRouterAbi, functionName: "mustPointAt", args: [exchange] }) as Promise<Hex>,
    client.readContract({ address: exchange, abi: FORWARDER_ABI, functionName: "getRouter" }) as Promise<Hex>,
  ]);
  return { pinned, pointsAt };
}

/** The key this environment signs evidence with, and the signer each contract that takes evidence names on chain. */
export async function readEvidenceKeys(ours: Hex = evidenceSignerAddress()): Promise<EvidenceKeys> {
  const client = createMonadPublicClient();
  // The second version's two contracts take evidence too, once they are set, and so does the third daily contract,
  // which announces a new signer the same way (src/v2.ts).
  const second = [giftEscrowV2Address(), milestoneGiftV2Address(), giftEscrowV3Address()].filter((address): address is Hex => address !== null);
  const named = await Promise.all(
    [GIFT_ESCROW, EARLIER_GIFT_ESCROW, MILESTONE_GIFT, ...second].map(async (contract) => {
      // Every one of them exposes the same view; the daily contract's ABI reads it on each.
      const signer = (await client.readContract({ address: contract, abi: giftEscrowAbi, functionName: "evidenceSigner" })) as Hex;
      if (!second.includes(contract)) return { contract, signer };
      // On the second version a new signer is announced and stands a day later: what waits is read too, so the day is
      // one somebody is told of (the delta re-read of 2 Oct 2026). Both contracts expose the same two views.
      const [waiting, readyAt] = await Promise.all([
        client.readContract({ address: contract, abi: giftEscrowV2Abi, functionName: "pendingEvidenceSigner" }) as Promise<Hex>,
        client.readContract({ address: contract, abi: giftEscrowV2Abi, functionName: "evidenceSignerReadyAt" }) as Promise<bigint | number>,
      ]);
      return /^0x0{40}$/.test(waiting) ? { contract, signer } : { contract, signer, announced: { signer: waiting, readyAt: Number(readyAt) } };
    }),
  );
  return { ours, named };
}

export function liveHealthDeps(): HealthDeps {
  return {
    database: async () => {
      await neon(databaseUrl())`SELECT 1`;
    },
    block: () => createMonadPublicClient().getBlockNumber(),
    workerFingerprint: () => {
      const base = process.env.ZKFETCH_WORKER_URL?.trim().replace(/\/$/, "");
      if (!base) throw new Error("ZKFETCH_WORKER_URL is not configured");
      return workerFingerprint(base, HEALTH_CHECK_TIMEOUT_MS);
    },
    relayerBalance: () => {
      const clients = relayerClients();
      return clients.publicClient.getBalance({ address: clients.address });
    },
    exitPin: readExitPin,
    evidenceKeys: () => readEvidenceKeys(),
    lastPasses: async () => {
      const [nightly, milestones] = await Promise.all([lastPasses(), lastGuardedPass("milestones")]);
      return { ...nightly, milestones };
    },
    reclaimUse: (nowMs) => cycleUse(nowMs),
  };
}
