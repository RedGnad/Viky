import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import type { Address, LocalAccount } from "viem";
import { ceremonyClient, endConsentKey, takeKeyKept } from "../client/consent-key";
import { deriveEvmPrivateKey } from "./derive";
import { defaultPasskeyLabel } from "./passkey-label";
import { accountError, passkeyEnvironmentProblem, toAccountError } from "./errors";
import { readRecord, recordOf, type KeptRecord } from "./key-kept";
import { accountsAreMadeOn } from "./passkey-support";

/**
 * The whole account layer: a passkey (Face ID, fingerprint, security key) whose PRF output derives
 * an ordinary Monad account. No seed phrase is ever shown, no key ever leaves the browser, no
 * server holds anything. The key lives in memory only while a signing session is open.
 */

export const CREDENTIAL_STORAGE_KEY = "viky.credential";
/** Where this device's passkey is kept, as its last ceremony said it (src/account/key-kept.ts). Never sent anywhere. */
export const KEY_KEPT_STORAGE_KEY = "viky.key.kept";
export const RELYING_PARTY_NAME = "Viky";
/**
 * How long an unused signing session stays open, in minutes, on an ordinary screen and on a money screen.
 *
 * Ten was the only length, and it was shorter than the task it guarded: placing an order with a payout service
 * or paying by card takes longer, and the session closed under the person mid way (D74, D80). Money screens ask
 * for thirty (decision 2 of the design pass, 17 Sep 2026), everything else keeps ten. The length in force is
 * shown on screen through `sessionIdleMinutes()`, so the sentence and the timer can never disagree.
 */
export const DEFAULT_IDLE_MINUTES = 10;
export const MONEY_SCREEN_IDLE_MINUTES = 30;

/**
 * The passkey this page signed in with, kept in memory beside the browser's storage (the audit of 1 Oct 2026): a
 * browser whose storage refuses writes, or lost them, still knows which passkey is its own until the page goes.
 */
let remembered: PasskeyCredentialMetadata | undefined;
let idleMinutes = DEFAULT_IDLE_MINUTES;
let session: Secp256k1SigningSession | undefined;
let account: LocalAccount | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let idleDeadlineMs: number | undefined;
const listeners = new Set<() => void>();

/** The length in force now, for a screen to print beside its countdown. */
export function sessionIdleMinutes(): number {
  return idleMinutes;
}

/**
 * Changes how long the open session may stay unused, and re-arms it at once when one is open. A money screen
 * sets thirty on entry and puts ten back on leaving, so the longer length never outlives the screen that needed it.
 */
export function setSessionIdleMinutes(minutes: number): void {
  idleMinutes = minutes;
  if (account) armIdleTimer();
  notify();
}

function requireBrowser(): void {
  if (typeof window === "undefined") throw accountError("NOT_IN_BROWSER");
}

/** Whether this page is Viky's own app, installed on the phone's home screen: on an iPhone it names itself as no browser does. */
export function installedOnTheHomeScreen(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/** Refuses, with guidance, the browsers where the passkey prompt would never come back. */
function requirePasskeyCapableBrowser(): void {
  requireBrowser();
  const problem = passkeyEnvironmentProblem(window.navigator.userAgent, typeof window.PublicKeyCredential !== "undefined", installedOnTheHomeScreen());
  if (problem) throw accountError(problem);
}

/** React subscribes here (useSyncExternalStore); every session or credential change notifies. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** The relying party id is the hostname the app is served from; passkeys are bound to it forever. */
export function relyingPartyId(): string {
  requireBrowser();
  return window.location.hostname;
}

export function storedCredential(): PasskeyCredentialMetadata | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!raw) return remembered;
    const parsed = JSON.parse(raw) as Partial<PasskeyCredentialMetadata>;
    if (typeof parsed.credentialId !== "string" || parsed.credentialId.length === 0) return remembered;
    return { credentialId: parsed.credentialId, transports: parsed.transports };
  } catch {
    return remembered;
  }
}

function rememberCredential(credential: PasskeyCredentialMetadata): void {
  remembered = credential;
  try {
    window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(credential));
  } catch {
    // Storage can be unavailable (private mode). The passkey still exists; sign-in then uses the
    // discoverable flow and the platform picker.
  }
  notify();
}

export function hasStoredCredential(): boolean {
  return storedCredential() !== undefined;
}

/** Read once from the device, then held here: the screens read the same object until a ceremony says otherwise. */
let kept: KeptRecord | null | undefined;

/** Where the passkey this device signs in with is kept, or nothing when no ceremony said. */
export function keyKept(): KeptRecord | null {
  if (typeof window === "undefined") return null;
  if (kept === undefined) {
    try {
      kept = readRecord(window.localStorage.getItem(KEY_KEPT_STORAGE_KEY));
    } catch {
      kept = null;
    }
  }
  return kept && kept.credentialId === storedCredential()?.credentialId ? kept : null;
}

/** What the ceremony just finished said of the passkey now remembered. A sign-in keeps the store's name creation gave. */
function rememberKeyKept(credentialId: string): void {
  const next = recordOf(credentialId, takeKeyKept(), keyKept());
  if (!next) return;
  kept = next;
  try {
    window.localStorage.setItem(KEY_KEPT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A browser that keeps nothing still says it until the page goes.
  }
  notify();
}

function armIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  const timeoutMs = idleMinutes * 60_000;
  idleDeadlineMs = Date.now() + timeoutMs;
  idleTimer = setTimeout(signOut, timeoutMs);
}

/**
 * When the open session closes itself if nothing else is signed. Every signature pushes it back, so a
 * screen that shows it reads this again rather than counting down from a remembered value.
 */
export function sessionExpiresAtMs(): number | undefined {
  return account ? idleDeadlineMs : undefined;
}

/**
 * Opens the signing session from a passkey's output. `only` names the one account it may open: a passkey that derives
 * another is refused before anything is opened or announced, and the consent key the same ceremony made is dropped
 * with it, so no screen ever shows one account while a key signs for another.
 */
function openSession(prfOutput: Uint8Array, only?: Address): Address {
  const privateKey = deriveEvmPrivateKey(prfOutput);
  prfOutput.fill(0);
  let opened: Secp256k1SigningSession;
  try {
    opened = createSecp256k1SigningSession({ privateKey });
  } finally {
    privateKey.fill(0);
  }
  const candidate = toViemAccount(opened);
  if (only && candidate.address.toLowerCase() !== only.toLowerCase()) {
    opened.end();
    endConsentKey();
    throw accountError("OTHER_ACCOUNT");
  }
  // The account's own key only: the consent key was just kept by the same ceremony and stays (src/client/consent-key.ts).
  closeAccountSession();
  session = opened;
  account = candidate;
  armIdleTimer();
  notify();
  return account.address;
}

/** Label shown by the passkey provider when no name is given: said with when it was made (src/account/passkey-label.ts). */
export { DEFAULT_PASSKEY_LABEL } from "./passkey-label";

/** Creates a new passkey and opens a session. One biometric prompt, sometimes two on older authenticators. */
export async function createAccount(displayName: string): Promise<Address> {
  requirePasskeyCapableBrowser();
  // Whatever screen asks: no passkey is made on an address that is not Viky's own (src/account/passkey-support.ts).
  if (!accountsAreMadeOn(window.location.hostname)) throw accountError("MADE_ELSEWHERE");
  // The label only lives in the passkey provider (iCloud Keychain, Google Password Manager); it is
  // never sent to Viky's server, never stored by the app and never written on chain.
  const name = displayName.trim() || defaultPasskeyLabel();
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: relyingPartyId(), name: RELYING_PARTY_NAME },
      user: { name, displayName: name },
      // The consent key is asked in the same ceremony, as a second salt: no prompt is added.
      webAuthnClient: ceremonyClient(),
    });
    rememberCredential({ credentialId: created.credentialId, transports: created.transports });
    rememberKeyKept(created.credentialId);
    return openSession(created.prfOutput);
  } catch (error) {
    takeKeyKept();
    throw toAccountError(error);
  }
}

/**
 * Reopens the account from an existing passkey. Falls back to the platform picker when nothing is stored.
 *
 * `as` is the account the server's cookie names, asked for while the passkey answers, never before it: the prompt
 * must open inside the press. With it, only that account is opened (`OTHER_ACCOUNT` otherwise), and a cookie that
 * names nobody opens nothing (`SESSION_ENDED`). A passkey that is refused is not remembered either.
 */
export async function signIn(options: { as?: Promise<Address | null> } = {}): Promise<Address> {
  requirePasskeyCapableBrowser();
  const known = storedCredential();
  try {
    const result = await getPasskeyPrfOutput({ rpId: relyingPartyId(), credential: known, webAuthnClient: ceremonyClient() });
    let only: Address | undefined;
    if (options.as) {
      const named = await options.as.catch(() => null);
      if (!named) {
        result.prfOutput.fill(0);
        endConsentKey();
        throw accountError("SESSION_ENDED");
      }
      only = named;
    }
    const address = openSession(result.prfOutput, only);
    if (!known || known.credentialId !== result.credentialId) {
      rememberCredential({ credentialId: result.credentialId });
    }
    rememberKeyKept(result.credentialId);
    return address;
  } catch (error) {
    takeKeyKept();
    const failure = toAccountError(error);
    // A prompt closed on a device that knows no account (the founder, 5 Oct 2026): with no passkey for Viky here the
    // browser offers another device or a security key, and "try again" leads back to that same sheet. What happened
    // and what to do, instead. A session the server names is another matter: that account exists.
    if (!known && !options.as && failure.code === "PASSKEY_CANCELLED") throw accountError("NO_CREDENTIAL");
    throw failure;
  }
}

/**
 * The passkey evaluated under another salt than the account's, for a key that is not the account's (the private
 * space, D202). One face or fingerprint prompt, restricted to the passkey this device signed in with, so the answer is
 * that account's and never another passkey's. Nothing is kept: the caller owns the bytes and zeroes them.
 */
export async function passkeyOutputFor(prfSalt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  requirePasskeyCapableBrowser();
  const known = storedCredential();
  if (!known) throw accountError("PASSKEY_CANCELLED");
  try {
    const result = await getPasskeyPrfOutput({ rpId: relyingPartyId(), credential: known, prfSalt });
    if (result.credentialId !== known.credentialId) {
      result.prfOutput.fill(0);
      throw accountError("PASSKEY_CANCELLED");
    }
    return result.prfOutput;
  } catch (error) {
    throw toAccountError(error);
  }
}

/** Zeroes the key. Called on sign-out and after ten idle minutes. */
/**
 * Closes the session and forgets the account. `quiet` does it without telling the screens (D258): a sign-out that is
 * about to load the landing as a new document must not redraw the page it leaves as a page for nobody first.
 */
export function signOut({ quiet = false }: { quiet?: boolean } = {}): void {
  closeAccountSession({ quiet });
  // The consent key goes with the account, on a sign-out and after the idle minutes alike.
  endConsentKey();
}

function closeAccountSession({ quiet = false }: { quiet?: boolean } = {}): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  const wasSignedIn = account !== undefined;
  session?.end();
  session = undefined;
  account = undefined;
  idleDeadlineMs = undefined;
  if (wasSignedIn && !quiet) notify();
}

/** The live viem account, or undefined when signed out. Touching it extends the idle timer. */
export function currentAccount(): LocalAccount | undefined {
  if (!account) return undefined;
  armIdleTimer();
  return account;
}

export function currentAddress(): Address | undefined {
  return account?.address;
}

export function isSignedIn(): boolean {
  return account !== undefined;
}

/** Forgets the stored credential on this device. The passkey itself stays with the authenticator. */
export function forgetCredential(): void {
  signOut();
  remembered = undefined;
  kept = null;
  try {
    window.localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
    window.localStorage.removeItem(KEY_KEPT_STORAGE_KEY);
  } catch {
    // nothing to forget
  }
  notify();
}
