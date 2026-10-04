"use client";
import Link from "next/link";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { subscribeToCardDraft } from "@/src/card-draft";
import { useRampnowPending } from "@/src/client/rampnow-pending";
import { formatAusd } from "@/src/gift-reader";
import { dollarsToUnits } from "@/src/money";
import { giftAsTyped } from "@/src/pay-sum";
import { loadPendingGift, peekPendingGift } from "@/src/pending-gift";
import { WAY_IN_USDC } from "@/src/rails";
import { rampnowFrameOn } from "@/src/rampnow-frame";
import { FUND, HOME, PAY } from "@/src/sentences";
import { BODY, CARD, SECONDARY_BUTTON } from "../components/ui";
import { useMinute } from "./clock";

/**
 * The way back to a gift whose payment was started and which was never made (D74, and the audit of 1 Oct 2026).
 *
 * The waiting screen says "You can leave this page: the gift is kept, and Viky picks it up when you come back", and
 * that was true on `/fund` alone: somebody who came back by Home, which is where the address and the installed app
 * open, was told nothing, and the money they had paid sat in their account with no gift made. The sentence for it was
 * still in the register with nobody calling it.
 *
 * Read after the page has woken, from the device: with an account, the gift kept for that account and never the one
 * kept for another (D74); with none, whatever this device keeps, since signing in is the first thing the wait asks.
 * Shown only for a gift whose payment was started (`wayIn`), never for a card that is merely filled in.
 */
const nothingOnTheServer = () => null;

export function FinishTheGift() {
  const { address } = useAccount();
  // One line of text and not the gift itself: React compares what a store answers by identity.
  const kept = useSyncExternalStore(
    subscribeToCardDraft,
    useCallback(() => {
      const kept = address ? loadPendingGift(address) : peekPendingGift();
      if (!kept?.wayIn) return null;
      // The gift as it was typed, in the money it was typed in (src/pay-sum.ts): somebody who typed 45 euros read
      // "$50.51 for Boo" here (the founder, 4 Oct 2026).
      return JSON.stringify({ amount: giftAsTyped(kept, formatAusd(dollarsToUnits(kept.dollars))), recipient: kept.recipientName ?? "", byRampnow: kept.wayIn === WAY_IN_USDC.name });
    }, [address]),
    nothingOnTheServer,
  );
  const waiting = useMemo(() => (kept === null ? null : (JSON.parse(kept) as { amount: string; recipient: string; byRampnow: boolean })), [kept]);
  // A card payment that may be at Rampnow, kept on this device for this account (src/client/rampnow-pending.ts).
  const pending = useRampnowPending(address);
  const minute = useMinute();
  if (!waiting) return null;
  // One gift, one payment (the founder, 3 and 4 Oct 2026): where "not made yet" stood, one sentence saying a card
  // payment was started, and one button, at the weight of the one it replaces, which leads to the screen that waits.
  // Whether the person paid is asked there and nowhere else, and nothing here could start another payment.
  if (waiting.byRampnow && rampnowFrameOn() && pending) {
    return (
      <section className={`${CARD} w-full`} data-finish-gift="" data-rampnow-started="">
        <p className={BODY}>{PAY.rampnow.giftStarted(waiting.amount, waiting.recipient, Math.max(0, Math.floor((minute - pending.sinceMs) / 60_000)))}</p>
        <Link href="/fund?step=paying" className={`${SECONDARY_BUTTON} block text-center no-underline`}>
          {PAY.rampnow.finish}
        </Link>
      </section>
    );
  }
  return (
    <section className={`${CARD} w-full`} data-finish-gift="">
      <p className={BODY}>{waiting.recipient ? FUND.waitingGift.which(waiting.amount, waiting.recipient) : FUND.waitingGift.whichUnnamed(waiting.amount)}</p>
      <Link href="/fund?step=paying" className={`${SECONDARY_BUTTON} block text-center no-underline`}>
        {HOME.finish}
      </Link>
    </section>
  );
}
