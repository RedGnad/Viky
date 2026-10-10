import type { RecipientWords } from "./conditions";
import { leftInWords, type DayNow } from "./day-now";
import type { Voice } from "./gift-voice";
import { contractDayInWords } from "./moments";
import type { Moment } from "./gift-moment";
import { END_GIFT as E, GIFT_CARD as W_CARD, GIFT_LIVE as L, GIFT_PAGE as W } from "./sentences";

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
  /** Whether the proof is shown by the person from their own account (D162) rather than a page they share. */
  shown?: boolean;
  /**
   * A gift on a year's results that nobody has said are out yet (the founder, 10 Oct 2026): the wait is the headline,
   * to both people, and the person it is for reads when to come back. Once a proof stands, where it stands is said.
   */
  waitsForResults?: boolean;
  /**
   * Where the one proof of a gift had or not stands, when that is not "nothing yet": held for review, refused by it,
   * waiting for the university's page to be built, or past the last day: "late" where the source dates what it grants,
   * so what was had in time can still be proved, and "ended" where the showing itself is what is dated.
   */
  proof?: "pending" | "refused" | "building" | "late" | "ended" | "unread" | null;
  /** The day the university's page is read by at the latest, in words: the gift's making plus two days, in the reader's clock. */
  builtByInWords?: string | null;
  /** The last day of the late window, in the reader's clock: fourteen days after the gift's last day. */
  lateUntilInWords?: string | null;
  /** Which of the three drawings the gift has, which says what its promise is: day by day, at a target, with a proof. */
  shape?: "days" | "climb" | "stamp";
  /** What the last day Viky judged did, when a record of it exists. Nothing when the gift predates the record. */
  lastJudged: "earned" | "returned" | null;
  /**
   * Dates already in words, in the reader's own clock: the page knows the clock, this module does not. The day an
   * unopened gift goes back (14 days after it was funded, on both contracts), and the day an opened gift that nothing
   * has started goes back (14 days after it was opened).
   */
  openBy: string | null;
  /** Whether this device holds the gift's link, for the person who offered it: then the state is "send it". */
  linkHere?: boolean;
  connectBy: string | null;
  /** The person connected the source and has not started the counting yet: known in the browser, for their own page. */
  sourceConnected?: boolean;
  nextReadingInWords: string | null;
  /** The hour of the next reading alone, in the reader's clock: "20:30". Drawn as a figure where nothing has gone back. */
  nextReadingAt?: string | null;
  cameBackOnInWords: string | null;
  /** The day it was reached, or the last day of a habit that finished with days earned, in the reader's clock. */
  endedOnInWords?: string | null;
  /** The day the money of a start too high goes back: the gift's own deadline. */
  deadlineInWords?: string | null;
  /** The gift holds some of what the person it is for earned, which Home's way out takes first (D208). */
  takeableFromHome?: boolean;
  /** The gift was ended by the person it is for: the day, in the reader's clock, and the two amounts the ending moved. */
  ended?: Readonly<{ onInWords: string; keptDisplay: string; givenBackDisplay: string }> | null;
  /**
   * A habit read as the day goes (the third daily contract, src/day-now.ts): where today stands, with the days already
   * named and the time already a figure, since the page knows the clock and this module does not. Nothing on any
   * other gift, whose counting moment reads as it always did.
   */
  asItGoes?: AsItGoes | null;
}>;

/** Where today stands for a gift read as the day goes, in the pieces a sentence is made of. */
export type AsItGoes = Readonly<{
  /**
   * `catchUp`: an earlier day is still open, `day`, and one more lesson would pay `then`. `open`: today is waited
   * for. `counted`: today is counted. `over`: the last day has passed and every day is settled.
   */
  kind: "catchUp" | "open" | "counted" | "over";
  /** The earlier day still open, as a sentence names it: "yesterday", or a date. */
  day?: string;
  /** The day one more lesson would pay after it: "today", "yesterday", a date, or nothing when none is open. */
  then?: string | null;
  /** How long is left for the day that is waited for: "9 h 12". */
  left?: string;
  /** What one day adds, for the figure of a day just counted. */
  perDayDisplay: string;
  /** A lesson was seen and the attested reading is under way. */
  certifying: boolean;
  /** The register's words for what is waited for and what was seen (src/conditions.ts). */
  words: NonNullable<RecipientWords["asItGoes"]>;
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
  /**
   * Where money already theirs goes (D208), with no gesture of its own. It is a sentence, so it is read in the fold
   * "What was agreed" and no longer on the card in small capitals (the founder's rule 5 of 1 Oct 2026).
   */
  quiet?: string | null;
  /** A label above the state, four words at most: the day a gift was ended. Nothing on every other moment. */
  when?: string | null;
  /**
   * The next reading as a figure, in the right column, while nothing has gone back to take that column: the hour and
   * its label, where a sentence stood (the mockup you-decide.html, first frame). `next` is then nothing.
   */
  nextAt?: Readonly<{ label: string; value: string }> | null;
}>;

/**
 * The small line above the name, which names the other person of the two: "A gift from Mom" to the person it is
 * for and to anybody reading their link, "Your gift" to the funder, and "A gift" to a reader nobody gave the names
 * to. It said "Your gift" to that reader until V4, which is false of them.
 */
export function eyebrowOf(voice: Voice, funderName: string | null): string {
  if (voice === "funder") return W_CARD.fromFunderOrYours(null);
  if (funderName) return W_CARD.fromFunderOrYours(funderName);
  return voice === "reader" ? L.aGift : W_CARD.fromFunderOrYours(null);
}

/**
 * The card's title: "For you" to the person it is for, "For Léa" when a name is known, "For whoever opens the link" to
 * a funder who named nobody, and "For somebody" to a reader given no name. It printed "For" and nothing until V4.
 */
export function titleOf(voice: Voice, name: string | null): string {
  if (voice === "recipient") return W_CARD.forYou;
  if (name && name.trim()) return W_CARD.forName(name);
  return voice === "funder" ? W_CARD.forWhoever : L.forSomebody;
}

/** Where a proof stands, to each of the three readers. A reader who is neither of the two reads the third person. */
function proofHeadline(proof: NonNullable<LiveInput["proof"]>, voice: Voice, recipientName: string | null, builtBy: string | null): string {
  const yours = voice === "recipient";
  switch (proof) {
    case "pending":
      return yours ? L.awaitingProof.checkingYours : L.awaitingProof.checkingTheirs(recipientName);
    case "refused":
      return L.awaitingProof.refused;
    case "building":
      // Said by what the person will be able to do and when (10 Oct 2026); the page always knows the day.
      return yours ? L.awaitingProof.buildingYours(builtBy ?? "") : L.awaitingProof.buildingTheirs(builtBy ?? "");
    case "late":
      return L.awaitingProof.late;
    case "ended":
      return L.awaitingProof.ended;
    case "unread":
      return yours ? L.awaitingProof.unreadYours : L.awaitingProof.unreadTheirs(recipientName);
  }
}

/** What follows from a last day that has passed, under the state: until when, and where the money goes then. */
function proofNext(proof: NonNullable<LiveInput["proof"]>, voice: Voice, funderName: string | null, until: string | null): string | null {
  // Never reviewed in time: the contract takes no proof any more, and the pass sends the gift back.
  if (proof === "unread") return voice === "funder" ? L.over.byItself.theirs : L.over.byItself.yours;
  if (until === null) return null;
  if (proof === "late") return voice === "recipient" ? L.awaitingProof.lateNextYours(until) : voice === "funder" ? L.awaitingProof.lateNextTheirs(until) : L.awaitingProof.lateNextReading(until);
  if (proof === "ended") return voice === "recipient" ? L.awaitingProof.endedNextYours(funderName, until) : voice === "funder" ? L.awaitingProof.endedNextTheirs(until) : null;
  return null;
}

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
        // The promise, with the first name: who put it in whose name. What makes it theirs is the label under the
        // money, so "in your name" is said once (it was said twice until V4, headline and label).
        headline: yours
          ? L.unopened.yours(funderName)
          : voice === "funder"
            ? input.linkHere
              ? L.unopened.sendIt(recipientName)
              : L.unopened.theirs(recipientName)
            : L.unopened.reading(funderName, recipientName),
        // To the person who offered it, the amount is what they put in the other's name: said under it, where the
        // screen after paying said it as a title (the UI pass of 8 Oct 2026). The rule it pays by is in what was agreed.
        figure: { label: voice === "funder" ? L.unopened.inTheirName : promiseOf(input.shape ?? "days", yours, input.target), value: input.amountDisplay },
        next:
          input.openBy === null
            ? null
            : yours
              ? W.openBy(input.openBy, funderName)
              : voice === "funder"
                ? input.linkHere
                  ? L.unopened.whoeverOpens
                  : L.unopened.openByTheirs(input.openBy)
                : null,
        back,
      };

    case "openedNotConnected":
      return {
        headline: yours ? (input.sourceConnected ? L.notConnected.connected(source) : L.notConnected.yours(source)) : L.notConnected.theirs(recipientName, source),
        figure: { label: yours ? L.notConnected.label.yours : L.notConnected.label.theirs, value: input.amountDisplay },
        // Opened and never started, it goes back fourteen days after it was opened (both contracts): the next moment.
        next:
          input.connectBy === null
            ? null
            : yours
              ? input.sourceConnected
                ? L.notConnected.startBy(input.connectBy, funderName)
                : L.notConnected.connectBy(input.connectBy, funderName)
              : voice === "funder"
                ? L.notConnected.connectByTheirs(input.connectBy)
                : null,
        back,
      };

    case "counting":
      if (input.asItGoes) return asItGoesOf(input, input.asItGoes, back);
      return {
        // The last judged day, in the morning message's own words: the same wording whether the fact arrives on the
        // phone or on the screen. The money it carries there is the figure here, so the sentence does not repeat it.
        headline: !input.started
          ? L.counting.nothingYet
          : input.lastJudged === "earned"
            ? L.counting.counted
            : input.lastJudged === "returned"
              ? voice === "funder"
                ? L.counting.wentBackToYou
                : L.counting.wentBack(funderName)
              : L.counting.running,
        figure: { label: yours ? W.yoursSoFar : W.theirsSoFar, value: input.theirsDisplay },
        // The next reading is the hour beside the money while that column is free, and the dated sentence once what
        // has gone back takes it: said once either way.
        next: back === null && input.nextReadingAt ? null : input.nextReadingInWords,
        nextAt: back === null && input.nextReadingAt && input.nextReadingInWords ? { label: L.nextReading, value: input.nextReadingAt } : null,
        back,
        // Only to the person it is for, and only while the contract holds some of it: the figure already says how much.
        quiet: voice === "recipient" && input.takeableFromHome ? L.counting.takeFromHome : null,
      };

    case "climbing":
      return {
        headline: climbHeadline(input, yours),
        figure:
          input.todayReading === null
            ? null
            : { label: yours ? L.climbing.label.yours : L.climbing.label.theirs, value: String(input.todayReading) },
        // Read each time the page opens (the founder, 29 Sep 2026): the reading's own line says when, and no next time.
        next: null,
        back,
      };

    case "awaitingProof":
      return {
        // The one gesture, said as the headline: sharing a page, or showing it from their own account (D162). Once
        // there is a proof, or once the last day has passed, the headline says where it stands instead. A gift on a
        // year's results says the wait first, until the person says the results are out (10 Oct 2026).
        headline: input.proof
          ? proofHeadline(input.proof, voice, recipientName, input.builtByInWords ?? null)
          : input.waitsForResults
            ? yours
              ? L.awaitingProof.resultsYours
              : L.awaitingProof.resultsTheirs
            : input.shown
          ? yours
            ? L.awaitingProof.shownYours(source)
            : L.awaitingProof.shownTheirs(recipientName)
          : yours
            ? L.awaitingProof.yours
            : L.awaitingProof.theirs(recipientName),
        figure: { label: yours ? L.awaitingProof.label.yours : L.awaitingProof.label.theirs, value: input.amountDisplay },
        next: input.proof ? proofNext(input.proof, voice, funderName, input.lateUntilInWords ?? null) : input.waitsForResults && yours ? L.awaitingProof.resultsNextYours : null,
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
        // What happens to the money, to whom, and when: "back to you" is said to the funder and to nobody else.
        figure: { label: voice === "funder" ? L.startTooHigh.labelToFunder : L.startTooHigh.label(funderName), value: input.amountDisplay },
        next: input.deadlineInWords ? L.startTooHigh.on(input.deadlineInWords) : null,
        back,
      };

    case "won":
      return {
        headline: yours ? L.won.yours : L.won.theirs(recipientName),
        figure: { label: yours ? L.won.label.yours : L.won.label.theirs, value: input.theirsDisplay },
        next: input.endedOnInWords ? (input.shape === "days" ? L.won.finishedOn(input.endedOnInWords) : L.won.reachedOn(input.endedOnInWords)) : null,
        back,
      };

    case "ended": {
      const ending = input.ended;
      const kept = ending ? !isNothing(ending.keptDisplay) : false;
      const givenBack = { label: voice === "funder" ? L.cameBackToYou : L.cameBackTo(funderName), value: ending?.givenBackDisplay ?? input.amountDisplay };
      return {
        // The day is a label and who ended it is the headline (the mockup's fourth frame): no sentence carries a date.
        when: ending ? E.endedOn(ending.onInWords) : null,
        headline: yours ? E.endedYours : voice === "funder" ? E.endedTheirs(recipientName) : E.endedReading,
        // Two figures side by side: what stayed theirs, and what went back. When nothing stayed, what went back is
        // the one figure, and a zero is never printed beside it.
        figure: kept ? { label: yours ? E.label.yours : E.label.theirs, value: ending?.keptDisplay ?? "" } : givenBack,
        next: null,
        back: kept ? givenBack : null,
      };
    }

    case "over":
      return {
        // A proof shown and never reviewed is not the person's lateness: the headline says whose it was.
        headline: input.proof === "unread" ? proofHeadline("unread", voice, recipientName, null) : voice === "funder" ? L.over.theirs(recipientName) : L.over.yours,
        // Everything goes back when nothing was earned: the whole amount, whether or not it has been sent yet.
        figure: { label: voice === "funder" ? L.over.label.theirs : L.over.label.yours(funderName), value: input.amountDisplay },
        next:
          !isNothing(input.returnedDisplay) && input.cameBackOnInWords
            ? L.over.backOn(input.cameBackOnInWords)
            : voice === "funder"
              ? L.over.byItself.theirs
              : L.over.byItself.yours,
        back,
      };

    case "cameBack":
      return {
        headline: voice === "funder" ? L.cameBack.theirs : L.cameBack.yours(funderName),
        figure: { label: voice === "funder" ? L.cameBack.label.theirs : L.cameBack.label.yours, value: input.returnedDisplay },
        next: input.cameBackOnInWords === null ? null : L.cameBack.on(input.cameBackOnInWords),
        back: null,
      };
  }
}

/**
 * Where today stands, in the pieces the card's sentences are made of: each day named as a sentence names it, "today",
 * "yesterday" or its date, and how long is left as a figure, from the reader's own clock. With no day a lesson could
 * pay and none just counted, the gift's days are over.
 */
export function asItGoesNow(now: DayNow | null, nowMs: number, perDayDisplay: string, certifying: boolean, words: AsItGoes["words"]): AsItGoes {
  const today = Math.floor(nowMs / 86_400_000);
  const named = (day: number) => (day === today ? L.asItGoes.thisDay : day === today - 1 ? L.asItGoes.yesterday : contractDayInWords(day));
  if (!now) return { kind: "over", perDayDisplay, certifying: false, words };
  if (now.kind === "catchUp") return { kind: "catchUp", day: named(now.day), then: now.then === null ? null : named(now.then), left: leftInWords(now.deadlineMs, nowMs), perDayDisplay, certifying, words };
  if (now.kind === "open") return { kind: "open", left: leftInWords(now.endsAtMs, nowMs), perDayDisplay, certifying, words };
  // Counted: nothing is being read, whatever a page that has not caught up yet believes.
  return { kind: "counted", perDayDisplay, certifying: false, words };
}

/** A sentence's first letter in capitals: "yesterday" names a day inside a sentence and begins another. */
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A habit read as the day goes (the founder's mockup of 3 Oct 2026). The state is what a lesson done now would pay,
 * or that today is counted. Where the next reading was announced stands how long is left, at the reader's own clock,
 * and once today is counted, what today added. Nothing is announced, because nothing is waited for but the lesson.
 */
function asItGoesOf(input: LiveInput, now: AsItGoes, back: Live["back"]): Live {
  const yours = isTheirs(input.voice);
  const a = L.asItGoes;
  const headline = now.certifying
    ? yours
      ? now.words.inYours
      : now.words.inTheirs(input.recipientName)
    : now.kind === "catchUp"
      ? a.catchUp(capitalised(now.day ?? a.yesterday))
      : now.kind === "open"
        ? now.words.notIn
        : now.kind === "counted"
          ? a.counted
          : a.over;
  // What the next lesson pays, said only while an earlier day is open: the contract pays the oldest open day first.
  const line =
    now.kind === "catchUp" && now.day
      ? [yours ? now.words.nextPaysYours(now.day) : now.words.nextPaysTheirs(input.recipientName, now.day), now.then ? now.words.oneMorePays(now.then) : ""].filter(Boolean).join(" ")
      : null;
  const side =
    now.kind === "catchUp" && now.left && now.day
      ? { label: a.leftFor(now.day), value: now.left }
      : now.kind === "open" && now.left
        ? { label: a.leftToday, value: now.left }
        : now.kind === "counted"
          ? { label: a.today, value: a.plus(now.perDayDisplay) }
          : null;
  // Once what has gone back takes the right column, how long is left is a sentence under the state.
  const leftLine = back === null ? null : now.kind === "catchUp" && now.left && now.day ? a.leftForLine(now.left, now.day) : now.kind === "open" && now.left ? a.leftTodayLine(now.left) : null;
  const next = [line, leftLine].filter(Boolean).join(" ");
  return {
    headline,
    figure: { label: yours ? W.yoursSoFar : W.theirsSoFar, value: input.theirsDisplay },
    next: next.length > 0 ? next : null,
    nextAt: back === null ? side : null,
    back,
    quiet: input.voice === "recipient" && input.takeableFromHome ? L.counting.takeFromHome : null,
  };
}

/** What makes it theirs, in the fewest words, under the money of a gift nobody has opened yet. */
function promiseOf(shape: "days" | "climb" | "stamp", yours: boolean, target: number | null): string {
  const promise = L.unopened.promise[yours ? "yours" : "theirs"];
  if (shape === "climb" && target !== null) return promise.climb(target);
  return shape === "stamp" ? promise.stamp : promise.days;
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
