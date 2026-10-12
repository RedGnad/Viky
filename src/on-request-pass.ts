import { readGift } from "./gift-reader";
import type { Hex } from "viem";

export { remindersOfGiftsAsking, tellOfGiftsAsking } from "./on-request";

/**
 * A gift as its contract holds it, for the passes that write to the operator about a line offered on request
 * (src/on-request.ts): when it was funded, and whether it is over. The chain's own answer, asked gift by gift.
 */
export async function giftOnChain(escrow: string, giftId: string): Promise<Readonly<{ fundedAt: number; cancelled: boolean; finalised: boolean }>> {
  const gift = await readGift(escrow as Hex, giftId);
  return { fundedAt: gift.fundedAt, cancelled: gift.cancelled, finalised: gift.finalised };
}
