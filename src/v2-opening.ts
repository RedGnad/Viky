import { getAddress, recoverTypedDataAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";
import { readGift } from "./gift-reader";
import { relayOpen } from "./gift-relay";
import { holdsGiftLink, type GiftRecord } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { readMilestoneGift } from "./milestone-reader";
import { relayMilestoneOpen } from "./milestone-relay";
import { countedIfSent, type Admission } from "./relay-admission";
import { escrowOf, type RelayResult } from "./relayer";
import { dailyVersionOf, milestoneVersionOf, type ContractVersion } from "./v2";
import { LINK_SECRET, openTypedData, OPEN_TTL_SECONDS, previewTokenOf } from "./v2-protocol";

/**
 * Opening a gift of the second version (the audit of 1 Oct 2026). Server only.
 *
 * The person holds the link. Their browser makes the gift's opening key from the secret after the link's `#` and signs
 * which account the gift opens for (src/v2-protocol.ts). The server is sent that signature and adds nothing to it: it
 * checks it against the opening key the contract holds, so a signature that cannot open the gift costs no transaction,
 * and relays it. The evidence signer is not asked. The contract makes the same comparison again.
 *
 * The secret itself is in no request Viky's code makes: a browser sends what follows a `#` to nobody, and `?t=` carries
 * a preview token made from the secret by a hash (the review of 2 Oct 2026, R-01). Should a secret reach the server
 * all the same, in `?t=` or in a request's body, a link written the old way or a page built before, it is refused
 * here: nothing is answered for it, and nothing is opened with it.
 */

/**
 * Whether what a request carried as a link's key is the opening secret of this gift. The record keeps the fingerprint
 * of the link's preview token, and the preview token is made from the secret: so the secret is the one value whose
 * preview token this gift's fingerprint is of. True of no gift of the first version, whose record keeps the
 * fingerprint of the key itself.
 */
export function isTheOpeningSecret(record: Pick<GiftRecord, "claimTokenHash">, sent: string | null | undefined): boolean {
  if (!sent || !LINK_SECRET.test(sent)) return false;
  return holdsGiftLink(record, previewTokenOf(sent));
}

/** The refusal of an opening secret that was sent to the server. It names nothing of what was sent. */
export function openingSecretRefused(): GiftApiError {
  return new GiftApiError("LINK_OUT_OF_DATE", "This link is out of date. Ask for the link again.", 400);
}

/**
 * Whether a reader holds this gift's link, by what their request carried in `?t=`. The opening secret of the gift is
 * refused, never taken for the link: a server that answered it would be a server that is sent it.
 */
export function holdsTheLinkOf(record: Pick<GiftRecord, "claimTokenHash">, sent: string | null | undefined): boolean {
  if (isTheOpeningSecret(record, sent)) throw openingSecretRefused();
  return holdsGiftLink(record, sent ?? null);
}


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

/**
 * Opens the gift for `recipient` with the signature its link's key made, after checking it against the contract's own
 * key. `admit` counts the request, and is asked only once that check has passed: an opening that cannot open the gift
 * costs the relayer nothing and is counted against nobody (the review of 2 Oct 2026, R-16).
 */
export async function openWithTheLinkKey(record: GiftRecord, recipient: string, opening: OpeningRequest, admit?: () => Promise<Admission>): Promise<RelayResult> {
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
  const relayIt = () => (milestone ? relayMilestoneOpen({ ...input, contract }) : relayOpen({ ...input, escrow: contract }));
  return admit ? countedIfSent(await admit(), relayIt) : relayIt();
}
