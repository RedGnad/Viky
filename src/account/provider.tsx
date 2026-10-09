"use client";
import { askForTheDoor } from "./door-asked";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import { ACCOUNT_CHANNEL, currentServerSession, serverStillKnows, signInToServer, signOutOfServer, tellOtherTabsSignedOut } from "../client/server-session";
import { heroCookieCleared } from "../hero-cookie";
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
  /**
   * The account that can sign, made here when this device has none (the audit of 1 Oct 2026): the press that pays is
   * the one that makes a first funder's account, which `ensureSigner` never did, since it only opens a passkey that
   * exists. `existing` is somebody who says they already have one, on another device: the passkey is asked for and
   * none is made.
   */
  ensureAccount: (options?: { existing?: boolean }) => Promise<LocalAccount>;
  /**
   * The passkey asked again, whatever is already open, for a gesture that cannot be undone (ending a gift, the audit
   * of 1 Oct 2026). It answers the key only if the passkey is the signed-in account's: another person holding the
   * phone with the session open cannot end somebody's gift with a press.
   */
  confirmWithPasskey: () => Promise<LocalAccount>;
  createAccount: (displayName: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  /** The server answered "sign in first" for this browser: the screen becomes the signed-out one, the passkey kept. */
  serverForgot: () => void;
  /**
   * Signs out from a screen and goes to the landing (D258): the server's session is closed first while the screen
   * stays as it is, then the landing loads as a new document, which the browser paints over the old one only when it
   * is ready, so no screen for nobody shows in between; and it is a new visit, so the hero moment plays again.
   */
  leave: () => Promise<void>;
  /**
   * Signs out and lets go of the passkey this device remembers, so the next sign-in offers the choice again.
   * Someone who holds two accounts, a funder and a recipient, had no way back to the other one: sign-in
   * always reused the remembered passkey and nothing on screen said which account that was.
   */
  useAnotherAccount: () => Promise<void>;
  clearError: () => void;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

const noAddress = () => undefined;
const noCredential = () => false;
const noKeyKept = () => null;

/** Where this device's passkey is kept, as its last ceremony said it (src/account/key-kept.ts): nothing until one did. */
export function useKeyKept() {
  return useSyncExternalStore(mera.subscribe, mera.keyKept, noKeyKept);
}

export function AccountProvider({ initialAccount, children }: { initialAccount?: Address; children: ReactNode }) {
  // The account module is the source of truth; React mirrors it. The server snapshot is always
  // "signed out", so the first paint matches on both sides.
  const signedInAddress = useSyncExternalStore(mera.subscribe, mera.currentAddress, noAddress);
  const hasCredential = useSyncExternalStore(mera.subscribe, mera.hasStoredCredential, noCredential);
  const [status, setStatus] = useState<AccountStatus>("idle");
  const [error, setError] = useState<AccountError | undefined>(undefined);
  /**
   * Who the server says is signed in, and the server says it first (D156): the root layout reads the session cookie
   * while it renders, so a signed-in person's screen is drawn as theirs from its first byte. Before this the page
   * came as the page for nobody and became theirs once the browser had asked, which on a phone was a landing that
   * showed for half a second and then loaded again as Home. The browser still asks below, and its answer wins.
   */
  const [serverSessionFor, setServerSessionFor] = useState<Address | undefined>(initialAccount);

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

  /**
   * A session the server forgot is a sign-out on this screen too (the founder, 28 Sep 2026: signed out in one tab, he
   * came back to another that still showed his account, and "Back to my gifts" said the gifts could not be loaded).
   * Told by another tab of this browser the moment it signs out, and asked again of the server whenever this tab comes
   * back to the front; only the server's own "sign in first" counts, never a network that failed to answer.
   */
  const serverForgot = useCallback(() => {
    mera.signOut({ quiet: true });
    setServerSessionFor(undefined);
  }, []);
  useEffect(() => {
    if (!serverSessionFor) return;
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(ACCOUNT_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data === "signed-out") serverForgot();
      };
    } catch {
      channel = undefined;
    }
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void serverStillKnows().then((known) => {
        if (known === "gone") serverForgot();
      });
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      channel?.close();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [serverSessionFor, serverForgot]);

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
      // The server's session follows the passkey whenever it does not already name this account, a first one included
      // (D298): before, only a session for another account was replaced, so a person who opened their passkey from the
      // pay sheet with no session at all had none, and every step after it was refused ("Account authentication is
      // required" on the waiting screen, "your gifts could not be loaded" behind it).
      if (account.address !== serverSessionFor) {
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

  /**
   * The key already open; else the passkey this device remembers, or the one the person says they have; else a new
   * passkey, which is a new account. The server's session is made to name it in all three, and a failure is the typed
   * error, thrown again for the screen that asked. A key this opened is closed again when the server could not be
   * told, so no screen stands signed in on a session that does not exist.
   */
  const ensureAccount = useCallback(
    async ({ existing = false }: { existing?: boolean } = {}) => {
      setStatus("busy");
      setError(undefined);
      const open = mera.currentAccount();
      try {
        if (!open) await withTimeout(existing || mera.hasStoredCredential() ? mera.signIn() : mera.createAccount(""), CEREMONY_TIMEOUT_MS);
        const account = open ?? mera.currentAccount();
        if (!account) throw accountError("TIMED_OUT");
        // An open key whose session the server already names is asked nothing more; a passkey just answered always is.
        if (!open || account.address !== serverSessionFor) await withTimeout(signInToServer(account), SERVER_TIMEOUT_MS);
        setServerSessionFor(account.address);
        return account;
      } catch (caught) {
        if (!open) {
          mera.signOut();
          setServerSessionFor(undefined);
        }
        const failure = toAccountError(caught);
        setError(failure);
        throw failure;
      } finally {
        setStatus("idle");
      }
    },
    [serverSessionFor],
  );

  const confirmWithPasskey = useCallback(async () => {
    setStatus("busy");
    setError(undefined);
    try {
      // Always a ceremony, and only as the account the server names: `OTHER_ACCOUNT` for any other passkey.
      await withTimeout(mera.signIn({ as: currentServerSession().then((session) => (session ? (session.account as Address) : null)) }), CEREMONY_TIMEOUT_MS);
      const account = mera.currentAccount();
      if (!account) throw accountError("TIMED_OUT");
      return account;
    } catch (caught) {
      const failure = toAccountError(caught);
      setError(failure);
      throw failure;
    } finally {
      setStatus("idle");
    }
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      address,
      hasCredential,
      reach,
      ensureSigner,
      ensureAccount,
      confirmWithPasskey,
      status,
      error,
      createAccount: (displayName) => run(() => mera.createAccount(displayName)),
      signIn: () => run(() => mera.signIn()),
      signOut: () => {
        mera.signOut();
        setServerSessionFor(undefined);
        void signOutOfServer().then(tellOtherTabsSignedOut);
      },
      serverForgot,
      leave: async () => {
        await signOutOfServer();
        tellOtherTabsSignedOut();
        mera.signOut({ quiet: true });
        try {
          document.cookie = heroCookieCleared(window.location.protocol === "https:");
        } catch {
          // A browser that refuses the cookie keeps the moment as played, which is what it had.
        }
        // The landing, and nothing opened on it (the founder, 9 Oct 2026): the door is what "Other account" asks for,
        // and the two did the same thing on the screen.
        // A document load on purpose, not a client navigation: the browser keeps painting this page until the landing
        // is ready (paint holding), where a client navigation redrew this page for nobody while it waited (D258).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      },
      useAnotherAccount: async () => {
        setError(undefined);
        await signOutOfServer();
        tellOtherTabsSignedOut();
        mera.forgetCredential();
        // Straight to the account's door, which the landing opens as it arrives: it used to leave the page of an
        // account drawn for nobody, where "Sign in" had to be pressed again (the founder, 4 Oct 2026).
        askForTheDoor();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      },
      clearError: () => setError(undefined),
    }),
    [address, hasCredential, reach, ensureSigner, ensureAccount, confirmWithPasskey, status, error, run, serverForgot],
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
      ensureAccount: () => Promise.reject(accountError("NOT_IN_BROWSER")),
      confirmWithPasskey: () => Promise.reject(accountError("NOT_IN_BROWSER")),
      status: "idle",
      error: undefined,
      createAccount: async () => undefined,
      signIn: async () => undefined,
      signOut: () => undefined,
      serverForgot: () => undefined,
      leave: async () => undefined,
      useAnotherAccount: async () => undefined,
      clearError: () => undefined,
    }),
    [],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
