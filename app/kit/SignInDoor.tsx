"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { DOOR as W } from "@/src/sentences";
import { CARD, HELP, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/ui";

/**
 * The one door into an account (the art direction brief of 17 Sep 2026, section 7): a small outlined button in the
 * header, opposite the mark, so it is discoverable without competing with the one action in the body. There is no page
 * for making an account: an account is made where it serves, at the payment for a funder and on the link for the person
 * a gift is for, which is Apple's "Delay sign-in for as long as possible".
 *
 * Pressing it opens the passkey at once. Only when that does not work, because this device holds no passkey for Viky or
 * because the system sheet was waved away, does a panel open under it: what a passkey is in one sentence, making an
 * account, and trying again. After signing in, the person lands on Home, on their money, never on a setting.
 */
export function SignInDoor() {
  const { address, status, error, signIn, createAccount, clearError } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const door = useRef<HTMLButtonElement>(null);
  const busy = status === "busy";

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        door.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !door.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const arrive = () => {
    if (mera.currentAddress()) router.push("/");
    else setOpen(true);
  };

  const tryPasskey = async () => {
    clearError();
    await signIn();
    arrive();
  };

  const make = async () => {
    clearError();
    // The device names the passkey itself here: naming it is a question that does not matter at the door, and it
    // lives on Me instead, signed in.
    await createAccount("");
    arrive();
  };

  if (address) return null;

  return (
    <div className="relative">
      <button
        ref={door}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy}
        onClick={() => void tryPasskey()}
        className={INLINE_BUTTON}
      >
        {busy ? W.busy : W.open}
      </button>
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label={W.title}
          className={`${CARD} absolute top-[calc(100%+var(--space-sm))] right-0 z-50 flex w-[min(320px,calc(100vw-2*var(--page-margin)))] flex-col`}
        >
          <p className={HELP}>{W.how}</p>
          <button type="button" onClick={() => void make()} disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? W.busy : W.create}
          </button>
          <button type="button" onClick={() => void tryPasskey()} disabled={busy} className={SECONDARY_BUTTON}>
            {W.again}
          </button>
          {error ? (
            <p role="alert" className={HELP}>
              {error.guidance}
            </p>
          ) : null}
          <button type="button" onClick={() => setOpen(false)} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
            {W.notNow}
          </button>
        </div>
      ) : null}
    </div>
  );
}
