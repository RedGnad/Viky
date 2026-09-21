import { catchUpSecondsOf } from "./catch-up";
import { formatAusd, readGift, theirsSoFar } from "./gift-reader";
import { loadGiftsOf, loadSettledDays } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { loadMilestoneStatus } from "./milestone-status";
import { escrowOf } from "./relayer";
import type { GiftSummary } from "./client/gift";

/**
 * The gifts of an account, as funder or recipient, read from the contract (D160).
 *
 * This is what lets a person open Viky on a fresh device and find everything again from their passkey alone (the
 * Mera "stateless test"): nothing is kept on the device. It was inside the route, so Home said "One moment" where
 * the gifts go and filled them in once the browser had asked; the page reads it directly now, and the gifts are in
 * the page the server sends.
 */

export async function giftsOf(account: string): Promise<GiftSummary[]> {
  const records = await loadGiftsOf(account);
  const recordedDays = await loadSettledDays(records.map((record) => record.giftId));
  const gifts = await Promise.all(
    records.map(async (record) => {
      const role = record.funder.toLowerCase() === account.toLowerCase() ? "funder" : "recipient";
      // A milestone gift has no days to draw: its card carries the climb instead (C2).
      if (isMilestoneGiftId(record.giftId)) {
        const { status, state } = await loadMilestoneStatus(record, { isRecipient: role === "recipient", isFunder: role === "funder", holdsTheLink: false });
        return {
          giftId: record.giftId,
          role,
          goalType: state.goalType,
          goalUsername: record.goalUsername,
          usernameSource: record.usernameSource,
          recipientName: record.recipientName,
          funderName: record.funderName,
          catchUpSeconds: 0,
          days: [],
          fundedAt: state.fundedAt,
          startDay: 0,
          endDay: 0,
          amountDisplay: status.amountDisplay,
          perDayDisplay: status.amountDisplay,
          durationDays: state.durationDays,
          creditedDays: 0,
          missedDays: 0,
          opened: status.opened,
          counting: status.connected,
          finished: status.finished,
          cancelled: status.cancelled,
          earnedDisplay: status.earnedDisplay,
          theirsDisplay: status.reached ? status.amountDisplay : "$0.00",
          returnedDisplay: status.returnedDisplay,
          milestone: status,
        };
      }
      const gift = await readGift(escrowOf(record), record.giftId);
      return {
        giftId: record.giftId,
        role,
        // What the card says the gift is for and whom, read from the register by the screen (C1): the goal type,
        // the name the funder gave when they gave one, and when it was made, so the newest comes first.
        goalType: gift.goalType,
        goalUsername: record.goalUsername,
        usernameSource: record.usernameSource,
        // The two names the card says "For" and "From" with. This account is the funder or the recipient.
        recipientName: record.recipientName,
        funderName: record.funderName,
        catchUpSeconds: catchUpSecondsOf(escrowOf(record)),
        // The keeper's record per day, so a card draws each day at its date (D86).
        days: recordedDays.get(record.giftId) ?? [],
        fundedAt: gift.fundedAt,
        startDay: gift.startDay,
        endDay: gift.endDay,
        amountDisplay: formatAusd(gift.amount),
        perDayDisplay: formatAusd(gift.perDay),
        durationDays: gift.durationDays,
        creditedDays: gift.creditedDays,
        missedDays: gift.drainedDays,
        opened: gift.recipient !== null,
        counting: record.boundAt !== null,
        finished: gift.finalised,
        cancelled: gift.cancelled,
        earnedDisplay: formatAusd(gift.earnedBalance),
        theirsDisplay: formatAusd(theirsSoFar(gift)),
        returnedDisplay: formatAusd(gift.refundedToFunder),
      };
    }),
  );
  // Newest first, by the moment the money went in, which is what "what's moving" shows first (structure, Home).
  gifts.sort((a, b) => b.fundedAt - a.fundedAt);
  return gifts as GiftSummary[];
}
