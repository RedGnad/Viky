import { formatEther } from "viem";
import { contractsNamingAnotherKey, pinHolds, readEvidenceKeys, readExitPin, RELAYER_ALERT_BELOW, type EvidenceKeys, type ExitPin } from "./health";
import { lastPasses } from "./pass-log";
import { COUNTING_PASS_UTC } from "./pass-schedule";
import { sendAlert, type AlertOutcome } from "./provider-alert";

/**
 * What the operator is told without having to look (the audit of 1 Oct 2026). Four things could go wrong in silence
 * until a person met them: the relayer running out, the exchange moving away from where the exit router pinned it, the
 * evidence key of the environment no longer being the one the contracts name, and the morning pass not running at all.
 * Each is now one email through `sendAlert` (src/provider-alert.ts), sent when it is seen. A fifth since the delta
 * re-read of 2 Oct 2026: a new evidence signer announced on a contract of the second version, told while it waits.
 *
 * They are looked at when a nightly pass starts, and once more at 02:00 UTC by its own cron, which is also the only one
 * that can see a pass that never started. Nothing here may stop a pass: every read is caught, and what could not be
 * read is said in the report rather than thrown.
 */

export type Alert = Readonly<{ subject: string; text: string }>;

/** How the relayer stood when the pass asked: its balance, or the refusal that stopped the pass before it began. */
export type RelayerAtStart = Readonly<{ address: string; balance: bigint }> | Readonly<{ refused: string }>;

export type WatchDeps = Readonly<{
  exitPin: () => Promise<ExitPin>;
  evidenceKeys: () => Promise<EvidenceKeys>;
  lastCountingPass: () => Promise<Date | null>;
  alert: (alert: Alert) => Promise<AlertOutcome>;
  now?: () => number;
  log?: (line: string) => void;
}>;

export function liveWatchDeps(): WatchDeps {
  return {
    exitPin: readExitPin,
    evidenceKeys: () => readEvidenceKeys(),
    lastCountingPass: async () => (await lastPasses()).counting,
    alert: (alert) => sendAlert(alert),
  };
}

function mon(wei: bigint): string {
  return Number(formatEther(wei)).toFixed(2);
}

/** The relayer's alert, or none when it holds enough. A pass that could not start at all is always told. */
export function relayerAlert(relayer: RelayerAtStart, pass: string): Alert | null {
  if ("refused" in relayer) {
    return {
      subject: `The ${pass} pass did not start`,
      text: [`The relayer refused before the ${pass} pass did anything: ${relayer.refused}`, "", `Nothing was counted, settled or sent back by this run. Once it is put right, run the pass by hand: ${pass === "settling" ? "pnpm keeper --settle" : "pnpm keeper"}`].join("\n"),
    };
  }
  if (relayer.balance >= RELAYER_ALERT_BELOW) return null;
  return {
    subject: `Relayer under ${mon(RELAYER_ALERT_BELOW)} MON: ${mon(relayer.balance)} MON left`,
    text: [
      `The relayer ${relayer.address} holds ${mon(relayer.balance)} MON at the start of the ${pass} pass.`,
      "Under 12 MON it refuses every relay: no day is counted, nothing is settled, and nobody can take money out.",
    ].join("\n"),
  };
}

/** The pin's alert, or none while the exchange points where the exit router was told it must. */
export function pinAlert(pin: ExitPin): Alert | null {
  if (pinHolds(pin)) return null;
  return {
    subject: "The exchange no longer points where the exit router pinned it",
    text: [
      `The exit router pinned ${pin.pinned} for the exchange, and the exchange now answers ${pin.pointsAt}.`,
      "Every way out is refused by the router (ExchangeMoved) until its owner allows the exchange again with the new target, after reading what the new target is.",
    ].join("\n"),
  };
}

/** The evidence key's alert, or none while every contract names the key this environment signs with. */
export function evidenceKeyAlert(keys: EvidenceKeys): Alert | null {
  const others = contractsNamingAnotherKey(keys);
  if (others.length === 0) return null;
  return {
    subject: "The evidence key of this environment is not the one the contracts name",
    text: [
      `This environment signs evidence as ${keys.ours}.`,
      ...keys.named.filter((entry) => others.includes(entry.contract)).map((entry) => `${entry.contract} names ${entry.signer}.`),
      "Every proof this server attests is refused by those contracts until the key or the signer is put right. Check before a deployment: pnpm check:signer",
    ].join("\n"),
  };
}

/**
 * The alert of a new evidence signer announced on a contract of the second version, or none while nothing waits. A
 * signer is announced in public and stands a day later, and from then anybody may apply it: that day protects only if
 * somebody is told. It is said every time the watch runs, for as long as the announcement waits, whoever made it and
 * whichever key it names: the owner calls it off, or applies it.
 */
export function announcedSignerAlert(keys: EvidenceKeys): Alert | null {
  const waiting = keys.named.filter((entry) => entry.announced);
  if (waiting.length === 0) return null;
  return {
    subject: "A new evidence signer is announced on a gift contract",
    text: [
      ...waiting.map((entry) => `${entry.contract} has ${entry.announced?.signer} announced as its evidence signer. Anybody may make it stand from ${new Date((entry.announced?.readyAt ?? 0) * 1_000).toISOString()}. Its signer today is ${entry.signer}.`),
      `This environment signs evidence as ${keys.ours}.`,
      "If the Safe did not announce it on purpose, call it off before that moment: ACTION=evidence-signer VALUE=0x0000000000000000000000000000000000000000 pnpm safe:action, with TARGET=escrow-v2 or milestone-v2. A signer that stands can attest progress that never happened on every open gift of that contract.",
    ].join("\n"),
  };
}

/** The first second of the UTC day `nowMs` falls in. */
function startOfUtcDay(nowMs: number): number {
  return Math.floor(nowMs / 86_400_000) * 86_400_000;
}

/** The absent pass's alert, or none when a counting pass began since midnight UTC. */
export function absentPassAlert(last: Date | null, nowMs: number): Alert | null {
  if (last && last.getTime() >= startOfUtcDay(nowMs)) return null;
  const scheduled = `${String(COUNTING_PASS_UTC.hour).padStart(2, "0")}:${String(COUNTING_PASS_UTC.minute).padStart(2, "0")}`;
  return {
    subject: "The morning pass has not run today",
    text: [
      `No counting pass is in the journal since midnight UTC. It is scheduled at ${scheduled} UTC. ${last ? `The last one began at ${last.toISOString()}.` : "The journal holds none at all."}`,
      "Yesterday's days are not credited until it runs. Run it by hand: pnpm keeper",
    ].join("\n"),
  };
}

/** One line of what the watch did: what it looked at, and what came of it. */
export type WatchLine = Readonly<{ watched: string; result: "holds" | "not read" | `alert ${AlertOutcome}` }>;

async function look(watched: string, deps: WatchDeps, read: () => Promise<Alert | null>): Promise<WatchLine> {
  const log = deps.log ?? ((line: string) => console.error(line));
  try {
    const alert = await read();
    if (!alert) return { watched, result: "holds" };
    log(`watch: ${alert.subject}`);
    return { watched, result: `alert ${await deps.alert(alert)}` };
  } catch (error) {
    log(`watch: ${watched} could not be read: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
    return { watched, result: "not read" };
  }
}

/** The pin, the evidence key and a signer that waits to replace it, looked at whenever the watch runs. */
function standing(deps: WatchDeps): Promise<WatchLine>[] {
  // Read once for the two things that are said of it. A read that failed is told by each of them as "not read".
  const keys = deps.evidenceKeys();
  keys.catch(() => undefined);
  return [
    look("exit pin", deps, async () => pinAlert(await deps.exitPin())),
    look("evidence key", deps, async () => evidenceKeyAlert(await keys)),
    look("announced signer", deps, async () => announcedSignerAlert(await keys)),
  ];
}

/** What is looked at when a nightly pass starts: the relayer as the pass found it, the pin, the evidence key. */
export async function watchAtPassStart(relayer: RelayerAtStart, pass: string, deps: WatchDeps = liveWatchDeps()): Promise<WatchLine[]> {
  return Promise.all([look("relayer", deps, async () => relayerAlert(relayer, pass)), ...standing(deps)]);
}

/** What is looked at by the watch's own cron: whether the morning pass ran, then the pin and the evidence key. */
export async function watchAfterMorning(deps: WatchDeps = liveWatchDeps()): Promise<WatchLine[]> {
  const now = deps.now ? deps.now() : Date.now();
  return Promise.all([look("morning pass", deps, async () => absentPassAlert(await deps.lastCountingPass(), now)), ...standing(deps)]);
}

/**
 * One email that says only that alerts leave, asked for by hand (`/api/cron/watch?test=1`, behind the cron's secret).
 * It is how the operator learns that the deployed environment can reach them before the day something is wrong: the
 * answer is what Resend said, "not configured" when the deployment holds no key.
 */
export function testAlert(deps: Pick<WatchDeps, "alert" | "now"> = liveWatchDeps()): Promise<AlertOutcome> {
  const at = new Date(deps.now ? deps.now() : Date.now()).toISOString();
  return deps.alert({ subject: "Test alert from Viky", text: `Asked for by hand at ${at}. Nothing is wrong: this only shows that Viky's alerts reach you.` });
}
