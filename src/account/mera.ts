import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import type { Address, LocalAccount } from "viem";
import { deriveEvmPrivateKey } from "./derive";
import { accountError, passkeyEnvironmentProblem, toAccountError } from "./errors";

/**
 * The whole account layer: a passkey (Face ID, fingerprint, security key) whose PRF output derives
 * an ordinary Monad account. No seed phrase is ever shown, no key ever leaves the browser, no
 * server holds anything. The key lives in memory only while a signing session is open.
 */

export const CREDENTIAL_STORAGE_KEY = "viky.credential";
export const RELYING_PARTY_NAME = "Viky";
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
/** How long an unused signing session stays open. Shown on screen, so the person knows what is open. */
export const SESSION_IDLE_MINUTES = IDLE_TIMEOUT_MS / 60_000;

let session: Secp256k1SigningSession | undefined;
let account: LocalAccount | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let idleDeadlineMs: number | undefined;
const listeners = new Set<() => void>();

function requireBrowser(): void {
  if (typeof window === "undefined") throw accountError("NOT_IN_BROWSER");
}

/** Refuses, with guidance, the browsers where the passkey prompt would never come back. */
function requirePasskeyCapableBrowser(): void {
  requireBrowser();
  const problem = passkeyEnvironmentProblem(window.navigator.userAgent, typeof window.PublicKeyCredential !== "undefined");
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
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<PasskeyCredentialMetadata>;
    if (typeof parsed.credentialId !== "string" || parsed.credentialId.length === 0) return undefined;
    return { credentialId: parsed.credentialId, transports: parsed.transports };
  } catch {
    return undefined;
  }
}

function rememberCredential(credential: PasskeyCredentialMetadata): void {
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

function armIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleDeadlineMs = Date.now() + IDLE_TIMEOUT_MS;
  idleTimer = setTimeout(signOut, IDLE_TIMEOUT_MS);
}

/**
 * When the open session closes itself if nothing else is signed. Every signature pushes it back, so a
 * screen that shows it reads this again rather than counting down from a remembered value.
 */
export function sessionExpiresAtMs(): number | undefined {
  return account ? idleDeadlineMs : undefined;
}

function openSession(prfOutput: Uint8Array): Address {
  signOut();
  const privateKey = deriveEvmPrivateKey(prfOutput);
  prfOutput.fill(0);
  try {
    session = createSecp256k1SigningSession({ privateKey });
  } finally {
    privateKey.fill(0);
  }
  account = toViemAccount(session);
  armIdleTimer();
  notify();
  return account.address;
}

/** Creates a new passkey and opens a session. One biometric prompt, sometimes two on older authenticators. */
/** Label shown by the passkey provider when the person leaves the optional name empty. */
export const DEFAULT_PASSKEY_LABEL = "Viky account";

export async function createAccount(displayName: string): Promise<Address> {
  requirePasskeyCapableBrowser();
  // The label only lives in the passkey provider (iCloud Keychain, Google Password Manager); it is
  // never sent to Viky's server, never stored by the app and never written on chain.
  const name = displayName.trim() || DEFAULT_PASSKEY_LABEL;
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: relyingPartyId(), name: RELYING_PARTY_NAME },
      user: { name, displayName: name },
    });
    rememberCredential({ credentialId: created.credentialId, transports: created.transports });
    return openSession(created.prfOutput);
  } catch (error) {
    throw toAccountError(error);
  }
}

/** Reopens the account from an existing passkey. Falls back to the platform picker when nothing is stored. */
export async function signIn(): Promise<Address> {
  requirePasskeyCapableBrowser();
  const known = storedCredential();
  try {
    const result = await getPasskeyPrfOutput({ rpId: relyingPartyId(), credential: known });
    if (!known || known.credentialId !== result.credentialId) {
      rememberCredential({ credentialId: result.credentialId });
    }
    return openSession(result.prfOutput);
  } catch (error) {
    throw toAccountError(error);
  }
}

/** Zeroes the key. Called on sign-out and after ten idle minutes. */
export function signOut(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  const wasSignedIn = account !== undefined;
  session?.end();
  session = undefined;
  account = undefined;
  idleDeadlineMs = undefined;
  if (wasSignedIn) notify();
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
  try {
    window.localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
  } catch {
    // nothing to forget
  }
  notify();
}
