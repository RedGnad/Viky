import { parseEventLogs, TransactionReceiptNotFoundError, type Hex } from "viem";
import type { ContractAuthorization } from "./ausd-authorization";
import { ATTESTATION_TTL_SECONDS, signClaim, type GiftParams } from "./gift-attestation";
import { giftPublicClient, readGift } from "./gift-reader";
import { settledDaysFromLogs } from "./day-record";
import { recordRelayed, recordSettledDays, relayedForSession } from "./gift-store";
import { tellAboutDays } from "./morning-send";
import { liveTellingDeps } from "./morning-send-live";
import { loadAttestation } from "./proof-session-store";
import { tellOfARefusedBaseline } from "./reading-proportion";
import { newGiftsEscrow, escrowAddress, relay, RelayerError, relayerClients, type RelayResult } from "./relayer";
import { DAILY_ABIS, dailyAbiOf, dailyVersionOf, giftEscrowV2Address } from "./v2";
import { isStartSignedBy, NO_START_SIGNATURE, StartNotSigned } from "./v2-start";

/**
 * The relayed operations of a gift, one function per contract entry point. Each submits with the
 * relayer, waits for finality, decodes the event the screen needs and records the transaction hash
 * for the judges page. A check-in is relayed at most once per verification session.
 */

export type CreatedGift = Readonly<{ giftId: string; hash: Hex; blockNumber: bigint; escrow: Hex }>;

/**
 * New gifts are always created on the current contract; the record keeps which one.
 *
 * Terms that carry an opening key are the second version's (src/v2-protocol.ts): they go to the second version's
 * contract and nowhere else, and are refused while it is not set. Terms without one go to the first version's, and are
 * refused once the second is set: from then a gift the evidence signer could open is no longer made.
 */
export async function relayCreateGift(params: GiftParams, authorization: ContractAuthorization, onSubmitted?: (hash: Hex) => Promise<void>, openingKey?: Hex): Promise<CreatedGift> {
  const second = giftEscrowV2Address();
  if (openingKey && !second) throw new RelayerError("NOT_CONFIGURED", "The second version of the gift contract is not configured");
  if (!openingKey && second) throw new RelayerError("NOT_CONFIGURED", "This gift was prepared for an earlier version. Reload the page and try again.");
  const escrow = openingKey ? newGiftsEscrow() : escrowAddress();
  const terms = openingKey
    ? { funder: params.funder, refundTo: params.refundTo, openingKey, goalType: params.goalType, dailyTarget: params.dailyTarget, durationDays: params.durationDays, amount: params.amount, salt: params.salt }
    : params;
  const result = await relay("createGift", [terms, authorization], escrow, undefined, onSubmitted);
  const giftId = eventArg(result, "GiftCreated", "giftId", escrow);
  await recordRelayed({ giftId, kind: "create", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return { giftId, hash: result.hash, blockNumber: result.receipt.blockNumber, escrow };
}

/**
 * Opens a gift of the second version: the key of its link signed which account it opens for, in that person's browser
 * (src/v2-protocol.ts, `openTypedData`). The relayer carries the signature and adds nothing: the evidence signer is not
 * asked, and the contract compares the signature against the opening key the funder's terms carry.
 */
export async function relayOpen(input: { giftId: string; escrow: Hex; recipient: Hex; deadline: bigint; signature: Hex }): Promise<RelayResult> {
  const result = await relay("claim", [input.giftId, { recipient: input.recipient, deadline: input.deadline, signature: input.signature }], input.escrow);
  await recordRelayed({ giftId: input.giftId, kind: "claim", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

/**
 * Ends a gift of the second version, on the signed intent of the person it is for: what was counted stays theirs, the
 * rest goes back to the funder in this transaction, and the contract refuses if either amount is not the one signed.
 */
export async function relayEnd(input: { giftId: string; escrow: Hex; keep: bigint; giveBack: bigint; nonce: bigint; deadline: bigint; signature: Hex }): Promise<RelayResult> {
  const result = await relay("endGiftWithIntent", [input.giftId, { keep: input.keep, giveBack: input.giveBack, nonce: input.nonce, deadline: input.deadline, signature: input.signature }], input.escrow);
  await recordRelayed({ giftId: input.giftId, kind: "end", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  await recordEndedDays(input.giftId, input.escrow, result);
  return result;
}

/**
 * Writes the days an ending settled: those the contract said were already missed, from the receipt, and those it gave
 * back, which are the last days of the gift's window (a gift settles its days in order). A day given back is drawn as
 * a day that went back, never as a day still to come. Nobody is sent a message for them: the person ended the gift
 * themselves. As for every day record, a failed write is logged and never turns a final transaction into a failure.
 */
async function recordEndedDays(giftId: string, escrow: Hex, result: RelayResult): Promise<void> {
  try {
    const missed = settledDaysFromLogs(giftId, result.receipt.logs);
    const gift = await readGift(escrow, giftId);
    const givenBack = gift.startDay === 0 ? [] : Array.from({ length: gift.givenBackDays }, (_, index) => ({ day: gift.endDay - gift.givenBackDays + 1 + index, outcome: "returned" as const }));
    await recordSettledDays(giftId, [...missed, ...givenBack], result.hash);
  } catch (error) {
    console.error(`day record not written for the ending of gift ${giftId}, ${result.hash}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function relayClaim(input: { giftId: string; escrow: Hex; recipient: Hex; contactHash: Hex; nowSeconds?: number }): Promise<RelayResult> {
  // The first version only: there the evidence signer attests the opening. On the second it has no say (`relayOpen`).
  if (dailyVersionOf(input.escrow) === 2) throw new RelayerError("NOT_CONFIGURED", "This gift is opened with the key of its link");
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const message = {
    giftId: BigInt(input.giftId),
    recipient: input.recipient,
    contactHash: input.contactHash,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  const signature = await signClaim(message, input.escrow);
  const result = await relay("claim", [
    input.giftId,
    { recipient: message.recipient, contactHash: message.contactHash, issuedAt: message.issuedAt, expiresAt: message.expiresAt, signature },
  ], input.escrow);
  await recordRelayed({ giftId: input.giftId, kind: "claim", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

export type RelayedCheckIn = Readonly<{ hash: Hex; creditedDays: number; alreadyRelayed: boolean }>;

/** What the contract says of a gift's open days, and the last day whose catch-up window is over. */
export type OpenDays = Readonly<{
  startDay: number;
  endDay: number;
  settledThroughDay: number;
  cancelled: boolean;
  finalised: boolean;
  lastDrainableDay: number;
  /** Check-ins are paused on the gift's contract: nobody can be read, so nothing is drained (the audit of 1 Oct 2026). */
  paused?: boolean;
}>;

export type ExpiredDaysDeps = Readonly<{
  read: (giftId: string, escrow: Hex) => Promise<OpenDays>;
  drain: (giftId: string, escrow: Hex) => Promise<unknown>;
}>;

export function liveExpiredDaysDeps(): ExpiredDaysDeps {
  return {
    read: async (giftId, escrow) => {
      const [gift, lastDrainableDay, paused] = await Promise.all([
        readGift(escrow, giftId),
        giftPublicClient().readContract({ address: escrow, abi: dailyAbiOf(escrow), functionName: "lastDrainableDay" }) as Promise<number | bigint>,
        giftPublicClient().readContract({ address: escrow, abi: dailyAbiOf(escrow), functionName: "checkInPaused" }) as Promise<boolean>,
      ]);
      return { ...gift, lastDrainableDay: Number(lastDrainableDay), paused };
    },
    drain: relayDrain,
  };
}

/** Whether a gift still has an open day whose catch-up window is over: a day a reading must no longer pay. */
export function expiredDayOpen(days: OpenDays): boolean {
  if (days.startDay === 0 || days.cancelled || days.finalised) return false;
  // During a pause nobody can be read, and the check-in this drain would precede is refused by the contract anyway:
  // draining then would only take days nobody could have earned.
  if (days.paused) return false;
  return Math.min(days.lastDrainableDay, days.endDay) > days.settledThroughDay;
}

/**
 * Drains a gift's expired days before anything is signed or relayed for it (the audit, 29 Sep 2026). A day becomes
 * drainable at 06:00 UTC, two days after it began, and the settling pass drains at 07:00: in between, a check-in could
 * still pay a day that had already gone back. So every check-in is preceded by the drain, in the same passage, and a
 * drain that fails stops the check-in rather than letting it through. Answers whether it drained.
 */
export async function drainExpiredDays(giftId: string, escrow: Hex, deps: ExpiredDaysDeps = liveExpiredDaysDeps()): Promise<boolean> {
  if (!expiredDayOpen(await deps.read(giftId, escrow))) return false;
  try {
    await deps.drain(giftId, escrow);
    return true;
  } catch (error) {
    // Drained by someone else between the reading and this call: the days are settled, which is all that was needed.
    if (error instanceof RelayerError && error.code === "REVERTED" && error.contractError === "NothingToDrain") return false;
    throw error;
  }
}

/**
 * Submits the attestation recorded for a verified session. Idempotent per session.
 *
 * On the second version the first reading of a gift is sent only with the signature of the account the gift is for
 * (src/v2-start.ts): without one it is not sent at all, and `StartNotSigned` says what is to be signed. A signature
 * that is not theirs over this reading is refused here, before the relayer pays for a transaction the contract would
 * refuse. Every later reading goes as it always did.
 */
export async function relayCheckIn(sessionId: string, escrow: Hex, startSignature?: Hex): Promise<RelayedCheckIn> {
  const existing = await relayedForSession(sessionId);
  if (existing) return { hash: existing, creditedDays: 0, alreadyRelayed: true };
  const stored = await loadAttestation(sessionId);
  if (!stored) throw new RelayerError("NOT_CONFIGURED", "No verified attestation is recorded for this session");
  const m = stored.message;
  const giftId = String(m.giftId);
  let recipientSignature = NO_START_SIGNATURE;
  const second = dailyVersionOf(escrow) === 2 ? await readGift(escrow, giftId) : null;
  if (second && second.startDay === 0) {
    const start = { giftId: BigInt(giftId), identityHash: String(m.identityHash) as Hex, metricValue: BigInt(m.metricValue), observedAt: BigInt(m.observedAt) };
    if (!startSignature) throw new StartNotSigned("daily", escrow, start);
    if (!(await isStartSignedBy({ kind: "daily", contract: escrow, start, recipient: String(m.recipient), signature: startSignature }))) {
      throw new RelayerError("REVERTED", "The first reading is not signed by the account the gift is for", "InvalidRecipientSignature");
    }
    recipientSignature = startSignature;
  }
  // An expired day is drained first, so this check-in can only pay days still inside their window.
  await drainExpiredDays(giftId, escrow);
  const attestation = {
    recipient: String(m.recipient) as Hex,
    identityHash: String(m.identityHash) as Hex,
    providerId: String(m.providerId) as Hex,
    metricValue: BigInt(m.metricValue),
    observedAt: BigInt(m.observedAt),
    nullifier: String(m.nullifier) as Hex,
    issuedAt: BigInt(m.issuedAt),
    expiresAt: BigInt(m.expiresAt),
    signature: stored.signature,
    recipientSignature,
  };
  const result = await relay("checkIn", [giftId, attestation], escrow).catch(async (error: unknown) => {
    // A reading below the gift's baseline is the one trace a baseline set too high leaves (the review of 2 Oct 2026,
    // R-15): the operator is told, and the refusal goes on as it was.
    if (second && error instanceof RelayerError && error.contractError === "MetricDecreased") await tellOfARefusedBaseline(escrow, giftId, second.baselineValue, attestation.metricValue);
    throw error;
  });
  const credited = Number(eventArg(result, "CheckInAccepted", "creditedDays", escrow));
  await recordRelayed({ giftId, kind: "check-in", sessionId, txHash: result.hash, blockNumber: result.receipt.blockNumber });
  await recordDays(giftId, result, sessionId);
  return { hash: result.hash, creditedDays: credited, alreadyRelayed: false };
}

export async function relayWithdraw(input: {
  giftId: string;
  escrow: Hex;
  to: Hex;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  signature: Hex;
}): Promise<RelayResult> {
  const result = await relay("withdrawEarnedWithIntent", [
    input.giftId,
    { to: input.to, amount: input.amount, nonce: input.nonce, deadline: input.deadline, signature: input.signature },
  ], input.escrow);
  await recordRelayed({ giftId: input.giftId, kind: "withdraw", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

export async function relayDrain(giftId: string, escrow: Hex): Promise<RelayResult> {
  const result = await relay("drain", [giftId], escrow);
  await recordRelayed({ giftId, kind: "drain", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  await recordDays(giftId, result);
  return result;
}

export async function relayFinalise(giftId: string, escrow: Hex): Promise<RelayResult> {
  const result = await relay("finalise", [giftId], escrow);
  await recordRelayed({ giftId, kind: "finalise", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  await recordDays(giftId, result);
  return result;
}

/**
 * Writes the days a transaction settled, from its own receipt. The transaction is final by now and the money has
 * moved, so a failed write never turns it into a failure: it is logged, the day falls back to the counts on screen,
 * and `scripts/backfill-days.ts` writes it again from the recorded transaction.
 *
 * A check-in also writes which verification session credited those days, which is what lets anybody follow a day
 * earned back to the one claim that earned it (U2). A drain passes none: it read nothing.
 */
async function recordDays(giftId: string, result: RelayResult, sessionId?: string): Promise<void> {
  try {
    const written = await recordSettledDays(giftId, settledDaysFromLogs(giftId, result.receipt.logs), result.hash, sessionId);
    // The morning message goes from the record's own write and nowhere else, so a phone is told exactly what was
    // settled, once (N1). It cannot fail this: sending is caught inside.
    await tellAboutDays(giftId, written, liveTellingDeps());
  } catch (error) {
    console.error(`day record not written for gift ${giftId}, ${result.hash}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function relayRefund(giftId: string, escrow: Hex): Promise<RelayResult> {
  const result = await relay("refundUnearned", [giftId], escrow);
  await recordRelayed({ giftId, kind: "refund", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

/**
 * What a submitted creation came to, read back from the chain: the gift it made, a revert, or nothing yet. Used to
 * complete a creation whose record failed after its relay (D87).
 */
export async function createdGiftOf(txHash: Hex): Promise<{ kind: "made"; giftId: string; escrow: Hex; blockNumber: bigint } | { kind: "reverted" } | { kind: "absent" } | { kind: "unknown" }> {
  const client = relayerClients().publicClient;
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (error) {
    // The node holding no receipt is an answer about the transaction; the node not answering is not.
    return error instanceof TransactionReceiptNotFoundError ? { kind: "absent" } : { kind: "unknown" };
  }
  if (receipt.status !== "success") return { kind: "reverted" };
  // The creation's event has one shape per version: read with each, whichever contract the transaction went to.
  for (const abi of DAILY_ABIS) {
    const logs = parseEventLogs({ abi, logs: receipt.logs, eventName: "GiftCreated" });
    const first = logs[0] as { args?: Record<string, unknown>; address?: string } | undefined;
    if (first?.args?.giftId) return { kind: "made", giftId: String(first.args.giftId), escrow: String(first.address) as Hex, blockNumber: receipt.blockNumber };
  }
  return { kind: "reverted" };
}

function eventArg(result: RelayResult, eventName: string, argument: string, escrow: Hex): string {
  const logs = parseEventLogs({ abi: dailyAbiOf(escrow), logs: result.receipt.logs, eventName });
  const first = logs[0] as { args?: Record<string, unknown> } | undefined;
  const value = first?.args?.[argument];
  if (value === undefined) throw new RelayerError("NOT_FINALISED", `The ${eventName} event was not found in the receipt`);
  return String(value);
}
