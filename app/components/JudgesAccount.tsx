"use client";
import { useAccount } from "@/src/account/provider";

// Judges page only: the signed-in account address, so a judge can follow it on the explorer.
export function JudgesAccount() {
  const { address } = useAccount();
  return (
    <section className="space-y-[var(--space-sm)]">
      <h2 className="font-medium">Your account on this device</h2>
      {address ? (
        <p className="break-all font-mono text-[length:var(--type-help)]">{address}</p>
      ) : (
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Not signed in. Create or open an account on the home page, then follow its &quot;For judges&quot; link: the session lives in memory, so the address appears here only through that link, not after a reload.
        </p>
      )}
    </section>
  );
}
