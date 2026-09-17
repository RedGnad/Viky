"use client";
import { useEffect, useState } from "react";
import {CARD, FIELD, HELP, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON} from "./ui";
import { useAccount } from "@/src/account/provider";
import { checkPasskeySupport, passkeyFallbackWords, type PasskeySupport } from "@/src/account/passkey-support";

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
 * first (D74). `signInOnly` goes further, for a session that closed on a money screen: signing in is the only thing
 * offered, because there the other two controls can only strand the money (flows W11, 17 Sep 2026).
 */
export function AccountPanel({ returning = false, signInOnly = false }: Readonly<{ returning?: boolean; signInOnly?: boolean }>) {
  const { address, hasCredential, status, error, createAccount, signIn, signOut, useAnotherAccount, clearError } = useAccount();
  const [displayName, setDisplayName] = useState("");
  const [naming, setNaming] = useState(false);
  // Asked once, and only in the browser. A desktop with no fingerprint reader cannot make an account, and
  // finding that out by pressing the button is the worst way to find it out.
  const [support, setSupport] = useState<PasskeySupport>("checking");
  useEffect(() => {
    void checkPasskeySupport().then(setSupport);
  }, []);
  const cannot = passkeyFallbackWords(support);
  const busy = status === "busy";

  if (address) {
    return (
      <section className={CARD}>
        <p className="font-medium">You are signed in.</p>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Your account is protected by your passkey. Nothing to remember, nothing to write down.
        </p>
        <div className="flex flex-wrap gap-[var(--space-sm)]">
          <button type="button" onClick={signOut} className={INLINE_BUTTON}>
            Sign out
          </button>
          <button type="button" onClick={useAnotherAccount} className={INLINE_BUTTON}>
            Use another account
          </button>
        </div>
      </section>
    );
  }

  const signInButton = (
    <button
      type="button"
      onClick={() => void signIn()}
      disabled={busy}
      className={returning ? PRIMARY_BUTTON : SECONDARY_BUTTON}
    >
      {hasCredential ? "Sign in" : "I already have an account"}
    </button>
  );

  const makeAnAccount = (
    <form
      className="flex flex-col gap-[var(--space-md)]"
      onSubmit={(event) => {
        event.preventDefault();
        void createAccount(displayName);
      }}
    >
      <button type="submit" disabled={busy || cannot !== null} className={returning ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
        {busy ? "One moment" : "Create my account"}
      </button>
      <p className={HELP}>
        {cannot ?? "Your face or your fingerprint, and nothing to remember. No password, no code by text."}
      </p>

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
        <button type="button" onClick={() => setNaming(true)} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
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
          <p className={HELP}>The same passkey you made your account with.</p>
        </>
      ) : returning ? (
        <>
          {signInButton}
          <p className={HELP}>
            The same passkey you made your account with. Making another account here would leave your gift and your
            payment on the first one.
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
          className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}
        >
          Use another account
        </button>
      ) : null}

      {error ? (
        <div role="alert" className="space-y-[var(--space-sm)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)]">
          <p>{error.guidance}</p>
          {error.code === "UNSUPPORTED_BROWSER" && /Android/i.test(navigator.userAgent) ? (
            <a
              className={`${INLINE_BUTTON} font-medium`}
              href={`intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`}
            >
              Open this page in Chrome
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
