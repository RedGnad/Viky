import { readGift } from "./gift-reader";
import { loadGiftsOf } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { readMilestoneGift } from "./milestone-reader";
import { escrowOf } from "./relayer";
import type { EarnedInGift } from "./earned-shape";

export { totalEarned, type EarnedInGift } from "./earned-shape";

/**
 * What the gifts made out to an account hold for it right now (D208): money already theirs, still in the contract,
 * which the way out takes first. Read from the contracts while the request is answered, never from a record: the
 * contract is what pays, and what it says it holds is what can be taken.
 *
 * Only gifts this account is the recipient of, as the contract says, and only what is there to take: a gift that
 * holds nothing for them is left out. The withdrawal nonce is the one the contract expects next, so the signature the
 * way out asks for is the one the contract will accept.
 */
export async function earnedInGiftsOf(account: string): Promise<EarnedInGift[]> {
  const who = account.toLowerCase();
  const records = (await loadGiftsOf(account)).filter((record) => record.funder.toLowerCase() !== who);
  const held = await Promise.all(
    records.map(async (record) => {
      const escrow = escrowOf(record);
      const state = isMilestoneGiftId(record.giftId) ? await readMilestoneGift(escrow, record.giftId) : await readGift(escrow, record.giftId);
      if (!state.recipient || state.recipient.toLowerCase() !== who || state.earnedBalance <= 0n) return null;
      return { giftId: record.giftId, escrow, earned: state.earnedBalance.toString(), nonce: state.withdrawNonce.toString() };
    }),
  );
  return held.filter((one): one is EarnedInGift => one !== null);
}
