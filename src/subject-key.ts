import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * The subject a gift is bound to, kept from being guessed (the founder, 29 Sep 2026). Browser safe.
 *
 * A certificate's subject was the hash of a name and a course, a university's the hash of its portal: anybody could
 * hash "Léa Martin" with a course, or each of a few hundred portals, and find which gift on the public contract is
 * whose. Since then the funder's browser draws a random key for each gift and signs the hash of that subject with it;
 * the key never goes on chain, and the server keeps it with the gift to check a reading against. Without the key the
 * subject is a hash of nothing anybody can guess. Nothing asks the server to compute one, so there is no door to try
 * names at. Gifts made before carry no key and keep the subject they were signed with.
 */

export const SUBJECT_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isSubjectKey(value: unknown): value is Hex {
  return typeof value === "string" && SUBJECT_KEY_PATTERN.test(value);
}

/** A fresh key, from the browser's or the runtime's own random source. */
export function newSubjectKey(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** The subject as signed and stored on chain: the open subject hashed with the gift's key, under its own name. */
export function keyedSubject(open: Hex, key: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "string" }], [open, key, "viky:subject:v2"]));
}

/** What the contract holds for a gift with this key, or the open subject for a gift made before keys. */
export function signedSubjectOf(open: Hex, key: string | null | undefined): Hex {
  return isSubjectKey(key) ? keyedSubject(open, key) : open;
}
