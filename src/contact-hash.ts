import { keccak256, stringToHex, type Hex } from "viem";

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
    if (!EMAIL.test(value)) throw new Error("Enter a valid email");
    return { kind: "email", value };
  }
  let digits = trimmed.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) throw new Error("Enter a phone number with its country code");
  return { kind: "phone", value: digits };
}

export function contactHash(input: string): Hex {
  const contact = normaliseContact(input);
  return keccak256(stringToHex(`viky:contact:v1:${contact.kind}:${contact.value}`));
}
