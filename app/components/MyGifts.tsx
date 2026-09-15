"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { getJson } from "@/src/client/api";
import { BODY, CARD, HELP, MONEY, TITLE } from "./ui";

/**
 * After sign-in on the home page: every gift of this account, found from the passkey alone. Opening
 * Viky on a fresh device shows the same list, because nothing lives on the device.
 */

type MyGift = {
  giftId: string;
  role: "funder" | "recipient";
  amountDisplay: string;
  perDayDisplay: string;
  durationDays: number;
  creditedDays: number;
  missedDays: number;
  opened: boolean;
  counting: boolean;
  finished: boolean;
  cancelled: boolean;
  earnedDisplay: string;
  theirsDisplay: string;
  returnedDisplay: string;
};

export function MyGifts() {
  const { address } = useAccount();
  const [gifts, setGifts] = useState<MyGift[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getJson<{ gifts: MyGift[] }>("/api/gifts/mine").then(
      (result) => {
        if (!cancelled) setGifts(result.gifts);
      },
      (error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : "Your gifts could not be loaded.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) return null;
  if (problem) return <p className={BODY}>{problem}</p>;
  if (gifts === null) return <p className={HELP}>Looking for your gifts</p>;
  if (gifts.length === 0) {
    return (
      <section className={CARD}>
        <p className="font-medium">No gift yet.</p>
        <p className={HELP}>
          When someone puts money in your name, their link brings you here. When you send one, it appears here too.
        </p>
      </section>
    );
  }

  // Two blocks, never one list. A person is on one side or the other of any given gift, and the two mean
  // opposite things: one is money becoming theirs, the other money leaving and partly coming back.
  const received = gifts.filter((gift) => gift.role === "recipient");
  const given = gifts.filter((gift) => gift.role === "funder");

  return (
    <>
      {received.length > 0 ? <GiftGroup title="What I receive" gifts={received} /> : null}
      {given.length > 0 ? <GiftGroup title="What I give" gifts={given} /> : null}
    </>
  );
}

function GiftGroup({ title, gifts }: { title: string; gifts: MyGift[] }) {
  return (
    <section className="flex flex-col gap-[var(--space-md)]">
      <h2 className={TITLE}>{title}</h2>
      {gifts.map((gift) => (
        <Link key={gift.giftId} href={`/g/${gift.giftId}`} className={`${CARD} block`}>
          <p className={MONEY}>{gift.role === "recipient" ? gift.earnedDisplay : gift.theirsDisplay}</p>
          <p className={HELP}>
            {gift.role === "recipient"
              ? `yours so far, out of ${gift.amountDisplay}`
              : `theirs so far, out of ${gift.amountDisplay}. Came back to you: ${gift.returnedDisplay}.`}
          </p>
          <p className={BODY}>{stateInWords(gift)}</p>
        </Link>
      ))}
    </section>
  );
}

/** One sentence for the state of a gift, and the same sentence whichever side of it a person is on. */
function stateInWords(gift: MyGift): string {
  if (gift.cancelled) return "Taken back before it was opened.";
  if (gift.finished) return `Finished: ${gift.creditedDays} of ${gift.durationDays} days done.`;
  if (!gift.opened) return "Not opened yet.";
  if (!gift.counting) return "Opened. Name the Duolingo account to start counting.";
  return `Counting: ${gift.creditedDays} of ${gift.durationDays} days done, ${gift.missedDays} missed.`;
}
