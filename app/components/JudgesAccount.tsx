"use client";
import { useAccount } from "@/src/account/provider";
import { TITLE } from "./ui";

// Judges page only: the signed-in account address, so a judge can follow it on the explorer.
export function JudgesAccount() {
  const { address } = useAccount();
  return (
    <section className="space-y-[var(--space-sm)]">
      <h2 className={TITLE}>Your account on this device</h2>
      {address ? (
        <p className="break-all text-[length:var(--type-help)]">{address}</p>
      ) : (
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Not signed in. Create or open an account on the home page, then come back through You, For judges.
        </p>
      )}
    </section>
  );
}
