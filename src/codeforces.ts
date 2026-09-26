import { keccak256, stringToHex, type Hex } from "viem";

/**
 * "Reach a Codeforces rating" (the founder's decision of 27 Sep 2026): a climb of the Learn family in the shape of
 * the chess rating (D45), read for the person from Codeforces' public API, `codeforces.com/api/user.info`, which
 * answers anonymously with the handle, the rating, the best rating ever and the editable name fields (the API help,
 * read 26 Sep 2026: no key for public data, one request every two seconds). Codeforces polices itself: plagiarism
 * is punished and rounds are unrated or cancelled by its own rules. Browser safe.
 */

export const CODEFORCES_SOURCE = "Codeforces";

/** Goal 33 on `MilestoneGift`, after the WCA's 32. */
export const CODEFORCES_GOAL_TYPE = 33;

export function codeforcesProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:codeforces-rating-zkfetch:v1"));
}

/** The label of the identity pseudonym (the HMAC input): one person, one identity, whatever they climb. */
export const CODEFORCES_IDENTITY_LABEL = "codeforces";

/** A Codeforces handle: letters, figures, underscores, hyphens and dots, three to twenty-four of them (measured on the site's own handles). */
export function isValidCodeforcesHandle(value: string): boolean {
  return /^[A-Za-z0-9_.-]{3,24}$/.test(value);
}

export function codeforcesUserUrl(handle: string): string {
  return `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`;
}
