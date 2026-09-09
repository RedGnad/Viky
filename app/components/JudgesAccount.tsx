"use client";
import { useAccount } from "@/src/account/provider";

// Judges page only: the signed-in account address, so a judge can follow it on the explorer.
export function JudgesAccount() {
  const { address } = useAccount();
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Your account on this device</h2>
      {address ? (
        <p className="break-all font-mono text-sm">{address}</p>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Not signed in. Create or open an account on the home page; the address appears here.
        </p>
      )}
    </section>
  );
}
