/**
 * The two names a gift carries: the first name of the person it is for, and the funder's name as that person knows
 * them. Decided by the founder on 17 Sep 2026, replacing decision 4 of the drawn flows ("No first name"): the funder
 * was never named to the recipient, and every money app read for the benchmark names the other side.
 *
 * They are words for people, never terms of the gift. They live in the gift's record beside the claim link, never
 * in the contract, and they are shown to whoever holds the link: the check screen says so before anything is paid.
 * Nothing here trusts them: a name is text somebody typed, printed as text.
 */

/** Long enough for any first name or nickname written by hand, short enough to stay one line on a card. */
export const GIFT_NAME_MAX_LENGTH = 40;

export type GiftNameProblem = "empty" | "tooLong" | "notText";

/** Letters of any script, marks, digits, spaces and the punctuation names carry; nothing that could draw or hide. */
const NAME = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'’-]*$/u;

/** The name as it will be stored and printed: inner spaces collapsed, ends trimmed. */
export function tidyGiftName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Why a typed name cannot be used, or nothing when it can. */
export function giftNameProblem(value: string): GiftNameProblem | undefined {
  const name = tidyGiftName(value);
  if (name.length === 0) return "empty";
  if ([...name].length > GIFT_NAME_MAX_LENGTH) return "tooLong";
  if (!NAME.test(name)) return "notText";
  return undefined;
}

export type GiftNames = Readonly<{ recipientName: string | null; funderName: string | null }>;
