"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CARD, FIELD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON } from "./ui";
import { useDoor, useMadeHere, useOnAComputer } from "@/src/account/door";
import { accountError } from "@/src/account/errors";
import { useAccount } from "@/src/account/provider";
import { ACCOUNT_DOOR as W } from "@/src/sentences";
import { CopyThisLink, Elsewhere, MadeOnTheMainSite, Outdated } from "../kit/AccountDoor";

/**
 * Creating an account, or coming back to one. Consumer words only.
 *
 * Two things changed in the design pass, and both were the same mistake. The first thing on the card used to
 * be an optional field for naming the device, so the first thing a person met in Viky was a question that
 * does not matter: it is behind a disclosure now, which is what progressive disclosure is for. And the
 * primary action ran to two lines on a 375 pixel phone, which is a label problem rather than a layout one:
 * it says what it does, and how it does it moved to the line underneath.
 *
 * `returning` swaps which of the two leads. Somebody whose session closed in the middle of paying for a gift is not
 * making an account, they are coming back to one, and making a second would leave the gift and the payment on the
 * first (D74); so is anybody on a device that remembers a passkey. `signInOnly` goes further, for a session that
 * closed on a money screen: signing in is the only thing offered, because there the other two controls can only strand
 * the money (flows W11, 17 Sep 2026).
 *
 * The door is read before any of it (src/account/passkey-support.ts, the founder, 1 Oct 2026). A page inside another
 * app's page makes no account, so the whole panel is one button there, which opens the same link in the phone's own
 * browser, and the link to copy under it (app/kit/AccountDoor.tsx); an iPhone too old for a passkey is told to
 * update. Anywhere else the button is never grey: a phone that says it has no platform authenticator is often wrong,
 * so the gesture decides and a failure says what to do.
 */
export function AccountPanel({ returning = false, signInOnly = false }: Readonly<{ returning?: boolean; signInOnly?: boolean }>) {
  const { address, hasCredential, status, error, createAccount, signIn, signOut, useAnotherAccount, clearError } = useAccount();
  const [displayName, setDisplayName] = useState("");
  const [naming, setNaming] = useState(false);
  const door = useDoor();
  // No account is made on an address that is not Viky's own: there the panel offers signing in, and the way to viky.cash.
  const madeHere = useMadeHere();
  const computer = useOnAComputer();
  // On a gift the link carries the gift's key, so it is the link that is named and copied, never the site.
  const onGift = (usePathname() ?? "").startsWith("/g/");
  const busy = status === "busy";
  // A computer that found no sensor is told before the press, and is still let through: a security key makes a passkey too.
  const noSensor = door.kind === "unsure" && door.handset === "other";
  // A phone that did not say it can: nothing is said until a try fails, and then what to do is.
  const phone = door.kind === "unsure" && door.handset !== "other" ? door.handset : null;

  if (address) {
    return (
      <section className={CARD}>
        <p className="font-medium">You are signed in.</p>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Your account is protected by your passkey. Nothing to remember, nothing to write down.
        </p>
        <div className="flex flex-wrap gap-[var(--space-sm)]">
          <button type="button" onClick={signOut} className={SMALL_BUTTON}>
            Sign out
          </button>
          <button type="button" onClick={useAnotherAccount} className={SMALL_BUTTON}>
            Use another account
          </button>
        </div>
      </section>
    );
  }

  if (door.kind === "outdated") return <Outdated />;
  if (door.kind === "elsewhere") return <Elsewhere handset={door.handset} app={door.app} />;

  const signInButton = (
    <button
      type="button"
      onClick={() => void signIn()}
      disabled={busy}
      className={returning ? PRIMARY_BUTTON : SECONDARY_BUTTON}
    >
      {/* One label whether or not this device knows a passkey: what the press does is sign in (the founder, 4 Oct 2026). */}
      Sign in
    </button>
  );

  const makeAnAccount = !madeHere ? (
    <MadeOnTheMainSite />
  ) : (
    <form
      className="flex flex-col gap-[var(--space-md)]"
      onSubmit={(event) => {
        event.preventDefault();
        void createAccount(displayName);
      }}
    >
      <button type="submit" disabled={busy} className={returning ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
        {busy ? "One moment" : "Create my account"}
      </button>
      {/* One sentence, not two saying the same thing: what it is, rather than what it is not (NN/g, concise). Where
          the computer has nothing to make a passkey with, what it lacks and what to do, a line each. */}
      {/* On a computer with something to make a passkey with: which choice of the system's sheet follows the person. */}
      {(noSensor ? W.computer(onGift) : computer ? [W.how, W.onAComputer] : [W.how]).map((line) => (
        <p key={line} className={HELP}>
          {line}
        </p>
      ))}
      {/* Viky is for adults, the person a gift is for as the person who offers it (the founder, 4 Oct 2026). */}
      <p className={HELP} data-adult="">
        {W.adult}
      </p>
      {noSensor ? <CopyThisLink browser={null} /> : null}

      {naming ? (
        <>
          <label className={HELP} htmlFor="display-name">
            A name for this account on your device
          </label>
          <input
            id="display-name"
            name="displayName"
            autoComplete="off"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              if (error) clearError();
            }}
            className={FIELD}
            placeholder="Viky account"
            disabled={busy}
          />
          <p className={HELP}>Only your device uses it, to label your passkey. Viky never receives it.</p>
        </>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className={`${SMALL_BUTTON} self-start`}>
          Name this device (optional)
        </button>
      )}
    </form>
  );

  return (
    <section className={CARD}>
      {signInOnly ? (
        <>
          {signInButton}
          <p className={HELP}>{W.samePasskey}</p>
        </>
      ) : returning ? (
        <>
          {signInButton}
          <p className={HELP}>
            {W.samePasskey} {W.another}
          </p>
          {makeAnAccount}
        </>
      ) : (
        <>
          {makeAnAccount}
          {signInButton}
        </>
      )}

      {hasCredential && !signInOnly ? (
        <button
          type="button"
          onClick={useAnotherAccount}
          disabled={busy}
          className={`${SMALL_BUTTON} self-start`}
        >
          Use another account
        </button>
      ) : null}

      {error ? (
        <div role="alert" className="space-y-[var(--space-sm)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)]">
          {/* Where signing in is the only thing offered, a closed prompt is not answered with "create one": a second
              account would not hold what the first one does (D74). */}
          <p>{signInOnly && error.code === "NO_CREDENTIAL" ? accountError("PASSKEY_CANCELLED").guidance : error.guidance}</p>
          {phone ? <p>{W.ifItKeepsFailing[phone](onGift)}</p> : null}
          {phone ? <CopyThisLink browser={phone === "iphone" ? "safari" : "chrome"} /> : null}
        </div>
      ) : null}
    </section>
  );
}

