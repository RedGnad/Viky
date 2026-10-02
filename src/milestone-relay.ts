import { getAddress, parseEventLogs, TransactionReceiptNotFoundError, type Hex } from "viem";
import type { ContractAuthorization } from "./ausd-authorization";
import { recordRelayed } from "./gift-store";
import { signMilestoneClaim, signMilestoneProof } from "./milestone-attestation";
import { milestoneGasLimit, type MilestoneFunction } from "./milestone-gas";
import { MILESTONE_ATTESTATION_TTL_SECONDS, type MilestoneParams, type MilestoneProofMessage } from "./milestone-protocol";
import { relayCall, RelayerError, relayerClients, type RelayResult } from "./relayer";
import { MILESTONE_ABIS, milestoneAbiOf, milestoneGiftV2Address, milestoneVersionOf } from "./v2";
import type { MilestoneParamsV2 } from "./v2-protocol";
import { isStartSignedBy, NO_START_SIGNATURE, StartNotSigned } from "./v2-start";

/**
 * The relayed operations of a milestone gift, one function per entry point of `MilestoneGift`, as src/gift-relay.ts
 * is for the daily contract. Each one submits with the relayer, waits for finality, reads the event it needs and
 * records the transaction for the judges page.
 */

/** The milestone contract new gifts are made on until the second version is set. A gift already made is served by the contract its record names. */
export function milestoneAddress(): Hex {
  const value = process.env.MILESTONE_GIFT_ADDRESS?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new RelayerError("NOT_CONFIGURED", "The milestone contract is not configured");
  return getAddress(value);
}

function call(contract: Hex, functionName: MilestoneFunction, args: readonly unknown[], onSubmitted?: (hash: Hex) => Promise<void>): Promise<RelayResult> {
  // The contract a gift is on says what it speaks: the first version's ABI, or the second's (src/v2.ts).
  return relayCall({ address: contract, abi: milestoneAbiOf(contract), floor: milestoneGasLimit(functionName) }, functionName, args, undefined, onSubmitted);
}

/** What a submitted milestone creation came to, read back from the chain, as `createdGiftOf` does for a daily one (D87). */
export async function createdMilestoneOf(txHash: Hex): Promise<{ kind: "made"; giftId: string; escrow: Hex } | { kind: "reverted" } | { kind: "absent" } | { kind: "unknown" }> {
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
  for (const abi of MILESTONE_ABIS) {
    const logs = parseEventLogs({ abi, logs: receipt.logs, eventName: "GiftCreated" });
    const first = logs[0] as { args?: Record<string, unknown>; address?: string } | undefined;
    if (first?.args?.giftId) return { kind: "made", giftId: String(first.args.giftId), escrow: getAddress(String(first.address)) };
  }
  return { kind: "reverted" };
}

function eventOf(result: RelayResult, eventName: string, contract: Hex): Record<string, unknown> | undefined {
  const logs = parseEventLogs({ abi: milestoneAbiOf(contract), logs: result.receipt.logs, eventName });
  return (logs[0] as { args?: Record<string, unknown> } | undefined)?.args;
}

export type CreatedMilestone = Readonly<{ giftId: string; hash: Hex; contract: Hex }>;

/**
 * Terms that carry an opening key are the second version's (src/v2-protocol.ts): they go to the second version's
 * contract and nowhere else, and are refused while it is not set. Terms without one go to the first version's, and are
 * refused once the second is set.
 */
export async function relayCreateMilestone(params: MilestoneParams | MilestoneParamsV2, authorization: ContractAuthorization, onSubmitted?: (hash: Hex) => Promise<void>): Promise<CreatedMilestone> {
  const second = milestoneGiftV2Address();
  const withOpeningKey = "openingKey" in params;
  if (withOpeningKey && !second) throw new RelayerError("NOT_CONFIGURED", "The second version of the milestone contract is not configured");
  if (!withOpeningKey && second) throw new RelayerError("NOT_CONFIGURED", "This gift was prepared for an earlier version. Reload the page and try again.");
  const contract = withOpeningKey && second ? second : milestoneAddress();
  const result = await call(contract, "createGift", [params, authorization], onSubmitted);
  const created = eventOf(result, "GiftCreated", contract);
  if (!created?.giftId) throw new RelayerError("NOT_FINALISED", "The GiftCreated event was not found in the receipt");
  const giftId = String(created.giftId);
  await recordRelayed({ giftId, kind: "create", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return { giftId, hash: result.hash, contract };
}

/** Opens a milestone gift of the second version with the signature of its link's key, as `relayOpen` does a daily one. */
export async function relayMilestoneOpen(input: { giftId: string; contract: Hex; recipient: Hex; deadline: bigint; signature: Hex }): Promise<RelayResult> {
  const result = await call(input.contract, "claim", [input.giftId, { recipient: input.recipient, deadline: input.deadline, signature: input.signature }]);
  await recordRelayed({ giftId: input.giftId, kind: "claim", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

/** Ends a milestone gift of the second version on the signed intent of the person it is for: the whole amount goes back at once. */
export async function relayMilestoneEnd(input: { giftId: string; contract: Hex; giveBack: bigint; nonce: bigint; deadline: bigint; signature: Hex }): Promise<RelayResult> {
  const result = await call(input.contract, "endGiftWithIntent", [input.giftId, { keep: 0n, giveBack: input.giveBack, nonce: input.nonce, deadline: input.deadline, signature: input.signature }]);
  await recordRelayed({ giftId: input.giftId, kind: "end", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

export async function relayMilestoneClaim(input: { giftId: string; contract: Hex; recipient: Hex; contactHash: Hex; nowSeconds?: number }): Promise<RelayResult> {
  // The first version only: there the evidence signer attests the opening. On the second it has no say.
  if (milestoneVersionOf(input.contract) === 2) throw new RelayerError("NOT_CONFIGURED", "This gift is opened with the key of its link");
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const message = {
    giftId: BigInt(input.giftId),
    recipient: input.recipient,
    contactHash: input.contactHash,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + MILESTONE_ATTESTATION_TTL_SECONDS),
  };
  const signature = await signMilestoneClaim(message, input.contract);
  const result = await call(input.contract, "claim", [
    input.giftId,
    { recipient: message.recipient, contactHash: message.contactHash, issuedAt: message.issuedAt, expiresAt: message.expiresAt, signature },
  ]);
  await recordRelayed({ giftId: input.giftId, kind: "claim", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

export type ProvedReading = Readonly<{ hash: Hex; happened: "started" | "reached"; deadline?: number }>;

/** Whether this reading would start a climb: a gift of the first shape with nothing bound yet. Read from the contract. */
async function startsAClimb(contract: Hex, giftId: string): Promise<boolean> {
  const gift = (await relayerClients().publicClient.readContract({ address: contract, abi: milestoneAbiOf(contract), functionName: "getGift", args: [BigInt(giftId)] })) as { shape: number | bigint; identityHash: Hex };
  return Number(gift.shape) === 0 && /^0x0{64}$/.test(gift.identityHash);
}

/**
 * Signs a verified reading as the evidence signer and submits it. What it did is read from the event, not assumed.
 *
 * On the second version the reading that starts a climb is sent only with the signature of the account the gift is for
 * (src/v2-start.ts): without one it is not sent at all, and `StartNotSigned` says what is to be signed. A certificate
 * has no such reading, and every proof after a start goes as it always did.
 */
export async function relayProve(input: { contract: Hex; message: MilestoneProofMessage; startSignature?: Hex }): Promise<ProvedReading> {
  const m = input.message;
  const giftId = m.giftId.toString();
  let recipientSignature = NO_START_SIGNATURE;
  if (milestoneVersionOf(input.contract) === 2 && (await startsAClimb(input.contract, giftId))) {
    const start = { giftId: m.giftId, identityHash: m.identityHash, metricValue: m.metricValue, observedAt: m.observedAt };
    if (!input.startSignature) throw new StartNotSigned("milestone", input.contract, start);
    if (!(await isStartSignedBy({ kind: "milestone", contract: input.contract, start, recipient: m.recipient, signature: input.startSignature }))) {
      throw new RelayerError("REVERTED", "The first reading is not signed by the account the gift is for", "InvalidRecipientSignature");
    }
    recipientSignature = input.startSignature;
  }
  const signature = await signMilestoneProof(input.message, input.contract);
  const result = await call(input.contract, "prove", [
    giftId,
    {
      recipient: m.recipient,
      identityHash: m.identityHash,
      providerId: m.providerId,
      metricValue: m.metricValue,
      eventAt: m.eventAt,
      observedAt: m.observedAt,
      nullifier: m.nullifier,
      issuedAt: m.issuedAt,
      expiresAt: m.expiresAt,
      signature,
      recipientSignature,
    },
  ]);
  await recordRelayed({ giftId, kind: "prove", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  const started = eventOf(result, "StartRecorded", input.contract);
  if (started) return { hash: result.hash, happened: "started", deadline: Number(started.deadline) };
  if (eventOf(result, "MilestoneReached", input.contract)) return { hash: result.hash, happened: "reached" };
  throw new RelayerError("NOT_FINALISED", "The reading was accepted but said neither a start nor an arrival");
}

export async function relayExpire(giftId: string, contract: Hex): Promise<RelayResult> {
  const result = await call(contract, "expire", [giftId]);
  await recordRelayed({ giftId, kind: "expire", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

export async function relayMilestoneRefund(giftId: string, contract: Hex): Promise<RelayResult> {
  const result = await call(contract, "refundUnearned", [giftId]);
  await recordRelayed({ giftId, kind: "refund", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}

export async function relayMilestoneWithdraw(input: {
  giftId: string;
  contract: Hex;
  to: Hex;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  signature: Hex;
}): Promise<RelayResult> {
  const result = await call(input.contract, "withdrawEarnedWithIntent", [
    input.giftId,
    { to: input.to, amount: input.amount, nonce: input.nonce, deadline: input.deadline, signature: input.signature },
  ]);
  await recordRelayed({ giftId: input.giftId, kind: "withdraw", txHash: result.hash, blockNumber: result.receipt.blockNumber });
  return result;
}
