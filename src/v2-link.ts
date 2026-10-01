import { decodeFunctionData, type Hex, type PublicClient } from "viem";
import { GiftApiError } from "./gift-api";
import { giftPublicClient } from "./gift-reader";
import type { GiftRecord } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { dailyAbiOf, milestoneAbiOf } from "./v2";

/**
 * The salt of a gift of the second version, read from the transaction that made it (the audit of 1 Oct 2026). Server only.
 *
 * It is what the funder's account signs to make, and to find again, the secret of the gift's link
 * (src/v2-protocol.ts, `giftLinkTypedData`). The salt is public: it is in the terms the contract was sent, in a
 * transaction anybody reads. So Viky keeps nothing new for it, and answering it hands nobody the link: only the
 * funder's own account can turn it into the secret.
 */
export async function termsSaltOf(record: Pick<GiftRecord, "giftId" | "createdTx">, contract: Hex, client: PublicClient = giftPublicClient()): Promise<Hex> {
  const notFound = () => new GiftApiError("LINK_NOT_FOUND", "The link could not be found again just now. Try again in a moment.", 503);
  const transaction = await client.getTransaction({ hash: record.createdTx }).catch(() => null);
  if (!transaction || transaction.to?.toLowerCase() !== contract.toLowerCase()) throw notFound();
  try {
    const call = decodeFunctionData({ abi: isMilestoneGiftId(record.giftId) ? milestoneAbiOf(contract) : dailyAbiOf(contract), data: transaction.input });
    const salt = (call.args?.[0] as { salt?: unknown } | undefined)?.salt;
    if (call.functionName !== "createGift" || typeof salt !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(salt)) throw notFound();
    return salt as Hex;
  } catch {
    throw notFound();
  }
}
