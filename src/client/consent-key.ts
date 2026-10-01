import { createEd25519SigningSession, MeraError, type Ed25519SigningSession, type WebAuthnClient } from "@category-labs/mera";

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

function keep(output: PrfOutput | undefined): void {
  // A second answer that cannot be read gives no consent key, and never stops the account from opening: the key is
  // then asked for by itself at the first agreement.
  let bytes: Uint8Array | undefined;
  try {
    bytes = bytesOf(output);
  } catch {
    return;
  }
  if (!bytes || bytes.length !== 32) return;
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

/** What an authenticator may answer a PRF evaluation with: a buffer, a view on one, or, from some, a plain list of bytes. */
type PrfOutput = ArrayBuffer | ArrayBufferView | ArrayLike<number>;
type PrfResults = { first?: PrfOutput; second?: PrfOutput };

function prfOf(credential: PublicKeyCredential): { enabled?: boolean; results?: PrfResults } | undefined {
  return (credential.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: PrfResults } }).prf;
}

/**
 * The bytes of a PRF output, normalised exactly as Mera's own client does it (its `normalizeByteArray`; the audit of
 * 1 Oct 2026, S-15): a view over a view's or a buffer's bytes, and anything else read as a list whose every element
 * must be a byte. Until then a list was taken for a view, so an authenticator answering one broke every sign-in.
 */
function bytesOf(value: PrfOutput | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return Uint8Array.from(value, (byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new MeraError("PRF_UNAVAILABLE", "PRF output must contain only byte values (integers 0-255)");
    return byte;
  });
}

/** As Mera's client asserts it, with its own error, so both fail the same way for the same answer. */
function publicKeyCredential(credential: Credential | null | undefined): PublicKeyCredential {
  if (credential?.type !== "public-key" || !("rawId" in credential) || !("getClientExtensionResults" in credential) || typeof credential.getClientExtensionResults !== "function") {
    throw new MeraError("PASSKEY_OPERATION_FAILED", "WebAuthn returned no usable public key credential");
  }
  return credential as PublicKeyCredential;
}

/**
 * Whether the two ceremonies are left to Mera's own client (`NEXT_PUBLIC_MERA_OWN_CLIENT=1`), the way back if a
 * release of Mera and the client below ever disagree. The account opens exactly as before; the consent key is then
 * asked once more, for its salt alone, at the first agreement a person signs (`keyForSigning`, src/client/consent.ts).
 */
export function meraOwnClient(value: string | undefined = process.env.NEXT_PUBLIC_MERA_OWN_CLIENT): boolean {
  return value?.trim() === "1";
}

/** The client the account's ceremonies run through: the one below, or Mera's own when the switch says so. */
export function ceremonyClient(): WebAuthnClient | undefined {
  return meraOwnClient() ? undefined : consentWebAuthnClient;
}

/**
 * Mera's own browser client, the same ceremonies with the same parameters, asking the account's salt first and the
 * consent salt second, and keeping the second answer as the consent key. Mera's `browserWebAuthnClient` is not exported,
 * so this is its code with one field added; test/consent-key.test.ts holds the two to the same requests, the same
 * answers and the same refusals.
 */
export const consentWebAuthnClient: WebAuthnClient = {
  async createCredential(request) {
    const credential = publicKeyCredential(
      await globalThis.navigator?.credentials?.create({
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
      await globalThis.navigator?.credentials?.get({
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
