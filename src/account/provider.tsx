"use client";
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address } from "viem";
import { signInToServer, signOutOfServer } from "../client/server-session";
import { type AccountError, accountError, toAccountError } from "./errors";
import * as mera from "./mera";

// A passkey prompt that never comes back (in-app browsers, a dismissed system sheet the page never
// hears about) or a server that never answers must not leave "One moment" on the screen forever.
const CEREMONY_TIMEOUT_MS = 60_000;
const SERVER_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(accountError("TIMED_OUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type AccountStatus = "idle" | "busy";

export type AccountContextValue = {
  address: Address | undefined;
  hasCredential: boolean;
  status: AccountStatus;
  error: AccountError | undefined;
  createAccount: (displayName: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  clearError: () => void;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

const noAddress = () => undefined;
const noCredential = () => false;

export function AccountProvider({ children }: { children: ReactNode }) {
  // The account module is the source of truth; React mirrors it. The server snapshot is always
  // "signed out", so the first paint matches on both sides.
  const address = useSyncExternalStore(mera.subscribe, mera.currentAddress, noAddress);
  const hasCredential = useSyncExternalStore(mera.subscribe, mera.hasStoredCredential, noCredential);
  const [status, setStatus] = useState<AccountStatus>("idle");
  const [error, setError] = useState<AccountError | undefined>(undefined);

  const run = useCallback(async (action: () => Promise<Address>) => {
    setStatus("busy");
    setError(undefined);
    try {
      await withTimeout(action(), CEREMONY_TIMEOUT_MS);
      // The passkey account also signs the browser in to Viky's server, silently: the session cookie is
      // what lets every later step name the account without ever taking it from a form.
      const account = mera.currentAccount();
      if (account) await withTimeout(signInToServer(account), SERVER_TIMEOUT_MS);
    } catch (caught) {
      mera.signOut();
      setError(toAccountError(caught));
    } finally {
      setStatus("idle");
    }
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      address,
      hasCredential,
      status,
      error,
      createAccount: (displayName) => run(() => mera.createAccount(displayName)),
      signIn: () => run(() => mera.signIn()),
      signOut: () => {
        mera.signOut();
        void signOutOfServer();
      },
      clearError: () => setError(undefined),
    }),
    [address, hasCredential, status, error, run],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
