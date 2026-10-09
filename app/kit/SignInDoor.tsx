"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as mera from "@/src/account/mera";
import { useMadeHere, useOnAComputer } from "@/src/account/door";
import { doorWasAskedFor } from "@/src/account/door-asked";
import { useAccount } from "@/src/account/provider";
import { ACCOUNT_DOOR, DOOR as W } from "@/src/sentences";
import { CARD, HELP, SECONDARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { MadeOnTheMainSite } from "./AccountDoor";
import { ButtonWords } from "./Waiting";
import { WAITS } from "@/src/sentences";
import { Button } from "./Button";

/**
 * The one door into an account (the art direction brief of 17 Sep 2026, section 7): a small outlined button in the
 * header, opposite the mark, so it is discoverable without competing with the one action in the body. There is no page
 * for making an account: an account is made where it serves, at the payment for a funder and on the link for the person
 * a gift is for, which is Apple's "Delay sign-in for as long as possible".
 *
 * On a device that remembers a passkey for Viky, pressing it opens the passkey at once, and a panel opens under it
 * only when that did not sign anybody in. On a device that remembers none, the press opens the panel and asks nothing
 * of the browser (the founder, 5 Oct 2026): a tester with no account pressed "Sign in" on an iPhone, then on a
 * computer, and was offered a QR code, Bluetooth and a security key, which is what a browser shows when it is asked
 * for a passkey it does not hold. So the panel leads with making an account, and signing in is its second action, the
 * only one that asks for a passkey. After signing in, the person lands on Home, on their money, never on a setting.
 */
export function SignInDoor() {
  const { address, hasCredential, status, error, signIn, createAccount, clearError } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** Whether the passkey was tried and did not sign anybody in: the panel's second key then says "Try again". */
  const [tried, setTried] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const door = useRef<HTMLButtonElement>(null);
  const busy = status === "busy";
  const madeHere = useMadeHere();
  const computer = useOnAComputer();

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
    else {
      setTried(true);
      setOpen(true);
    }
  };

  // The page just left asked for the door, by asking for another account (src/account/door-asked.ts):
  // it stands open on arrival, with nothing tried yet. Past the body of the effect, as the screen's other readings are.
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live && doorWasAskedFor()) setOpen(true);
    });
    return () => {
      live = false;
    };
  }, []);

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
        // A device that knows no account is asked for no passkey: the press opens the door, and shuts it again.
        onClick={() => (hasCredential ? void tryPasskey() : setOpen((was) => !was))}
        className={SMALL_BUTTON}
      >
        {/* One width whatever it says (the founder, 21 Sep 2026): "Sign in" and "One moment" are the same button,
            and a header control that grows while it works moves the mark beside it. */}
        <span className="inline-flex min-w-[10ch] justify-center text-center">
          <ButtonWords busy={busy} doing={W.busy}>
            {W.open}
          </ButtonWords>
        </span>
      </button>
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label={W.title}
          className={`${CARD} absolute top-[calc(100%+var(--space-sm))] right-0 z-50 flex w-[min(320px,calc(100vw-2*var(--page-margin)))] flex-col`}
        >
          <p className={HELP}>{W.how}</p>
          {/* On a computer, which choice of the system's sheet follows the person, before they choose (5 Oct 2026). */}
          {computer && madeHere ? (
            <p className={HELP} data-on-a-computer="">
              {ACCOUNT_DOOR.onAComputer}
            </p>
          ) : null}
          {/* On an address that is not Viky's own no account is made: the way to viky.cash stands in the button's place. */}
          {madeHere ? (
            <>
              <Button doing={busy ? W.busy : null} step={WAITS.account} onPress={() => void make()}>
                {W.create}
              </Button>
              <p className={HELP} data-adult="">
                {ACCOUNT_DOOR.adult}
              </p>
            </>
          ) : (
            <MadeOnTheMainSite />
          )}
          <button type="button" onClick={() => void tryPasskey()} disabled={busy} className={SECONDARY_BUTTON}>
            {/* "Try again" only where a passkey this device remembers did not answer: elsewhere the press signs in. */}
            {tried && hasCredential ? W.again : W.open}
          </button>
          {error ? (
            <p role="alert" className={HELP}>
              {error.guidance}
            </p>
          ) : null}
          <button type="button" onClick={() => setOpen(false)} className={`${SMALL_BUTTON} self-start`}>
            {W.notNow}
          </button>
        </div>
      ) : null}
    </div>
  );
}
