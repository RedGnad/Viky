import { PRIVATE_SPACE_KEY_INFO, PRIVATE_SPACE_SALT_LABEL, parsePrivateSpace, type PrivateSpace, type SealedSpace } from "./private-space";

/**
 * The sealing of the private space, the same in the browser and in the tests (Web Crypto on both).
 *
 * The passkey's PRF output under the space's own salt is the only input: HKDF-SHA-256 turns it into an AES-256-GCM
 * key that cannot be exported, and the PRF bytes are zeroed as soon as the key exists. The account the space belongs
 * to is the additional data of every seal, so a space copied onto another account does not open there.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The 32 bytes the passkey is asked to evaluate: SHA-256 of the space's label, fixed forever. */
export async function privateSpaceSalt(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(PRIVATE_SPACE_SALT_LABEL)));
}

/** The key, from the PRF output. The output is zeroed here, whatever happens. */
export async function deriveSpaceKey(prfOutput: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  try {
    if (prfOutput.length !== 32) throw new Error("PRF_OUTPUT_LENGTH");
    const material = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(PRIVATE_SPACE_KEY_INFO) },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    prfOutput.fill(0);
  }
}

const bound = (account: string) => encoder.encode(`viky.private.v1:${account.toLowerCase()}`);

export async function sealSpace(key: CryptoKey, account: string, space: PrivateSpace): Promise<SealedSpace> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(space));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: bound(account) }, key, plain));
  return { version: 1, nonce: toBase64url(nonce), ciphertext: toBase64url(sealed) };
}

/** Why a sealed space did not open: another passkey (or another account), or something that is not a space. */
export class SpaceOpenError extends Error {
  constructor(readonly code: "NOT_THIS_PASSKEY" | "NOT_A_SPACE") {
    super(code);
    this.name = "SpaceOpenError";
  }
}

export async function openSpace(key: CryptoKey, account: string, sealed: SealedSpace): Promise<PrivateSpace> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(sealed.nonce), additionalData: bound(account) }, key, fromBase64url(sealed.ciphertext));
  } catch {
    throw new SpaceOpenError("NOT_THIS_PASSKEY");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plain));
  } catch {
    throw new SpaceOpenError("NOT_A_SPACE");
  }
  const space = parsePrivateSpace(parsed);
  if (!space) throw new SpaceOpenError("NOT_A_SPACE");
  return space;
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
