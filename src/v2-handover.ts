import type { Hex } from "viem";
import { PAUSE_REST_SECONDS } from "./v2-protocol";

/**
 * What the hand-over of the second version's three contracts must read before the app is told where they are (the
 * review of 2 Oct 2026, R-05, and its delta re-read). No key, no network: `scripts/check-v2-handover.ts` reads the
 * chain and asks this.
 *
 * Between the end of the deployment and the Safe's acceptance the deploying key still owns the three. Whatever it can
 * do in that time and that the acceptance does not undo is read here:
 *   - the owner is the Safe, and the ownership is offered to nobody else;
 *   - no evidence signer waits, and the one in place is the one named (an announcement is called off by the acceptance,
 *     one applied before it is not);
 *   - **no pause of readings was sent.** A pause cannot be sent again while it runs nor for seven days after it ended,
 *     so one sent before the hand-over, even for a second, leaves the Safe without its brake for a week;
 *   - **the anchor names the relayer.** The relayer's address is the one thing the deployment takes on somebody's
 *     word: with another one there, no agreement is ever written down, and nothing else fails;
 *   - creation is open on the new contract and closed on every contract it replaces, and the numbering did not start
 *     behind theirs: a gift made on a replaced contract now would take a number the new one gives out too;
 *   - **every goal is the register's, and there is no other.** On the second version a goal is added and never
 *     changed, so a line the deploying key wrote before the acceptance is there for good. All 255 numbers are read on
 *     both contracts, with their shape on the milestone contract: a rating registered in the shape of a certificate
 *     would pay a whole gift on a single reading (the reviewer's delta re-read of 2 Oct 2026).
 */

/** The numbers a goal can take: one to 255. Zero is refused by the contracts themselves. */
export const GOAL_NUMBERS = 255;

/** What a contract holds for each goal number, one to 255 in order: its provider, and on the milestone contract its shape. */
export type GoalsHeld = Readonly<{ providers: readonly Hex[]; shapes?: readonly number[] }>;

/** A goal the deployment registers: `DAILY_GOALS` (src/daily-goals.ts) and `MILESTONE_GOALS` (src/milestone-goals.ts). */
export type GoalExpected = Readonly<{ goalType: number; providerId: Hex; shape?: number }>;

const NO_PROVIDER = /^0x0{64}$/;
const shapeInWords = (shape: number | undefined) => (shape === 0 ? "a climb" : shape === 1 ? "having it or not" : `shape ${shape}`);

/**
 * Every goal number whose line is not the register's: one registered that the register does not hold, one whose
 * provider or shape differs, and one of the register that is missing. Only the last can still be put right.
 */
export function goalProblems(name: string, held: GoalsHeld, expected: readonly GoalExpected[]): string[] {
  if (held.providers.length !== GOAL_NUMBERS || (held.shapes && held.shapes.length !== GOAL_NUMBERS)) return [`${name}: its ${GOAL_NUMBERS} goal numbers were not all read`];
  const FOR_GOOD = "A goal is added and never changed: this contract cannot be put right. Set nothing, and deploy again";
  const problems: string[] = [];
  for (let goalType = 1; goalType <= GOAL_NUMBERS; goalType += 1) {
    const provider = held.providers[goalType - 1];
    const shape = held.shapes?.[goalType - 1];
    const wanted = expected.find((goal) => goal.goalType === goalType);
    const registered = !NO_PROVIDER.test(provider);
    if (!wanted) {
      if (registered) problems.push(`${name}: goal ${goalType} is registered (${provider}${held.shapes ? `, ${shapeInWords(shape)}` : ""}) and the register holds no goal ${goalType}. ${FOR_GOOD}`);
      continue;
    }
    if (!registered) {
      problems.push(`${name}: goal ${goalType} of the register is not registered. The owner can still add it, with the register's own provider${held.shapes ? " and shape" : ""}`);
      continue;
    }
    if (provider.toLowerCase() !== wanted.providerId.toLowerCase()) problems.push(`${name}: goal ${goalType} is registered with the provider ${provider}, and the register says ${wanted.providerId}. ${FOR_GOOD}`);
    if (held.shapes && shape !== wanted.shape) {
      problems.push(`${name}: goal ${goalType} is registered as ${shapeInWords(shape)}, and the register says ${shapeInWords(wanted.shape)}${shape === 1 ? ": it would pay a whole gift on a single reading" : ""}. ${FOR_GOOD}`);
    }
  }
  return problems;
}

export type ReplacedContract = Readonly<{ name: string; address: Hex; nextGiftId: bigint; creationPaused: boolean }>;

export type GiftContractRead = Readonly<{
  name: string;
  /** The Safe tool's own name for it: `escrow-v2` or `milestone-v2`. */
  target: string;
  /** The Safe tool's action that pauses its readings: `checkin-paused` or `proof-paused`. */
  pauseAction: string;
  address: Hex;
  owner: Hex;
  pendingOwner: Hex;
  evidenceSigner: Hex;
  pendingEvidenceSigner: Hex;
  /** When its last pause of readings ends or ended, in seconds; zero when none was ever sent. */
  pausedUntil: bigint;
  creationPaused: boolean;
  nextGiftId: bigint;
  replaces: readonly ReplacedContract[];
  /** What it holds for each of the 255 goal numbers, and what the deployment was to register. */
  goals: GoalsHeld;
  register: readonly GoalExpected[];
}>;

export type AnchorRead = Readonly<{ name: string; address: Hex; owner: Hex; pendingOwner: Hex; anchorer: Hex }>;

export type HandoverExpected = Readonly<{ owner: Hex; signer: Hex; relayer: Hex; nowSeconds: number }>;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const nobody = (address: string) => /^0x0{40}$/.test(address);
const moment = (seconds: bigint | number) => new Date(Number(seconds) * 1_000).toISOString();

function ownership(contract: Readonly<{ name: string; owner: Hex; pendingOwner: Hex }>, expected: HandoverExpected): string[] {
  const problems: string[] = [];
  if (!same(contract.owner, expected.owner)) problems.push(`${contract.name}: its owner is ${contract.owner}, not the Safe ${expected.owner}. The Safe has not accepted it yet`);
  if (!nobody(contract.pendingOwner)) problems.push(`${contract.name}: its ownership is still offered to ${contract.pendingOwner}`);
  return problems;
}

/**
 * Everything that must be put right before the three settings are set, and what is worth knowing without being wrong.
 * No problem is what is wanted.
 */
export function handoverProblems(expected: HandoverExpected, gifts: readonly GiftContractRead[], anchor: AnchorRead): Readonly<{ problems: string[]; notes: string[] }> {
  const problems: string[] = [];
  const notes: string[] = [];
  for (const contract of gifts) {
    problems.push(...ownership(contract, expected));
    if (!nobody(contract.pendingEvidenceSigner)) problems.push(`${contract.name}: an evidence signer is waiting, ${contract.pendingEvidenceSigner}. Nobody announced one on purpose: call it off from the Safe before anything else`);
    if (!same(contract.evidenceSigner, expected.signer)) problems.push(`${contract.name}: its evidence signer is ${contract.evidenceSigner}, not ${expected.signer}`);
    if (contract.pausedUntil > 0n) {
      const brakeBack = contract.pausedUntil + BigInt(PAUSE_REST_SECONDS);
      const running = BigInt(expected.nowSeconds) < contract.pausedUntil;
      if (BigInt(expected.nowSeconds) <= brakeBack) {
        problems.push(
          `${contract.name}: a pause of its readings was sent, which nobody sends on a new contract on purpose. It ${running ? "runs until" : "ended at"} ${moment(contract.pausedUntil)}, and the Safe cannot pause this contract before ${moment(brakeBack + 1n)}: it would hold gifts with no brake until then${running ? ` (the Safe can end the pause: ACTION=${contract.pauseAction} PAUSED=false TARGET=${contract.target})` : ""}. Wait until then, or deploy again`,
        );
      } else {
        notes.push(`${contract.name}: a pause of its readings was sent and ended at ${moment(contract.pausedUntil)}. Its rest is over: the Safe can pause it again`);
      }
    }
    if (contract.creationPaused) problems.push(`${contract.name}: creation is closed on it, and the deployment had opened it. The Safe opens it: ACTION=creation-paused PAUSED=false TARGET=${contract.target}`);
    for (const replaced of contract.replaces) {
      if (!replaced.creationPaused) problems.push(`${contract.name}: creation is open on ${replaced.name} ${replaced.address}, which it replaces. A gift made there takes a number this contract gives out too: the Safe closes it first`);
    }
    const first = contract.replaces.reduce((highest, replaced) => (replaced.nextGiftId > highest ? replaced.nextGiftId : highest), 0n);
    if (contract.nextGiftId < first) problems.push(`${contract.name}: its next gift is ${contract.nextGiftId}, behind ${first} on the contract it replaces: two gifts would carry one number`);
    if (contract.nextGiftId > first) notes.push(`${contract.name}: ${contract.nextGiftId - first} gift(s) were already made on it, by somebody speaking to the contract itself. The app holds no record of them`);
    problems.push(...goalProblems(contract.name, contract.goals, contract.register));
  }
  problems.push(...ownership(anchor, expected));
  if (!same(anchor.anchorer, expected.relayer)) problems.push(`${anchor.name}: its anchorer is ${anchor.anchorer}, not the relayer ${expected.relayer}. No agreement would ever be written down, and nothing else would fail. The Safe names the relayer: ACTION=anchorer VALUE=${expected.relayer} TARGET=anchor`);
  return { problems, notes };
}
