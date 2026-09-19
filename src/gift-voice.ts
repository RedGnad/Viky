/**
 * Who is reading a gift's page (D99).
 *
 * A gift has two people: the one who offered it and the one it is for. Everybody else who opens its link is a reader,
 * a judge most often, and the page was written as if they could not exist: it addressed them as the recipient, from
 * the title down ("$20.00 is in your name"), which is false of them.
 *
 * What each voice may then do is answered by the moment the gift is in (`src/gift-moment.ts`), which is where the
 * table of gestures this file used to carry now lives: a gesture belongs to a voice AND to a moment, and answering
 * only the first half offered a reader buttons the moment had no use for.
 */

export type Voice = "funder" | "recipient" | "reader";

/**
 * Before a gift is opened, whoever holds its link is the person it is for: the link is the key, and opening it is how
 * they become the recipient. So a reader is only ever somebody meeting a gift that is already opened.
 *
 * A person with no account here is read as a reader too, for the words alone: the page cannot know who they are, and
 * the third person is the only thing true of both a judge and the recipient coming back to sign in. Telling them the
 * gift is not theirs is a different question, answered by `notTheirs`, which needs an account to be sure.
 */
export function voiceOf(gift: Readonly<{ youAreTheFunder: boolean; youAreTheRecipient: boolean; opened: boolean }>): Voice {
  if (gift.youAreTheFunder) return "funder";
  if (gift.youAreTheRecipient) return "recipient";
  return gift.opened ? "reader" : "recipient";
}

/** Signed in, and neither of the two: the one case where the page can say "this gift is not yours" and be right. */
export function notTheirs(voice: Voice, signedIn: boolean): boolean {
  return voice === "reader" && signedIn;
}
