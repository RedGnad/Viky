import { getAddress, type Hex } from "viem";
import { giftReadingLeave, NO_AGREEMENT } from "./consent-guard";
import { contractRefusal } from "./gift-api";
import { relayCheckIn } from "./gift-relay";
import { markBound } from "./gift-store";
import { dropHeldStart, holdStart, loadHeldStart, type HeldAfter, type HeldStart } from "./held-start-store";
import { milestoneRefusal } from "./milestone-api";
import { MILESTONE_ATTESTATION_TTL_SECONDS, type MilestoneProofMessage } from "./milestone-protocol";
import { relayProve } from "./milestone-relay";
import { recordReading, type MilestoneReading } from "./milestone-store";
import { RelayerError } from "./relayer";
import type { StartMessage, V2Kind } from "./v2-protocol";
import { isStartSignedBy, StartNotSigned } from "./v2-start";

/**
 * The first reading of a gift of the second version, between the server and the browser (the review of 2 Oct 2026,
 * R-15). Server only.
 *
 * The contract takes that reading only with the signature of the account the gift is for, over exactly what was read.
 * So it is made in two steps. The reading is taken and attested as it always was, and the relay refuses to send it
 * (`StartNotSigned`): it is held here, and the browser is answered what there is to sign. The browser signs it with
 * the person's own account and asks again with the signature; the held reading is sent with it, and what the
 * reading's own path would have written is written then. Nothing is read twice, and nothing the browser sends is
 * taken for the reading: the signature is checked against what is held, and the contract checks it again.
 *
 * When the signing session is open, the browser signs with no gesture of the person's. When it is not, their passkey
 * is asked for once, as for anything else their account signs.
 */

/** What a path answers in place of "bound" or "started": the first reading waits for this signature. */
export type StartAsked = Readonly<{
  kind: "sign";
  giftId: string;
  start: Readonly<{ of: V2Kind; contract: Hex; identityHash: Hex; metricValue: string; observedAt: string }>;
}>;

function asked(error: StartNotSigned): StartAsked {
  return {
    kind: "sign",
    giftId: error.start.giftId.toString(),
    start: { of: error.kind, contract: error.contract, identityHash: error.start.identityHash, metricValue: error.start.metricValue.toString(), observedAt: error.start.observedAt.toString() },
  };
}

/** How long before its end a reading that waits is still worth signing: a minute for the passkey and the relay. */
const HELD_MARGIN_SECONDS = 60;

/**
 * The first reading already held for a gift, when it can still be sent: what there is to sign, again. A person who
 * closed their passkey's sheet and pressed a second time used to pay for a second reading, with the first still
 * waiting (3 Oct 2026). A daily start is sent with the attestation as it was signed, which ends at its `expiresAt`; a
 * climb's is signed again as it is sent, and what ages is the observation itself.
 */
export async function heldStartStillGood(giftId: string, account: string, nowSeconds: number, load: typeof loadHeldStart = loadHeldStart): Promise<StartAsked | null> {
  const held = await load(giftId).catch(() => null);
  if (!held || held.account.toLowerCase() !== account.toLowerCase()) return null;
  const m = held.message;
  const goodUntil = held.kind === "daily" ? Number(m.expiresAt) : Number(m.observedAt) + MILESTONE_ATTESTATION_TTL_SECONDS;
  if (!(goodUntil > nowSeconds + HELD_MARGIN_SECONDS)) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(m.identityHash))) return null;
  return { kind: "sign", giftId, start: { of: held.kind, contract: held.contract, identityHash: String(m.identityHash) as Hex, metricValue: String(m.metricValue), observedAt: String(m.observedAt) } };
}

/** Holds a first reading the relay would not send unsigned, and answers what the recipient's account is to sign. */
export async function holdTheStart(
  error: StartNotSigned,
  held: Readonly<{ account: string; message: Record<string, string | number>; sessionId?: string; after: HeldAfter }>,
  hold: typeof holdStart = holdStart,
): Promise<StartAsked> {
  await hold({ giftId: error.start.giftId.toString(), account: held.account, kind: error.kind, contract: error.contract, message: held.message, sessionId: held.sessionId ?? null, after: held.after });
  return asked(error);
}

export type ResumedStart =
  | Readonly<{ kind: "bound"; giftId: string; xp: number; hash: Hex; unit?: string }>
  | Readonly<{ kind: "started"; giftId: string; rating: number; hash: Hex; aboveAccepted: boolean; deadline: number }>
  | Readonly<{ kind: "refused"; giftId: string; code: string; message: string }>;

export type ResumeDeps = Readonly<{
  load: (giftId: string) => Promise<HeldStart | null>;
  drop: (giftId: string) => Promise<void>;
  leave: (giftId: string) => Promise<{ allowed: boolean }>;
  checkIn: typeof relayCheckIn;
  prove: typeof relayProve;
  markBound: (giftId: string, profileId: string) => Promise<boolean>;
  record: (reading: MilestoneReading) => Promise<void>;
  now: () => number;
}>;

export function liveResumeDeps(): ResumeDeps {
  return { load: loadHeldStart, drop: dropHeldStart, leave: giftReadingLeave, checkIn: relayCheckIn, prove: relayProve, markBound, record: recordReading, now: () => Math.floor(Date.now() / 1_000) };
}

const refused = (giftId: string, code: string, message: string): ResumedStart => ({ kind: "refused", giftId, code, message });

/** Nothing is held, or what is held is too old to send: the reading is asked for again, which takes a moment. */
const START_AGAIN = "That reading is no longer waiting. Start again.";

function startOf(held: HeldStart): StartMessage {
  const m = held.message;
  return { giftId: BigInt(held.giftId), identityHash: String(m.identityHash) as Hex, metricValue: BigInt(m.metricValue), observedAt: BigInt(m.observedAt) };
}

/**
 * Sends the first reading held for a gift, with the signature the recipient's account made over it. Asked by that
 * account alone; a signature that is not theirs over what is held is refused before anything is paid for.
 */
export async function resumeHeldStart(input: { giftId: string; account: string; signature: Hex }, deps: ResumeDeps = liveResumeDeps()): Promise<ResumedStart> {
  const { giftId } = input;
  const held = await deps.load(giftId);
  if (!held || held.account.toLowerCase() !== input.account.toLowerCase()) return refused(giftId, "NOTHING_HELD", START_AGAIN);
  // A stop signed since the reading was taken holds here too (src/consent-guard.ts).
  if (!(await deps.leave(giftId)).allowed) return refused(giftId, NO_AGREEMENT.code, NO_AGREEMENT.message);
  const start = startOf(held);
  if (!(await isStartSignedBy({ kind: held.kind, contract: held.contract, start, recipient: held.account, signature: input.signature }))) {
    return refused(giftId, "NOT_SIGNED_BY_YOU", "That was not signed by this account. Try again.");
  }
  try {
    if (held.kind === "daily") {
      if (!held.sessionId) return refused(giftId, "NOTHING_HELD", START_AGAIN);
      const relayed = await deps.checkIn(held.sessionId, held.contract, input.signature);
      if (held.after.bindTo) await deps.markBound(giftId, held.after.bindTo);
      await deps.drop(giftId);
      return { kind: "bound", giftId, xp: held.after.xp ?? 0, hash: relayed.hash, ...(held.after.unit ? { unit: held.after.unit } : {}) };
    }
    const m = held.message;
    const now = deps.now();
    // The evidence signer signs it now, for now: what was read, its moment and its nullifier are the ones held.
    const message: MilestoneProofMessage = {
      giftId: BigInt(giftId),
      recipient: getAddress(String(m.recipient)),
      identityHash: String(m.identityHash) as Hex,
      providerId: String(m.providerId) as Hex,
      metricValue: BigInt(m.metricValue),
      eventAt: BigInt(m.eventAt),
      observedAt: BigInt(m.observedAt),
      nullifier: String(m.nullifier) as Hex,
      issuedAt: BigInt(now),
      expiresAt: BigInt(now + MILESTONE_ATTESTATION_TTL_SECONDS),
    };
    const proved = await deps.prove({ contract: held.contract, message, startSignature: input.signature });
    // Bound before anything else is written: the contract has started, and every later reading needs the player.
    if (proved.happened === "started" && held.after.bindTo) await deps.markBound(giftId, held.after.bindTo);
    if (held.after.reading) await deps.record({ ...(held.after.reading as unknown as MilestoneReading), outcome: proved.happened, txHash: proved.hash });
    await deps.drop(giftId);
    return {
      kind: "started",
      giftId,
      rating: Number(message.metricValue),
      hash: proved.hash,
      aboveAccepted: held.after.maximumStart !== undefined && message.metricValue > BigInt(held.after.maximumStart),
      deadline: proved.deadline ?? 0,
    };
  } catch (error) {
    if (error instanceof StartNotSigned) return refused(giftId, "NOT_SIGNED_BY_YOU", "That was not signed by this account. Try again.");
    if (error instanceof RelayerError && error.code === "REVERTED") {
      // Whatever the contract refused, what is held will not be sent again: the next press reads afresh.
      await deps.drop(giftId);
      const mapped = held.kind === "milestone" ? milestoneRefusal(error.contractError) : contractRefusal(error.contractError);
      return refused(giftId, mapped?.code ?? error.contractError ?? "REFUSED", mapped?.message ?? "The contract refused this reading.");
    }
    throw error;
  }
}
