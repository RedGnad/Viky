"use client";
import { useState } from "react";
import { useAccount } from "@/src/account/provider";
import { YOUR_CODE as W } from "@/src/sentences";
import { HELP, SECONDARY_BUTTON, STICKER, TITLE } from "./ui";

/**
 * The account's own code, on the account page, with one line saying what it is for (decision 11 of the design
 * pass, 17 Sep 2026). Two places ask for it: a payout service asks where the money is sent from, and another
 * Viky account of the same person needs it to send money here. It used to live on the judges page only, which
 * is off the person's path now.
 */
export function YourCode() {
  const { address } = useAccount();
  const [copied, setCopied] = useState<"no" | "yes" | "refused">("no");
  if (!address) return null;
  return (
    <section className={STICKER.pink}>
      <h2 className={TITLE}>{W.title}</h2>
      <p className={HELP}>{W.use}</p>
      <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(address).then(() => setCopied("yes")).catch(() => setCopied("refused"))}
        className={SECONDARY_BUTTON}
      >
        {copied === "yes" ? W.copied : W.copy}
      </button>
      {copied === "refused" ? <p className={HELP}>Your browser would not let us copy it. Press and hold the code, then choose Copy.</p> : null}
    </section>
  );
}
