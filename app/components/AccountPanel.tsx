"use client";
import { useState } from "react";
import { useAccount } from "@/src/account/provider";

// The only account screen of the skeleton: create with Face ID or fingerprint, or sign in.
// Consumer words only: no wallet, no key, no chain.
export function AccountPanel() {
  const { address, hasCredential, status, error, createAccount, signIn, signOut, clearError } = useAccount();
  const [displayName, setDisplayName] = useState("");
  const busy = status === "busy";

  if (address) {
    return (
      <section className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <p className="font-medium">You are signed in.</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Your account is protected by your passkey. Nothing to remember, nothing to write down.
        </p>
        <button type="button" onClick={signOut} className="rounded-lg border px-4 py-2 text-sm">
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void createAccount(displayName);
        }}
      >
        <label className="block text-sm font-medium" htmlFor="display-name">
          A name for this account on your device (optional)
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
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          placeholder="Viky account"
          disabled={busy}
        />
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Only your device uses it, to label your passkey. Viky never receives it.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "One moment" : "Create my account with Face ID or fingerprint"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void signIn()}
        disabled={busy}
        className="w-full rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
      >
        {hasCredential ? "Sign in" : "I already have an account"}
      </button>

      {error ? (
        <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p>{error.guidance}</p>
          {error.code === "UNSUPPORTED_BROWSER" && /Android/i.test(navigator.userAgent) ? (
            <a
              className="inline-block rounded-lg bg-blue-600 px-3 py-1 text-white"
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
