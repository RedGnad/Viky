import { createEd25519SigningSession, type Ed25519SigningSession, type WebAuthnClient } from "@category-labs/mera";

/**
 * The key a recipient's yes and stop are signed with (the founder, 29 Sep 2026, Mera's "One Passkey, Many Keys").
 *
 * Its own space of the passkey's PRF: the salt sha256("viky:consent:v1"), a second salt asked in the very ceremony that
 * signs the person in (the PRF extension evaluates two salts at once), so no prompt is added. The output is an Ed25519
 * private key, held in memory like the account's own and dropped with it. It signs agreements and stops, and nothing
 * else: it is not the account's key and can move no money. Nothing is stored; the same passkey makes the same key on
 * any device.
 *
 * A device that answers the first salt and not the second is asked once more, for the second alone, at the first
 * agreement it signs.
 */

/** sha256("viky:consent:v1"), as the 32 bytes WebAuthn evaluates. test/consent-key.test.ts recomputes it. */
export const CONSENT_SALT_HEX = "fb094523977c860140a1e1cf97d7ca21fb697ff2e6a97845a781544d18f98e6b";

export function consentSalt(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  for (let index = 0; index < 32; index += 1) bytes[index] = parseInt(CONSENT_SALT_HEX.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

let held: Ed25519SigningSession | null = null;
const listeners = new Set<() => void>();

function keep(output: ArrayBuffer | ArrayBufferView | undefined): void {
  if (!output) return;
  const bytes = output instanceof ArrayBuffer ? new Uint8Array(output) : new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
  if (bytes.length !== 32) return;
  const copy = new Uint8Array(bytes);
  held?.end();
  held = createEd25519SigningSession({ privateKey: copy });
  copy.fill(0);
  for (const changed of [...listeners]) changed();
}

/** The consent key held now, or nothing: after sign-out, after the idle minutes, or on a device that gave no second output. */
export function consentKey(): Ed25519SigningSession | null {
  return held;
}

/** Keeps the consent key from a PRF output asked for it alone (the one extra prompt, see above). */
export function keepConsentOutput(output: Uint8Array): void {
  keep(output);
}

/** Drops the key, with the account's own session. */
export function endConsentKey(): void {
  held?.end();
  held = null;
  for (const changed of [...listeners]) changed();
}

export function onConsentKey(changed: () => void): () => void {
  listeners.add(changed);
  return () => listeners.delete(changed);
}

type PrfResults = { first?: ArrayBuffer | ArrayBufferView; second?: ArrayBuffer | ArrayBufferView };

function prfOf(credential: PublicKeyCredential): { enabled?: boolean; results?: PrfResults } | undefined {
  return (credential.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: PrfResults } }).prf;
}

function bytesOf(value: ArrayBuffer | ArrayBufferView | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  return value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function publicKeyCredential(credential: Credential | null): PublicKeyCredential {
  if (!credential || credential.type !== "public-key" || !("rawId" in credential)) throw new Error("WebAuthn returned no usable public key credential");
  return credential as PublicKeyCredential;
}

/**
 * Mera's own browser client, the same ceremonies with the same parameters, asking the account's salt first and the
 * consent salt second, and keeping the second answer as the consent key. Mera's `browserWebAuthnClient` is not exported,
 * so this is its code with one field added; test/consent-key.test.ts holds the two to the same requests.
 */
export const consentWebAuthnClient: WebAuthnClient = {
  async createCredential(request) {
    const credential = publicKeyCredential(
      await navigator.credentials.create({
        publicKey: {
          rp: request.rp,
          user: request.user,
          challenge: request.challenge,
          pubKeyCredParams: request.algorithms.map((alg) => ({ type: "public-key" as const, alg })),
          ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
          attestation: request.attestation,
          authenticatorSelection: { residentKey: request.residentKey, requireResidentKey: true, userVerification: request.userVerification },
          extensions: { prf: { eval: { first: request.prfSalt, second: consentSalt() } } } as AuthenticationExtensionsClientInputs,
        },
      }),
    );
    const prf = prfOf(credential);
    keep(prf?.results?.second);
    const response = credential.response as AuthenticatorAttestationResponse;
    const transports = typeof response.getTransports === "function" ? (response.getTransports() as WebAuthnClient.CreateCredentialResult["transports"]) : undefined;
    const first = bytesOf(prf?.results?.first);
    return {
      credentialId: new Uint8Array(credential.rawId),
      ...(transports !== undefined ? { transports } : {}),
      prfEnabled: prf?.enabled === true,
      ...(first ? { prfOutput: first } : {}),
    };
  },
  async getCredential(request) {
    const { allowCredential } = request;
    const credential = publicKeyCredential(
      await navigator.credentials.get({
        publicKey: {
          rpId: request.rpId,
          challenge: request.challenge,
          ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
          userVerification: request.userVerification,
          extensions: { prf: { eval: { first: request.prfSalt, second: consentSalt() } } } as AuthenticationExtensionsClientInputs,
          ...(allowCredential !== undefined
            ? { allowCredentials: [{ id: allowCredential.credentialId, type: "public-key" as const, ...(allowCredential.transports !== undefined ? { transports: allowCredential.transports as AuthenticatorTransport[] } : {}) }] }
            : {}),
        },
      }),
    );
    const prf = prfOf(credential);
    keep(prf?.results?.second);
    const first = bytesOf(prf?.results?.first);
    return { credentialId: new Uint8Array(credential.rawId), ...(first ? { prfOutput: first } : {}) };
  },
};
