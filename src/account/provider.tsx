"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import { currentServerSession, signInToServer, signOutOfServer } from "../client/server-session";
import { type AccountError, accountError, toAccountError } from "./errors";
import { announcedAccount, sessionReach, type SessionReach } from "./session-gate";
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
  /**
   * What this browser may do right now: nothing, read as this account (the server's cookie), or also sign (the
   * passkey's key is open). A screen that only reads never asks for a passkey to draw itself.
   */
  reach: SessionReach;
  status: AccountStatus;
  error: AccountError | undefined;
  /**
   * The account that can sign, opening the passkey once if the key is not in memory. Every money path calls this
   * rather than reaching for the key, so coming back from a reload or another tab asks for a passkey at the moment
   * a signature is needed and not before.
   */
  ensureSigner: () => Promise<LocalAccount>;
  createAccount: (displayName: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  /**
   * Signs out and lets go of the passkey this device remembers, so the next sign-in offers the choice again.
   * Someone who holds two accounts, a funder and a recipient, had no way back to the other one: sign-in
   * always reused the remembered passkey and nothing on screen said which account that was.
   */
  useAnotherAccount: () => void;
  clearError: () => void;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

const noAddress = () => undefined;
const noCredential = () => false;

export function AccountProvider({ children }: { children: ReactNode }) {
  // The account module is the source of truth; React mirrors it. The server snapshot is always
  // "signed out", so the first paint matches on both sides.
  const signedInAddress = useSyncExternalStore(mera.subscribe, mera.currentAddress, noAddress);
  const hasCredential = useSyncExternalStore(mera.subscribe, mera.hasStoredCredential, noCredential);
  const [status, setStatus] = useState<AccountStatus>("idle");
  const [error, setError] = useState<AccountError | undefined>(undefined);
  const [serverSessionFor, setServerSessionFor] = useState<Address | undefined>(undefined);

  // The cookie already names this browser's account for twelve hours, so the page asks the server who it is at load
  // rather than treating a reload as a sign-out. No passkey, no prompt, nothing signed.
  useEffect(() => {
    let live = true;
    void currentServerSession().then((session) => {
      if (live && session) setServerSessionFor(session.account as Address);
    });
    return () => {
      live = false;
    };
  }, []);

  const address = announcedAccount(signedInAddress, serverSessionFor);
  const reach = sessionReach(signedInAddress, serverSessionFor);

  const run = useCallback(async (action: () => Promise<Address>) => {
    setStatus("busy");
    setError(undefined);
    try {
      await withTimeout(action(), CEREMONY_TIMEOUT_MS);
      // The passkey account also signs the browser in to Viky's server, silently: the session cookie is
      // what lets every later step name the account without ever taking it from a form.
      const account = mera.currentAccount();
      if (account) {
        await withTimeout(signInToServer(account), SERVER_TIMEOUT_MS);
        setServerSessionFor(account.address);
      }
    } catch (caught) {
      mera.signOut();
      setServerSessionFor(undefined);
      setError(toAccountError(caught));
    } finally {
      setStatus("idle");
    }
  }, []);

  /**
   * Opens the signing session when it is not open, and refuses to sign as anybody but the account the server named:
   * a person who used another passkey on this device is signed in again as that account rather than shown one
   * account while the key signs another.
   */
  const ensureSigner = useCallback(async () => {
    const open = mera.currentAccount();
    if (open) return open;
    setStatus("busy");
    setError(undefined);
    try {
      await withTimeout(mera.signIn(), CEREMONY_TIMEOUT_MS);
      const account = mera.currentAccount();
      if (!account) throw accountError("TIMED_OUT");
      if (serverSessionFor && account.address !== serverSessionFor) {
        await withTimeout(signInToServer(account), SERVER_TIMEOUT_MS);
      }
      setServerSessionFor(account.address);
      return account;
    } catch (caught) {
      const failure = toAccountError(caught);
      setError(failure);
      throw failure;
    } finally {
      setStatus("idle");
    }
  }, [serverSessionFor]);

  const value = useMemo<AccountContextValue>(
    () => ({
      address,
      hasCredential,
      reach,
      ensureSigner,
      status,
      error,
      createAccount: (displayName) => run(() => mera.createAccount(displayName)),
      signIn: () => run(() => mera.signIn()),
      signOut: () => {
        mera.signOut();
        setServerSessionFor(undefined);
        void signOutOfServer();
      },
      useAnotherAccount: () => {
        mera.forgetCredential();
        setServerSessionFor(undefined);
        setError(undefined);
        void signOutOfServer();
      },
      clearError: () => setError(undefined),
    }),
    [address, hasCredential, reach, ensureSigner, status, error, run],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}

/**
 * An account that exists only on screen, for the design laboratory at /dev/looks: the bar of destinations draws only
 * for somebody signed in, so without this the screens of a signed-in person could not be photographed at all. It can
 * sign nobody in and holds no key; every action does nothing. No product screen uses it.
 */
export function ExampleAccountProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AccountContextValue>(
    () => ({
      address: "0x000000000000000000000000000000000000dEaD",
      hasCredential: true,
      reach: "signing",
      ensureSigner: () => Promise.reject(accountError("NOT_IN_BROWSER")),
      status: "idle",
      error: undefined,
      createAccount: async () => undefined,
      signIn: async () => undefined,
      signOut: () => undefined,
      useAnotherAccount: () => undefined,
      clearError: () => undefined,
    }),
    [],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
