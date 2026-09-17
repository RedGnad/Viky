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

/**
 * The provider id of a gift counted on one course rather than on the experience total (U1). Registered on the daily
 * escrow as goal 5 on 18 Sep 2026, and read back from the chain (docs/OPERATIONS.md). The two providers cannot be
 * mixed: the contract refuses an attestation whose provider id is not the one its goal was registered with, so a
 * course reading can never settle a gift made on the total, nor the other way round.
 */
export const DUOLINGO_COURSE_PROVIDER_ID: Hex = keccak256(stringToHex("viky:provider:duolingo-course-zkfetch:v1"));

/**
 * A course of the public profile, as Duolingo names it. Measured on 18 Sep 2026 over 19 public profiles and 74 course
 * objects: every id reads DUOLINGO_<learning>_<from>, each language two letters, some with a region (DUOLINGO_NL-NL_EN,
 * DUOLINGO_ZH-CN_RO). Three letters are allowed here because nothing published says there cannot be any.
 */
export function isDuolingoCourseId(value: string): boolean {
  return /^DUOLINGO_[A-Z]{2,3}(-[A-Z]{2,3})?_[A-Z]{2,3}(-[A-Z]{2,3})?$/.test(value);
}

/**
 * The pattern that reads one course's experience, and no other's. Anchored on the course id and stopped by the end of
 * that course's object, so it cannot run into the next one: measured the same day, the keys of a course object come in
 * one order everywhere (authorId, fromLanguage, healthEnabled, id, learningLanguage, placementTestAvailable, preload,
 * title, xp, crowns) and a course object holds no object of its own.
 */
export function duolingoCourseXpPattern(courseId: string): string {
  return `"id":"${courseId}",[^}]*"xp":(?<courseXp>\\d+)`;
}

/**
 * What a check-in carries for this gift: the provider the contract expects for its goal, and what the identity is made
 * of. A gift counted on one course is bound to the person **and** the course, not the person alone: the contract pins
 * the identity at the first reading and refuses any later reading carrying another, so a gift for Spanish can never be
 * settled by a reading of German on the same profile, and a gift made before U1 keeps exactly the identity and the
 * provider it has always had.
 */
export function checkInSubject(profileId: string, courseId: string | null): { providerId: Hex; identity: string } {
  return courseId
    ? { providerId: DUOLINGO_COURSE_PROVIDER_ID, identity: `${profileId}:${courseId}` }
    : { providerId: DUOLINGO_PUBLIC_PROVIDER_ID, identity: profileId };
}

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
