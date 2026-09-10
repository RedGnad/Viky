"use client";
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address } from "viem";
import { signInToServer, signOutOfServer } from "../client/server-session";
import { type AccountError, toAccountError } from "./errors";
import * as mera from "./mera";

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
      await action();
      // The passkey account also signs the browser in to Viky's server, silently: the session cookie is
      // what lets every later step name the account without ever taking it from a form.
      const account = mera.currentAccount();
      if (account) await signInToServer(account);
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
