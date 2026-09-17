import { parseEventLogs, type Abi, type Hex } from "viem";
import type { ContractAuthorization } from "./ausd-authorization";
import { ATTESTATION_TTL_SECONDS, signClaim, type GiftParams } from "./gift-attestation";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { settledDaysFromLogs } from "./day-record";
import { recordRelayed, recordSettledDays, relayedForSession } from "./gift-store";
import { loadAttestation } from "./proof-session-store";
import { escrowAddress, relay, RelayerError, type RelayResult } from "./relayer";

/**
 * The relayed operations of a gift, one function per contract entry point. Each submits with the
 * relayer, waits for finality, decodes the event the screen needs and records the transaction hash
 * for the judges page. A check-in is relayed at most once per verification session.
 */

const abi = giftEscrowAbi as unknown as Abi;

export type CreatedGift = Readonly<{ giftId: string; hash: Hex; blockNumber: bigint; escrow: Hex }>;

/** New gifts are always created on the current contract; the record keeps which one. */
export async function relayCreateGift(params: GiftParams, authorization: ContractAuthorization): Promise<CreatedGift> {
  const escrow = escrowAddress();
  const result = await relay("createGift", [params, authorization], escrow);
  const giftId = eventArg(result, "GiftCreated", "giftId");
  await recordRelayed({ giftId, kind: "create", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return { giftId, hash: result.hash, blockNumber: result.receipt.blockNumber, escrow };
}

export async function relayClaim(input: { giftId: string; escrow: Hex; recipient: Hex; contactHash: Hex; nowSeconds?: number }): Promise<RelayResult> {
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

/** Submits the attestation recorded for a verified session. Idempotent per session. */
export async function relayCheckIn(sessionId: string, escrow: Hex): Promise<RelayedCheckIn> {
  const existing = await relayedForSession(sessionId);
  if (existing) return { hash: existing, creditedDays: 0, alreadyRelayed: true };
  const stored = await loadAttestation(sessionId);
  if (!stored) throw new RelayerError("NOT_CONFIGURED", "No verified attestation is recorded for this session");
  const m = stored.message;
  const giftId = String(m.giftId);
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
  };
  const result = await relay("checkIn", [giftId, attestation], escrow);
  const credited = Number(eventArg(result, "CheckInAccepted", "creditedDays"));
  await recordRelayed({ giftId, kind: "check-in", sessionId, txHash: result.hash, blockNumber: result.receipt.blockNumber });
  await recordDays(giftId, result);
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
 */
async function recordDays(giftId: string, result: RelayResult): Promise<void> {
  try {
    await recordSettledDays(giftId, settledDaysFromLogs(giftId, result.receipt.logs), result.hash);
  } catch (error) {
    console.error(`day record not written for gift ${giftId}, ${result.hash}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function relayRefund(giftId: string, escrow: Hex): Promise<RelayResult> {
  const result = await relay("refundUnearned", [giftId], escrow);
  await recordRelayed({ giftId, kind: "refund", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

function eventArg(result: RelayResult, eventName: string, argument: string): string {
  const logs = parseEventLogs({ abi, logs: result.receipt.logs, eventName });
  const first = logs[0] as { args?: Record<string, unknown> } | undefined;
  const value = first?.args?.[argument];
  if (value === undefined) throw new RelayerError("NOT_FINALISED", `The ${eventName} event was not found in the receipt`);
  return String(value);
}
