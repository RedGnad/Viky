import { keccak256, stringToHex, type Hex } from "viem";
import { RequestError } from "./request-error";

/**
 * The recipient contact a funder names is stored on-chain only as a hash, and the claim attestation
 * carries the same hash, so a claim link can only bind the contact the funder meant. Normalisation
 * must be identical everywhere: an email is trimmed and lowercased; a phone number is reduced to
 * E.164 (a leading plus and digits only).
 */

export type NormalisedContact = Readonly<{ kind: "email" | "phone"; value: string }>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseContact(input: string): NormalisedContact {
  const trimmed = input.trim();
  if (trimmed.includes("@")) {
    const value = trimmed.toLowerCase();
    if (!EMAIL.test(value)) throw new RequestError("INVALID_CONTACT", "Enter a valid email");
    return { kind: "email", value };
  }
  let digits = trimmed.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) throw new RequestError("INVALID_CONTACT", "Enter a phone number with its country code");
  return { kind: "phone", value: digits };
}

/**
 * What a gift carries where a contact used to be, since 15 Sep 2026 (D72). The contact protected nothing: the claim
 * route copies the stored hash into the attestation, so the contract compares our own value with itself, and Viky
 * never writes to anybody. All it left behind was a fingerprint of an email or a phone number on a public ledger,
 * which a phone number does not survive. The contract refuses a zero hash, so this is a fixed value naming nobody.
 */
export const NO_CONTACT_HASH: Hex = keccak256(stringToHex("viky:contact:v1:none"));

export function contactHash(input: string): Hex {
  const contact = normaliseContact(input);
  return keccak256(stringToHex(`viky:contact:v1:${contact.kind}:${contact.value}`));
}
