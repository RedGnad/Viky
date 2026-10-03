"use client";
import Link from "next/link";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { subscribeToCardDraft } from "@/src/card-draft";
import { noteInRampnowJournal } from "@/src/client/rampnow-journal";
import { clearRampnowPending, useRampnowPending } from "@/src/client/rampnow-pending";
import { formatAusd } from "@/src/gift-reader";
import { dollarsToUnits } from "@/src/money";
import { loadPendingGift, peekPendingGift } from "@/src/pending-gift";
import { WAY_IN_USDC } from "@/src/rails";
import { rampnowFrameOn } from "@/src/rampnow-frame";
import { FUND, HOME, PAY } from "@/src/sentences";
import { BODY, CARD, SECONDARY_BUTTON } from "../components/ui";
import { RampnowWaiting } from "./offer/RampnowWaiting";

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
      return JSON.stringify({ amount: formatAusd(dollarsToUnits(kept.dollars)), recipient: kept.recipientName ?? "", byRampnow: kept.wayIn === WAY_IN_USDC.name });
    }, [address]),
    nothingOnTheServer,
  );
  const waiting = useMemo(() => (kept === null ? null : (JSON.parse(kept) as { amount: string; recipient: string; byRampnow: boolean })), [kept]);
  // A card payment that may be at Rampnow, kept on this device for this account (src/client/rampnow-pending.ts).
  const pending = useRampnowPending(address);
  if (!waiting) return null;
  // One gift, one payment (the founder, 3 Oct 2026): where "not made yet" stood, the payment that is at Rampnow, the
  // way back to it, and never a button that would start another.
  if (waiting.byRampnow && rampnowFrameOn() && pending) {
    return (
      <section className={`${CARD} w-full`} data-finish-gift="">
        <RampnowWaiting
          pending={pending}
          says={(pending.known ? PAY.rampnow.giftAtRampnow : PAY.rampnow.giftMaybeAtRampnow)(waiting.amount, waiting.recipient)}
          quiet
          onNotPaid={() => {
            noteInRampnowJournal("Viky: said not paid, away from the screen that waits");
            clearRampnowPending(address);
          }}
        />
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
