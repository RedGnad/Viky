import { getAddress, recoverTypedDataAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";
import { readGift } from "./gift-reader";
import { relayOpen } from "./gift-relay";
import type { GiftRecord } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { readMilestoneGift } from "./milestone-reader";
import { relayMilestoneOpen } from "./milestone-relay";
import { escrowOf, type RelayResult } from "./relayer";
import { dailyVersionOf, milestoneVersionOf, type ContractVersion } from "./v2";
import { openTypedData, OPEN_TTL_SECONDS } from "./v2-protocol";

/**
 * Opening a gift of the second version (the audit of 1 Oct 2026). Server only.
 *
 * The person holds the link. Their browser makes the gift's opening key from the link's secret and signs which account
 * the gift opens for (src/v2-protocol.ts). The server is sent that signature, never the secret, and adds nothing to
 * it: it checks it against the opening key the contract holds, so a signature that cannot open the gift costs no
 * transaction, and relays it. The evidence signer is not asked. The contract makes the same comparison again.
 */

/** Which version of its contract holds a gift, from the gift's own record. */
export function versionOfGift(record: Pick<GiftRecord, "giftId" | "escrow">): ContractVersion {
  const contract = escrowOf(record);
  return isMilestoneGiftId(record.giftId) ? milestoneVersionOf(contract) : dailyVersionOf(contract);
}

export type OpeningRequest = Readonly<{ deadline: bigint; signature: Hex }>;

/** The opening a request carries, or a refusal that says the link is not valid: nothing else is ever said of a bad one. */
export function openingOf(body: unknown, nowSeconds: number = Math.floor(Date.now() / 1_000)): OpeningRequest {
  const invalid = () => new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid", 404);
  const given = (body ?? {}) as { deadline?: unknown; signature?: unknown };
  const deadline = String(given.deadline ?? "");
  const signature = String(given.signature ?? "");
  if (!/^\d{1,12}$/.test(deadline) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw invalid();
  const until = BigInt(deadline);
  // Signed for "now": past, or further ahead than a signature made at this moment would be, is not this opening.
  if (until < BigInt(nowSeconds) || until > BigInt(nowSeconds + 2 * OPEN_TTL_SECONDS)) throw new GiftApiError("EXPIRED", "This request took too long. Please try again.", 409);
  return { deadline: until, signature: signature as Hex };
}

/** Opens the gift for `recipient` with the signature its link's key made, after checking it against the contract's own key. */
export async function openWithTheLinkKey(record: GiftRecord, recipient: string, opening: OpeningRequest): Promise<RelayResult> {
  const contract = escrowOf(record);
  const account = getAddress(recipient);
  const milestone = isMilestoneGiftId(record.giftId);
  const state = milestone ? await readMilestoneGift(contract, record.giftId) : await readGift(contract, record.giftId);
  if (state.recipient !== null) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid or was already used", 404);
  const signer = await recoverTypedDataAddress({
    ...openTypedData(milestone ? "milestone" : "daily", contract, { giftId: BigInt(record.giftId), recipient: account, deadline: opening.deadline }),
    signature: opening.signature,
  }).catch(() => null);
  if (!signer || !state.openingKey || signer.toLowerCase() !== state.openingKey.toLowerCase()) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid", 404);
  const input = { giftId: record.giftId, recipient: account, deadline: opening.deadline, signature: opening.signature };
  return milestone ? relayMilestoneOpen({ ...input, contract }) : relayOpen({ ...input, escrow: contract });
}
