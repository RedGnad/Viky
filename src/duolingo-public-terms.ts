import { keccak256, stringToHex, type Hex } from "viem";

/**
 * The public mode for Duolingo (D27): the daily number is read from Duolingo's public profile endpoint
 * through an attested fetch, so the person never signs in anywhere after the first day. Browser-safe
 * constants and pure helpers live here; the attested fetch itself is in `duolingo-public.ts` (server).
 */

/** Registered on the escrow for the Duolingo goal type; a check-in must carry it (D14). */
export const DUOLINGO_PUBLIC_PROVIDER_ID: Hex = keccak256(stringToHex("viky:provider:duolingo-public-zkfetch:v1"));

/** Label of the identity pseudonym (HMAC input), independent of the provider id. */
export const DUOLINGO_PUBLIC_PROVIDER_LABEL = "duolingo";

export const DUOLINGO_PROFILE_ENDPOINT = "https://www.duolingo.com/2017-06-30/users";

/** Duolingo usernames: letters, digits, dots, underscores and hyphens (observed; the endpoint is case-insensitive). */
export function isValidDuolingoUsername(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,60}$/.test(value);
}

export function duolingoProfileUrl(username: string): string {
  return `${DUOLINGO_PROFILE_ENDPOINT}?username=${encodeURIComponent(username)}`;
}

/** The code a recipient puts in their Duolingo display name for a minute to prove the account is theirs. */
export const BINDING_CODE_LENGTH = 6;
export const BINDING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O, 0, I, 1
export const BINDING_CODE_TTL_SECONDS = 60 * 60;

export function newBindingCode(randomByte: () => number = () => Math.floor(Math.random() * 256)): string {
  let code = "";
  while (code.length < BINDING_CODE_LENGTH) {
    const byte = randomByte();
    if (byte < BINDING_CODE_ALPHABET.length * Math.floor(256 / BINDING_CODE_ALPHABET.length)) {
      code += BINDING_CODE_ALPHABET[byte % BINDING_CODE_ALPHABET.length];
    }
  }
  return code;
}

/** Case-insensitive, ignoring spaces and dashes the person may have typed around the code. */
export function displayNameHasCode(displayName: string, code: string): boolean {
  const normalise = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");
  const wanted = normalise(code);
  return wanted.length === BINDING_CODE_LENGTH && normalise(displayName).includes(wanted);
}
