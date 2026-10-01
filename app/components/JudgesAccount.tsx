"use client";
import { useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { consentKey, onConsentKey } from "@/src/client/consent-key";
import { TITLE } from "./ui";

/** The agreement key this page holds in memory, as hexadecimal, or nothing. Read from the session itself, never from the server. */
function keyHeld(): string {
  const held = consentKey();
  return held ? Array.from(held.publicKey, (byte) => byte.toString(16).padStart(2, "0")).join("") : "";
}
const noKey = () => "";

/**
 * Judges page only: the signed-in account, so a judge can follow it on the explorer, and the agreement key this
 * device made from the same passkey (the audit of 1 Oct 2026). The key is the public half of the Ed25519 key held in
 * the page's memory (src/client/consent-key.ts): it is printed whole so that two devices can be compared by eye, and
 * it comes from that session alone, never from what the server keeps.
 */
export function JudgesAccount() {
  const { address } = useAccount();
  const key = useSyncExternalStore(onConsentKey, keyHeld, noKey);
  return (
    <section className="space-y-[var(--space-sm)]">
      <h2 className={TITLE}>Your account on this device</h2>
      {address ? (
        <>
          <p className="break-all text-[length:var(--type-help)]">{address}</p>
          {key ? (
            <p className="text-[length:var(--type-help)]" data-agreement-key={key}>
              Your agreement key: <span className="break-all">ed25519 {key}</span>. It is the same on every device that
              holds this passkey, and it is held in this page&apos;s memory only: nothing of it is stored.
            </p>
          ) : (
            <p className="text-[length:var(--type-help)] text-[var(--muted)]" data-agreement-key="">
              Your agreement key is not in this page&apos;s memory right now: it is made when you sign in and dropped when
              the page is loaded again. Sign out, sign in, and come back here through You, For judges, to read it.
            </p>
          )}
          <p className="text-[length:var(--type-help)] text-[var(--muted)]">
            Passkey managers that give a passkey&apos;s two answers today, by Mera&apos;s own list
            (mera.category.xyz/authenticator-support, read 1 Oct 2026): iCloud Keychain on iOS 18 or macOS 15 and later,
            Google Password Manager, 1Password, and Windows 11 25H2 and later. Bitwarden, Dashlane and a passkey kept
            in a Chrome profile alone do not.
          </p>
        </>
      ) : (
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Not signed in. Create or open an account on the home page, then come back through You, For judges.
        </p>
      )}
    </section>
  );
}
