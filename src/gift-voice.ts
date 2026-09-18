/**
 * Who is reading a gift's page, and what that person may do on it (D99).
 *
 * A gift has two people: the one who offered it and the one it is for. Everybody else who opens its link is a reader,
 * a judge most often, and the page was written as if they could not exist: it addressed them as the recipient, from
 * the title down ("$20.00 is in your name"), which is false of them.
 *
 * Both questions are answered here, away from the page, so the page cannot answer the second one differently in ten
 * places: a gesture belongs to a voice, and a reader has none of them.
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

/**
 * Every gesture a gift's page offers, and who it belongs to. A reader has none: reading where a gift stands is all a
 * link ever gives.
 */
export type Gestures = Readonly<{
  /** Open it, which is what makes the person holding the link the person the gift is for. */
  openTheGift: boolean;
  /** Name the account the gift counts, prove it is theirs, and start the counting. */
  connectTheAccount: boolean;
  /** Ask for a reading now rather than waiting for the morning pass. */
  countNow: boolean;
  /** Take what has been earned so far. */
  takeTheMoney: boolean;
  /** Download the proof behind a day, which is served only to the two people (U2). */
  seeTheProof: boolean;
  /** Be told each morning what the reading said. */
  beTold: boolean;
  /** Copy the link again, on the device that made the gift. */
  copyTheLink: boolean;
}>;

const NOTHING: Gestures = {
  openTheGift: false,
  connectTheAccount: false,
  countNow: false,
  takeTheMoney: false,
  seeTheProof: false,
  beTold: false,
  copyTheLink: false,
};

export function gesturesFor(voice: Voice, gift: Readonly<{ opened: boolean; cancelled: boolean }>): Gestures {
  if (gift.cancelled || voice === "reader") return NOTHING;
  if (voice === "funder") return { ...NOTHING, seeTheProof: true, beTold: true, copyTheLink: true };
  return {
    openTheGift: !gift.opened,
    connectTheAccount: gift.opened,
    countNow: gift.opened,
    takeTheMoney: gift.opened,
    seeTheProof: gift.opened,
    beTold: gift.opened,
    copyTheLink: false,
  };
}
