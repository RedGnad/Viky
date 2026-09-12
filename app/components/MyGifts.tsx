"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { getJson } from "@/src/client/api";

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
  if (problem) return <p className="text-sm text-amber-900">{problem}</p>;
  if (gifts === null) return <p className="text-sm" style={{ color: "var(--muted)" }}>Looking for your gifts</p>;
  if (gifts.length === 0) {
    return (
      <section className="space-y-2 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <p className="font-medium">No gift yet.</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          When someone puts money in your name, their link brings you here. When you send one, it appears here too.
        </p>
        <Link href="/fund" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Put money behind someone&apos;s goal
        </Link>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="font-medium">Your gifts</h2>
      {gifts.map((gift) => (
        <Link key={gift.giftId} href={`/g/${gift.giftId}`} className="block rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <p className="text-lg font-semibold">
            {gift.amountDisplay} {gift.role === "recipient" ? "in your name" : "you put in someone's name"}
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {gift.cancelled
              ? "Taken back before it was opened."
              : gift.finished
                ? `Finished: ${gift.creditedDays} of ${gift.durationDays} days done.`
                : !gift.opened
                  ? "Not opened yet."
                  : !gift.counting
                    ? "Opened. Name the Duolingo account to start counting."
                    : `Counting: ${gift.creditedDays} of ${gift.durationDays} days done, ${gift.missedDays} missed.`}
          </p>
          <p className="text-sm">
            {gift.role === "recipient"
              ? `Yours so far: ${gift.earnedDisplay}`
              : `Theirs so far: ${gift.theirsDisplay}. Came back to you: ${gift.returnedDisplay}.`}
          </p>
        </Link>
      ))}
    </section>
  );
}
