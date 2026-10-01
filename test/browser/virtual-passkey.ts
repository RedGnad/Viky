import type { BrowserContext, Page } from "@playwright/test";

/**
 * A passkey a test can hold: Chrome's virtual authenticator, and the PRF it does not carry.
 *
 * Chrome's virtual authenticator answers the ceremonies and keeps the credential, but carries no PRF secret across an
 * export (measured on 23 Sep 2026), and Viky derives the account from the PRF. So a script in the page answers it: the
 * same output for the same passkey and salt, as a synced passkey gives on a phone, both salts answered.
 */
export const AUTHENTICATOR = { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true } as const;

export const prfStandIn = (seed: string) => `(() => {
  const encoder = new TextEncoder();
  const bytes = (source) => source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  async function prf(rawId, salt) {
    const key = await crypto.subtle.importKey("raw", encoder.encode(${JSON.stringify(seed)}), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const id = bytes(rawId), s = bytes(salt);
    const data = new Uint8Array(id.length + s.length);
    data.set(id, 0);
    data.set(s, id.length);
    return crypto.subtle.sign("HMAC", key, data);
  }
  for (const method of ["create", "get"]) {
    const real = navigator.credentials[method].bind(navigator.credentials);
    navigator.credentials[method] = async (options) => {
      const credential = await real(options);
      const asked = options && options.publicKey && options.publicKey.extensions && options.publicKey.extensions.prf && options.publicKey.extensions.prf.eval;
      if (credential && asked && asked.first) {
        const results = { first: await prf(credential.rawId, asked.first) };
        if (asked.second) results.second = await prf(credential.rawId, asked.second);
        const before = credential.getClientExtensionResults();
        Object.defineProperty(credential, "getClientExtensionResults", { value: () => ({ ...before, prf: { enabled: true, results } }) });
      }
      return credential;
    };
  }
})();`;

/** The address a passkey accepts: it refuses an IP address as its site. */
export function passkeySite(served: string | undefined): string {
  const address = new URL(served ?? "http://127.0.0.1:3000");
  if (address.hostname === "127.0.0.1") address.hostname = "localhost";
  return address.origin;
}

/** Gives the context's page a virtual authenticator, with the PRF answered in the page. */
export async function holdAPasskey(context: BrowserContext, page: Page, seed: string): Promise<void> {
  await context.addInitScript(prfStandIn(seed));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: AUTHENTICATOR });
}

/** Whether the server's session cookie is held. */
export async function signedIn(context: BrowserContext): Promise<boolean> {
  return (await context.cookies()).some((cookie) => cookie.name === "__Host-viky-session");
}
