"use client";
import { useEffect, useState } from "react";
import * as mera from "@/src/account/mera";
import { sessionRemaining } from "@/src/account/session-gate";
import { INLINE_BUTTON } from "./ui";
import { useAccount } from "@/src/account/provider";

/**
 * What the open signing session may do, and when it closes itself. A written criterion of the Mera
 * bounty: the person sees the scope of what they left open, not only that they are signed in. The
 * deadline is read again every second because every signature pushes it back.
 */
export function SessionScope() {
  const { address } = useAccount();
  const [remaining, setRemaining] = useState<{ minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const tick = () => {
      setRemaining(sessionRemaining(mera.sessionExpiresAtMs(), Date.now()) ?? null);
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [address]);

  if (!address || remaining === null) return null;
  const { minutes, seconds } = remaining;

  return (
    <section className="space-y-[var(--space-sm)] rounded-[var(--radius-card)] border border-[var(--divider)] p-[var(--space-lg)] text-[length:var(--type-help)]">
      <p className="font-medium">What this device can do for you right now</p>
      <ul className="list-disc space-y-[var(--space-xs)] pl-[var(--space-lg)] text-[var(--muted)]" >
        <li>Put money behind a goal in someone&apos;s name, for the amounts you type.</li>
        <li>Move money that is already yours back to you.</li>
        <li>Nothing else, and nothing by itself: each one starts from a tap of yours.</li>
      </ul>
      <p className="text-[var(--muted)]">
        It closes itself after {mera.SESSION_IDLE_MINUTES} quiet minutes, and asks for your face or fingerprint again.
        Closing in {minutes}:{String(seconds).padStart(2, "0")}.
      </p>
      <button type="button" onClick={() => mera.signOut()} className={INLINE_BUTTON}>
        Close it now
      </button>
    </section>
  );
}
