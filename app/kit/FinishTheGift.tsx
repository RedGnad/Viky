"use client";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { subscribeToCardDraft } from "@/src/card-draft";
import { formatAusd } from "@/src/gift-reader";
import { dollarsToUnits } from "@/src/money";
import { loadPendingGift, peekPendingGift } from "@/src/pending-gift";
import { FUND, HOME } from "@/src/sentences";
import { BODY, CARD, SECONDARY_BUTTON } from "../components/ui";

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
  const waiting = useSyncExternalStore(
    subscribeToCardDraft,
    useCallback(() => {
      const kept = address ? loadPendingGift(address) : peekPendingGift();
      if (!kept?.wayIn) return null;
      const amount = formatAusd(dollarsToUnits(kept.dollars));
      return kept.recipientName ? FUND.waitingGift.which(amount, kept.recipientName) : FUND.waitingGift.whichUnnamed(amount);
    }, [address]),
    nothingOnTheServer,
  );
  if (!waiting) return null;
  return (
    <section className={`${CARD} w-full`} data-finish-gift="">
      <p className={BODY}>{waiting}</p>
      <Link href="/fund?step=paying" className={`${SECONDARY_BUTTON} block text-center no-underline`}>
        {HOME.finish}
      </Link>
    </section>
  );
}
