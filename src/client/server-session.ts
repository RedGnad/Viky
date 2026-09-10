import type { LocalAccount } from "viem";
import { deleteJson, getJson, postJson } from "./api";

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

export async function signOutOfServer(): Promise<void> {
  try {
    await deleteJson("/api/account/session");
  } catch {
    // The cookie may already be gone; nothing else to clean.
  }
}
