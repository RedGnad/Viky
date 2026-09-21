import { cardDraftFrom, PENDING_GIFT_MAX_AGE_MS, type PendingGiftTerms } from "./pending-gift";

/**
 * The figures of the card a device kept, in a cookie, so the server draws the card this person was writing rather
 * than the starting one (D160).
 *
 * The card itself stays on the device, in its own storage, and this carries only what changes what is printed: the
 * amount, the length, the condition, the course, and the amount as it was typed. Not the two names, not the account,
 * not the username of the goal: a name has no business in an HTTP header sent with every request for a font.
 *
 * Same age as the card itself, so a cookie never outlives what it describes.
 */

export const CARD_COOKIE = "viky.card";

/** What travels: the card's figures, never its people. */
const CARRIED = ["conditionId", "dollars", "days", "target", "course", "courseTitle", "cadence", "standingReadAt", "typedAmount", "typedIn"] as const;

export function cardCookieFrom(terms: PendingGiftTerms, nowMs: number): string {
  const carried: Record<string, unknown> = { savedAtMs: nowMs };
  for (const key of CARRIED) {
    const value = terms[key];
    if (typeof value === "string" && value !== "") carried[key] = value;
  }
  if (typeof terms.standing === "number") carried.standing = terms.standing;
  return encodeURIComponent(JSON.stringify(carried));
}

/** The card a cookie describes, with the names it does not carry left empty, or nothing when it says nothing usable. */
export function cardFromCookie(raw: string | null | undefined, nowMs: number): PendingGiftTerms | undefined {
  if (!raw) return undefined;
  let text: string;
  try {
    text = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return cardDraftFrom(text, nowMs);
}

/** How long the cookie lives, in seconds, which is how long the card does. */
export const CARD_COOKIE_MAX_AGE_SECONDS = Math.floor(PENDING_GIFT_MAX_AGE_MS / 1000);
