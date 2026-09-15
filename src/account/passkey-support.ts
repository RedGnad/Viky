/**
 * Whether this machine can make a Viky account at all.
 *
 * A passkey needs a platform authenticator: Face ID, a fingerprint reader, Windows Hello, or a Mac's Touch
 * ID. A desktop without one cannot create the account, and the honest thing is to say so on the screen rather
 * than let somebody press a button that opens a dialogue they cannot complete.
 *
 * What this cannot tell is whether the PRF extension works, which is what Viky derives the account from, and
 * that only becomes knowable by trying. So this answers the question it can answer, and the typed
 * `PRF_UNAVAILABLE` failure still carries the rest.
 */

export type PasskeySupport = "checking" | "ready" | "noAuthenticator" | "noPasskeys";

export async function checkPasskeySupport(): Promise<PasskeySupport> {
  if (typeof window === "undefined" || typeof window.PublicKeyCredential === "undefined") return "noPasskeys";
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available ? "ready" : "noAuthenticator";
  } catch {
    // A browser that refuses to answer is treated as unable, because guessing yes ends in a dialogue nobody
    // can finish.
    return "noAuthenticator";
  }
}

/** What to say, and it is the same sentence whichever of the two reasons it is: the way out is the phone. */
export function passkeyFallbackWords(support: PasskeySupport): string | null {
  if (support === "ready" || support === "checking") return null;
  return "This computer has no Face ID, fingerprint or Windows Hello, so it cannot make your account. Open viky.cash on your phone instead, and come back here afterwards if you like: the same account works on both.";
}
