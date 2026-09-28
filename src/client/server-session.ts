import type { LocalAccount } from "viem";
import { ApiError, deleteJson, getJson, postJson } from "./api";

/**
 * Signs the browser in to Viky's server with the passkey account: a challenge signed silently by the
 * session key becomes a twelve-hour cookie. No prompt, no money, no key leaves the page.
 */

type Challenge = { challenge: string; message: string; account: string; expiresAt: string };
type Session = { account: string; expiresAt: string };

export async function signInToServer(account: LocalAccount): Promise<Session> {
  const challenge = await postJson<Challenge>("/api/account/challenge", { account: account.address });
  const signature = await account.signMessage({ message: challenge.message });
  return postJson<Session>("/api/account/session", { challenge: challenge.challenge, signature });
}

export async function currentServerSession(): Promise<Session | null> {
  try {
    return await getJson<Session>("/api/account/session");
  } catch {
    return null;
  }
}

/**
 * Whether the server still knows this browser, told apart from not being able to ask: only the server's own "sign in
 * first" (401) says the session is gone; a network that fails says nothing, and nothing is changed on it.
 */
export async function serverStillKnows(): Promise<Session | "gone" | "unknown"> {
  try {
    return await getJson<Session>("/api/account/session");
  } catch (error) {
    return error instanceof ApiError && error.status === 401 ? "gone" : "unknown";
  }
}

/** Told to every tab of this browser when one of them signs out, so none keeps showing an account the server forgot. */
export const ACCOUNT_CHANNEL = "viky-account";

export function tellOtherTabsSignedOut(): void {
  try {
    const channel = new BroadcastChannel(ACCOUNT_CHANNEL);
    channel.postMessage("signed-out");
    channel.close();
  } catch {
    // A browser without the channel: each tab learns it the next time it comes to the front.
  }
}

export async function signOutOfServer(): Promise<void> {
  try {
    await deleteJson("/api/account/session");
  } catch {
    // The cookie may already be gone; nothing else to clean.
  }
}
