"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { readAusdBalance } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { CARD, SECONDARY_BUTTON } from "./ui";

/**
 * Money sitting in the person's own account, whoever they are. A recipient lands here after taking what a
 * gift earned; a sender has whatever was left over after funding one. Without this there was no way to
 * reach the way out except from a gift that had already earned something, so a sender paying out their own
 * leftover had nowhere to go.
 */
export function YourMoney() {
  const { address } = useAccount();
  const [holding, setHolding] = useState<bigint | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => (address ? readAusdBalance(address) : null))
      .then((balance) => {
        if (live) setHolding(balance);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  if (!address || holding === null || holding <= 0n) return null;

  return (
    <section className={CARD}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        In your account
      </p>
      <p className="text-2xl font-semibold">{formatAusd(holding)}</p>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Yours to keep, to put behind another goal, or to send to your card or bank.
      </p>
      <Link href="/cash-out" className={SECONDARY_BUTTON}>
        Take it out
      </Link>
    </section>
  );
}
