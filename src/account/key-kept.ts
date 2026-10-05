/**
 * Where the passkey of an account is kept, as far as the browser says (the founder, 5 Oct 2026). Browser safe, pure.
 *
 * A tester made an account on a computer and looked for it on a phone. An account here is derived from its passkey,
 * so it opens only where that passkey is: a key that never leaves one computer never opens the account anywhere else,
 * and no second key reaches it.
 *
 * What a browser lets a page know, and when:
 *
 * - Before the press, nothing: the person chooses where to save in the system's own sheet, and the page is not told.
 * - After it, two facts in the authenticator data every ceremony returns (W3C Web Authentication Level 3, section 6.1,
 *   read 5 Oct 2026). Bit 3 of its flags, backup eligibility: set for a key that may be copied to other devices, unset
 *   for a key bound to the one it was made on, and never changed afterwards. Bit 4, backup state, says whether it is
 *   copied now, and can change. `getAuthenticatorData()` is in every current browser (MDN: baseline since Oct 2023).
 * - At creation only, sixteen bytes that name the store (the AAGUID), which a public list turns into a name
 *   (github.com/passkeydeveloper/passkey-authenticator-aaguids, 59 entries on 5 Oct 2026). web.dev says what it is
 *   worth: "AAGUID should only be used to help users with passkey management", since nothing signs it here. So the
 *   name is said as a help and never decides anything, and a store the list does not name is not named.
 * - Which kind of authenticator answered (`authenticatorAttachment`): this device's own, or one apart from it, a
 *   security key or a phone asked through a code.
 *
 * What it cannot tell: whether a key that may be copied reaches a given phone. Apple's does not go to Android.
 */

export type KeyKept = Readonly<{
  /** False when the key is bound to the one authenticator it was made on. */
  follows: boolean;
  /** The store, by a name a person knows it by, when its identifier is one the public list names. */
  where: string | null;
  /** True when what answered is apart from this device: a security key, or a phone asked through a code. */
  apart: boolean;
}>;

/**
 * The stores a browser's own sheet offers on a computer or a phone, by the identifier each gives (the public list
 * above, read 5 Oct 2026). The names are the list's, but for the two that are one browser's profile on one Mac, said
 * as what they are.
 */
export const KEY_STORES: Readonly<Record<string, string>> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "Apple Passwords",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "Apple Passwords",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "this Chrome profile",
  "771b48fd-d3d4-4f74-9232-fc157ab0507a": "this Edge profile",
  "d3452668-01fd-4c12-926c-83a4204853aa": "Microsoft Password Manager",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
};

const FLAGS_AT = 32;
const BACKUP_ELIGIBLE = 0x08;
const HAS_CREDENTIAL_DATA = 0x40;
const AAGUID_FROM = 37;
const AAGUID_UNTIL = 53;

/** The store's identifier as the list writes it, or nothing where the data carries none or sixteen zeros. */
export function storeIdOf(authenticatorData: Uint8Array): string | null {
  if (authenticatorData.length < AAGUID_UNTIL || (authenticatorData[FLAGS_AT]! & HAS_CREDENTIAL_DATA) === 0) return null;
  const bytes = authenticatorData.subarray(AAGUID_FROM, AAGUID_UNTIL);
  if (bytes.every((byte) => byte === 0)) return null;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What one ceremony said of the key, or nothing when its authenticator data is absent or cut short. */
export function keyKeptOf(input: Readonly<{ authenticatorData: Uint8Array | null | undefined; attachment: string | null | undefined }>): KeyKept | null {
  const data = input.authenticatorData;
  if (!data || data.length <= FLAGS_AT) return null;
  const id = storeIdOf(data);
  return { follows: (data[FLAGS_AT]! & BACKUP_ELIGIBLE) !== 0, where: id ? (KEY_STORES[id] ?? null) : null, apart: input.attachment === "cross-platform" };
}

/**
 * What is kept of it on the device, beside the passkey's own identifier. A later sign-in says again whether the key
 * follows, and never names the store: the name learnt at creation is kept as long as the passkey is the same one.
 */
export type KeptRecord = KeyKept & Readonly<{ credentialId: string }>;

export function recordOf(credentialId: string, said: KeyKept | null, before: KeptRecord | null): KeptRecord | null {
  const same = before && before.credentialId === credentialId ? before : null;
  if (!said) return same;
  return { credentialId, follows: said.follows, where: said.where ?? same?.where ?? null, apart: said.apart };
}

export function readRecord(raw: string | null): KeptRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<KeptRecord>;
    if (typeof parsed.credentialId !== "string" || parsed.credentialId.length === 0 || typeof parsed.follows !== "boolean") return null;
    return { credentialId: parsed.credentialId, follows: parsed.follows, where: typeof parsed.where === "string" && Object.values(KEY_STORES).includes(parsed.where) ? parsed.where : null, apart: parsed.apart === true };
  } catch {
    return null;
  }
}
