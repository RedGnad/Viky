import type { Voice } from "./gift-voice";
import type { Moment } from "./gift-moment";
import { GIFT_LIVE as L, GIFT_PAGE as W } from "./sentences";

/**
 * What a gift's page leads with, at one moment, for one reader (document J, section 2).
 *
 * Four things in one order, and the order is the whole point: the state in one sentence, the figure that counts
 * now, the next moment with its date, and one action or none. This module composes the first three; the action is
 * `src/gift-moment.ts`, and the screen only draws what both hand it.
 *
 * The rule it enforces, and the test holds it: a figure appears once. The headline never says what the figure says.
 */

export type LiveInput = Readonly<{
  moment: Moment;
  voice: Voice;
  funderName: string | null;
  recipientName: string | null;
  /** The source the gift counts, from the register: "Duolingo", "Chess.com". */
  source: string;
  /** The whole gift, what is theirs so far, what came back, and what can be taken now. */
  amountDisplay: string;
  theirsDisplay: string;
  returnedDisplay: string;
  /** A climb: where they stand today, and the target. */
  todayReading: number | null;
  target: number | null;
  /** Whether anything has been counted or read yet. */
  started: boolean;
  /** What the last day Viky judged did, when a record of it exists. Nothing when the gift predates the record. */
  lastJudged: "earned" | "returned" | null;
  /** Moments already in words, in the reader's own clock: the page knows the clock, this module does not. */
  openByInWords: string | null;
  nextReadingInWords: string | null;
  cameBackOnInWords: string | null;
}>;

export type Live = Readonly<{
  /** The state in one sentence. The largest thing on the screen, and the answer to this moment's question. */
  headline: string;
  /** The figure that counts now, with a label saying what it is. Nothing when the moment has no figure. */
  figure: Readonly<{ label: string; value: string }> | null;
  /** The next moment, dated, in the reader's clock. Nothing when there is no next moment. */
  next: string | null;
  /**
   * What has gone back to the funder so far, beside the figure that counts: the second column of the mockup's card.
   * Nothing while nothing has gone back, because a zero there would be a fact about nothing.
   */
  back: Readonly<{ label: string; value: string }> | null;
}>;

/** Whether this reader is the person the gift is for. A reader who is neither of the two reads the third person. */
const isTheirs = (voice: Voice) => voice === "recipient";

/** A money figure with nothing in it: "$0.00", "0,00 EUR", whatever the currency writes for none of it. */
const isNothing = (amount: string) => /^[^0-9]*0[.,]00[^0-9]*$/.test(amount.trim());

export function liveOf(input: LiveInput): Live {
  const { moment, voice, funderName, recipientName, source } = input;
  const yours = isTheirs(voice);
  // What has gone back, said only where it has: on the moments that are about what is left rather than what came
  // back, and never as a zero.
  const back =
    moment === "over" || moment === "cameBack" || isNothing(input.returnedDisplay)
      ? null
      : { label: voice === "funder" ? L.cameBackToYou : L.cameBackTo(funderName), value: input.returnedDisplay };

  switch (moment) {
    case "unopened":
      return {
        headline: yours
          ? L.unopened.yours(funderName)
          : voice === "funder"
            ? L.unopened.theirs(recipientName)
            : L.unopened.reading(funderName, recipientName),
        figure: { label: yours ? L.unopened.label.yours : L.unopened.label.theirs, value: input.amountDisplay },
        next: input.openByInWords,
        back,
      };

    case "openedNotConnected":
      return {
        headline: yours ? L.notConnected.yours(source) : L.notConnected.theirs(recipientName, source),
        figure: { label: yours ? L.notConnected.label.yours : L.notConnected.label.theirs, value: input.amountDisplay },
        next: null,
        back,
      };

    case "counting":
      return {
        // The last judged day, in the morning message's own words: the same wording whether the fact arrives on the
        // phone or on the screen. The money it carries there is the figure here, so the sentence does not repeat it.
        headline: !input.started
          ? L.counting.nothingYet
          : input.lastJudged === "earned"
            ? L.counting.counted
            : input.lastJudged === "returned"
              ? yours
                ? L.counting.wentBack(funderName)
                : L.counting.wentBackToYou
              : L.counting.running,
        figure: { label: yours ? W.yoursSoFar : W.theirsSoFar, value: input.theirsDisplay },
        next: input.nextReadingInWords,
        back,
      };

    case "climbing":
      return {
        headline: climbHeadline(input, yours),
        figure:
          input.todayReading === null
            ? null
            : { label: yours ? L.climbing.label.yours : L.climbing.label.theirs, value: String(input.todayReading) },
        next: input.nextReadingInWords,
        back,
      };

    case "awaitingProof":
      return {
        headline: yours ? L.awaitingProof.yours : L.awaitingProof.theirs(recipientName),
        figure: { label: yours ? L.awaitingProof.label.yours : L.awaitingProof.label.theirs, value: input.amountDisplay },
        next: null,
        back,
      };

    case "startTooHigh":
      return {
        headline:
          input.todayReading === null
            ? L.climbing.notReadYet[yours ? "yours" : "theirs"]
            : yours
              ? L.startTooHigh.yours(input.todayReading)
              : L.startTooHigh.theirs(recipientName, input.todayReading),
        figure: { label: L.startTooHigh.label(funderName), value: input.amountDisplay },
        next: null,
        back,
      };

    case "won":
      return {
        headline: yours ? L.won.yours : L.won.theirs(recipientName),
        figure: { label: yours ? L.won.label.yours : L.won.label.theirs, value: input.theirsDisplay },
        next: null,
        back,
      };

    case "over":
      return {
        headline: yours ? L.over.yours : L.over.theirs,
        figure: {
          label: yours ? L.over.label.yours(funderName) : L.over.label.theirs,
          value: input.returnedDisplay,
        },
        next: null,
        back,
      };

    case "cameBack":
      return {
        headline: yours ? L.cameBack.yours : L.cameBack.theirs,
        figure: { label: yours ? L.cameBack.label.yours : L.cameBack.label.theirs, value: input.returnedDisplay },
        next: input.cameBackOnInWords === null ? null : L.cameBack.on(input.cameBackOnInWords),
        back: null,
      };
  }
}

/**
 * A climb says how far is left, because that is the question a person asks a climb. Where they stand today is the
 * figure under it, and the target itself belongs to the agreement, folded, where it was read once.
 */
function climbHeadline(input: LiveInput, yours: boolean): string {
  if (input.todayReading === null || input.target === null) return L.climbing.notReadYet[yours ? "yours" : "theirs"];
  const left = input.target - input.todayReading;
  return left <= 0 ? L.climbing.reachedAlready : L.climbing.toGo(left);
}
