import type { GiftSummary } from "@/src/client/gift";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";

/**
 * The one example in the product: the gift card on the page without an account, labelled "Example" (the art direction
 * brief of 17 Sep 2026, section 7: that page shows the product rather than describing it). Nobody's gift, no real
 * amount, and it is never shown to somebody who has an account, who sees their own.
 *
 * It is built around today so its days read as a gift in progress, and it goes through the same card, the same strip
 * and the same words as a real one: an example that drifted from the product would be worse than none.
 *
 * It is read in the third voice (D99): the page it sits on is a stranger's first sight of Viky, and it belongs to
 * nobody, so the card says "theirs" and "gone back" rather than addressing the reader as the person it is for. The
 * relecture of 18 Sep found it saying "$4.00 of $14.00 yours" to somebody being invited to offer a gift.
 */
export function exampleGift(nowMs: number): GiftSummary {
  const today = Math.floor(nowMs / 86_400_000);
  return {
    giftId: "example",
    role: "reader",
    goalType: GOAL_TYPE_DUOLINGO_XP,
    goalUsername: null,
    usernameSource: "recipient",
    recipientName: null,
    funderName: "Mum",
    catchUpSeconds: 86_400,
    days: [],
    fundedAt: 0,
    startDay: today - 4,
    endDay: today + 2,
    amountDisplay: "$14.00",
    perDayDisplay: "$2.00",
    durationDays: 7,
    creditedDays: 2,
    missedDays: 1,
    opened: true,
    counting: true,
    finished: false,
    cancelled: false,
    earnedDisplay: "$4.00",
    theirsDisplay: "$4.00",
    returnedDisplay: "$2.00",
  };
}
