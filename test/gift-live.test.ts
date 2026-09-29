import { strict as assert } from "node:assert";
import test from "node:test";
import { eyebrowOf, liveOf, titleOf, type LiveInput } from "../src/gift-live.js";
import type { Moment } from "../src/gift-moment.js";
import type { Voice } from "../src/gift-voice.js";

/**
 * The measure of document J, section 4, held as a test rather than counted after the fact: on one screen, no figure
 * is said twice. The page of 19 Sep failed it in all twenty-three of its states, saying a target three times, an
 * amount three times and a date three times on one of them.
 */

const MOMENTS: Moment[] = [
  "unopened",
  "openedNotConnected",
  "counting",
  "climbing",
  "awaitingProof",
  "startTooHigh",
  "won",
  "over",
  "cameBack",
];
const VOICES: Voice[] = ["recipient", "funder", "reader"];

const input = (over: Partial<LiveInput> = {}): LiveInput => ({
  moment: "counting",
  voice: "recipient",
  funderName: "Maman",
  recipientName: "Léa",
  source: "Duolingo",
  amountDisplay: "$7.00",
  theirsDisplay: "$2.00",
  returnedDisplay: "$1.00",
  todayReading: 1460,
  target: 1500,
  started: true,
  lastJudged: "earned",
  openBy: "3 Oct 2026",
  connectBy: "7 Oct 2026",
  nextReadingInWords: "Next reading: tomorrow at 9:00 AM your time.",
  cameBackOnInWords: "20 Sep 2026",
  ...over,
});

/** Every number a reader would read as a fact: money, a rating, a date. */
const figuresIn = (text: string) => text.match(/\$[0-9][0-9,]*\.[0-9]{2}|\b\d{1,2} [A-Z][a-z]{2} \d{4}\b|\b\d{3,5}\b/g) ?? [];

test("no figure is said twice, at any moment, in any voice", () => {
  for (const moment of MOMENTS) {
    for (const voice of VOICES) {
      const live = liveOf(input({ moment, voice }));
      const said = [live.headline, live.figure?.label ?? "", live.figure?.value ?? "", live.back?.label ?? "", live.back?.value ?? "", live.next ?? ""].join(" ");
      const seen = new Map<string, number>();
      for (const figure of figuresIn(said)) seen.set(figure, (seen.get(figure) ?? 0) + 1);
      for (const [figure, times] of seen) {
        assert.equal(times, 1, `${moment} as ${voice} says ${figure} ${times} times: "${said.trim()}"`);
      }
    }
  }
});

test("every moment leads with a sentence, in every voice", () => {
  for (const moment of MOMENTS) {
    for (const voice of VOICES) {
      const { headline } = liveOf(input({ moment, voice }));
      assert.ok(headline.trim().length > 0, `${moment} as ${voice} has no state sentence`);
      assert.match(headline, /[.!?]$/, `${moment} as ${voice} does not end its sentence: "${headline}"`);
    }
  }
});

test("the figure says what it is, and the two people never read the other one's label", () => {
  const theirs = liveOf(input({ moment: "won", voice: "recipient" }));
  assert.deepEqual(theirs.figure, { label: "Yours", value: "$2.00" });
  assert.equal(theirs.headline, "It is yours.");
  const funder = liveOf(input({ moment: "won", voice: "funder" }));
  assert.deepEqual(funder.figure, { label: "Theirs", value: "$2.00" });
  assert.equal(funder.headline, "Léa did it.", "the founder's words for the funder's moment (decision B)");
  // A reader who is neither reads the third person too, and never "yours".
  const reader = liveOf(input({ moment: "won", voice: "reader" }));
  assert.equal(reader.figure?.label, "Theirs");
  assert.doesNotMatch(reader.headline, /\byour\b/i);
});

test("a climb leads with what is left, and where they stand is the figure", () => {
  const live = liveOf(input({ moment: "climbing", todayReading: 1460, target: 1500 }));
  assert.equal(live.headline, "40 to go.");
  assert.deepEqual(live.figure, { label: "Today", value: "1460" });
  // Read as the page opens (the founder, 29 Sep 2026): its own line says when, and there is no next time to announce.
  assert.equal(live.next, null);
  // The target itself is not on the screen: it was read once, in the agreement, and it is folded there.
  assert.doesNotMatch(`${live.headline} ${live.figure?.value}`, /1500/);
  // A climb already at its target waits for the reading that settles it, and says so rather than "0 to go".
  assert.equal(liveOf(input({ moment: "climbing", todayReading: 1500 })).headline, "Reached. The next reading settles it.");
  assert.equal(liveOf(input({ moment: "climbing", todayReading: null })).headline, "Your first reading starts the climb.");
  assert.equal(liveOf(input({ moment: "climbing", todayReading: null })).figure, null);
});

test("a day counted is said in the morning message's own words, without its money", () => {
  assert.equal(liveOf(input({ lastJudged: "earned" })).headline, "Yesterday counted.");
  assert.equal(liveOf(input({ lastJudged: "returned" })).headline, "Yesterday went back to Maman. Today still counts.");
  assert.equal(liveOf(input({ lastJudged: "returned", voice: "funder" })).headline, "Yesterday came back to you. Today still counts.");
  assert.equal(liveOf(input({ started: false })).headline, "Nothing has been counted yet.");
  // A gift settled before Viky kept a record of each day: the totals are true, the last day is not known.
  assert.equal(liveOf(input({ lastJudged: null })).headline, "It is counting.");
  // Yesterday went back to the funder: "to you" is true of the funder alone, never of a reader of the link.
  assert.equal(liveOf(input({ lastJudged: "returned", voice: "funder" })).headline, "Yesterday came back to you. Today still counts.");
  assert.equal(liveOf(input({ lastJudged: "returned", voice: "reader" })).headline, "Yesterday went back to Maman. Today still counts.");
  assert.equal(liveOf(input({ lastJudged: "returned", voice: "recipient" })).headline, "Yesterday went back to Maman. Today still counts.");
  assert.equal(liveOf(input({ lastJudged: "returned", voice: "reader", funderName: null })).headline, "Yesterday went back to the person who offered it. Today still counts.", "never 'them', which could be either of the two");
  // A proof shown from the person's own account is shown, never shared (D162).
  assert.equal(liveOf(input({ moment: "awaitingProof", shown: true, source: "ETS" })).headline, "Show it from your own ETS account, and it is yours.");
  assert.equal(liveOf(input({ moment: "awaitingProof", shown: true, voice: "funder" })).headline, "Léa has not shown it yet.");
  for (const said of ["earned", "returned", null] as const) {
    assert.doesNotMatch(liveOf(input({ lastJudged: said })).headline, /\$/, "the money is the figure, not the sentence");
  }
});

test("what came back is said beside what is theirs, never as a zero, and never where it is the whole story", () => {
  // The mockup's right column: what has gone back to the funder so far, in the meta voice.
  assert.deepEqual(liveOf(input({ moment: "counting" })).back, { label: "Came back to Maman", value: "$1.00" });
  assert.deepEqual(liveOf(input({ moment: "counting", voice: "funder" })).back, { label: "Came back to you", value: "$1.00" });
  // Nothing has gone back: the column is not drawn rather than drawn as nothing.
  assert.equal(liveOf(input({ moment: "counting", returnedDisplay: "$0.00" })).back, null);
  // And on the two moments that are themselves about what came back, the figure is the headline's own.
  assert.equal(liveOf(input({ moment: "over" })).back, null);
  assert.equal(liveOf(input({ moment: "cameBack" })).back, null);
});

test("the line above the name never says 'your' to somebody the gift is not theirs to read as theirs", () => {
  assert.equal(eyebrowOf("funder", "Maman"), "Your gift");
  assert.equal(eyebrowOf("recipient", "Maman"), "A gift from Maman");
  assert.equal(eyebrowOf("reader", "Maman"), "A gift from Maman", "a reader holding the link is given the names");
  assert.equal(eyebrowOf("reader", null), "A gift", "a reader given no names reads no possessive");
  assert.equal(eyebrowOf("recipient", null), "Your gift", "a gift made before the names, to the person it is for");
  assert.equal(titleOf("recipient", "Léa"), "For you");
  assert.equal(titleOf("funder", "Léa"), "For Léa");
  assert.equal(titleOf("funder", null), "For whoever opens the link");
  assert.equal(titleOf("reader", null), "For somebody", "never a bare 'For'");
  assert.equal(titleOf("reader", "  "), "For somebody");
});

test("the next moment is only said where there is one, and it is the reader's own clock", () => {
  assert.equal(liveOf(input({ moment: "counting" })).next, "Next reading: tomorrow at 9:00 AM your time.");
  assert.equal(liveOf(input({ moment: "unopened" })).next, "Open it by 3 Oct 2026: after 14 days unopened, it goes back to Maman.");
  // The headline already says who has not opened or connected what: the next line says the date and nothing again.
  assert.equal(liveOf(input({ moment: "unopened", voice: "funder" })).next, "If not by 3 Oct 2026, it comes back to you.");
  assert.equal(liveOf(input({ moment: "openedNotConnected" })).next, "By 7 Oct 2026, or it goes back to Maman.");
  assert.equal(liveOf(input({ moment: "openedNotConnected", voice: "funder" })).next, "If not by 7 Oct 2026, it comes back to you.");
  assert.equal(liveOf(input({ moment: "openedNotConnected", voice: "reader" })).next, null, "a reader is told no deadline that is not theirs to meet");
  // The promise's rule under the money, so the headline's "in your name" is said once.
  assert.equal(liveOf(input({ moment: "unopened" })).figure?.label, "Yours day by day");
  assert.equal(liveOf(input({ moment: "unopened", shape: "climb", voice: "funder" })).figure?.label, "Theirs at 1500");
  assert.equal(liveOf(input({ moment: "unopened", shape: "stamp" })).figure?.label, "Yours with the proof");
  for (const moment of ["awaitingProof", "startTooHigh", "won"] as const) {
    assert.equal(liveOf(input({ moment })).next, null, `${moment} points at a next moment it does not have`);
  }
  assert.equal(liveOf(input({ moment: "cameBack" })).next, "On 20 Sep 2026.");
  // The endings (V4-3): the date the money moves, or that it moves by itself.
  assert.equal(liveOf(input({ moment: "startTooHigh", deadlineInWords: "13 Oct 2026" })).next, "On 13 Oct 2026, when the time is up.");
  assert.equal(liveOf(input({ moment: "won", endedOnInWords: "22 Sep 2026", shape: "climb" })).next, "Reached on 22 Sep 2026.");
  assert.equal(liveOf(input({ moment: "won", endedOnInWords: "22 Sep 2026", shape: "days" })).next, "Finished on 22 Sep 2026.");
  assert.equal(liveOf(input({ moment: "over" })).next, "Back on 20 Sep 2026.", "back already, and when");
  assert.equal(liveOf(input({ moment: "over", returnedDisplay: "$0.00" })).next, "Nothing to do: it goes back by itself.");
  assert.equal(liveOf(input({ moment: "over", returnedDisplay: "$0.00", voice: "funder" })).next, "Nothing to do: it comes back to you by itself.");
});

test("at the endings, 'back to you' is said to the funder and to nobody else, and each side reads its own question", () => {
  // Départ trop haut: the reason, and what happens to the money.
  assert.equal(liveOf(input({ moment: "startTooHigh", voice: "funder" })).figure?.label, "Comes back to you");
  assert.equal(liveOf(input({ moment: "startTooHigh", voice: "reader" })).figure?.label, "Goes back to Maman");
  // Échéance passée: "c'est fini ?" to the person, "je récupère quoi ?" to the funder.
  assert.equal(liveOf(input({ moment: "over" })).headline, "The time is up.");
  assert.equal(liveOf(input({ moment: "over", voice: "funder" })).headline, "Léa did not make it in time.");
  assert.deepEqual(liveOf(input({ moment: "over", voice: "funder" })).figure, { label: "Back to you", value: "$7.00" });
  assert.deepEqual(liveOf(input({ moment: "over", voice: "reader" })).figure, { label: "Back to Maman", value: "$7.00" });
  // Repris: where the money went, to the person; that it is back, to the funder.
  assert.equal(liveOf(input({ moment: "cameBack" })).headline, "Maman took it back before it was opened.");
  assert.equal(liveOf(input({ moment: "cameBack", voice: "funder" })).headline, "It is in your account again.");
  assert.equal(liveOf(input({ moment: "cameBack", voice: "funder" })).figure?.label, "Came back");
});

test("a gift nobody opened says whose name it is in, and the funder reads whether it was seen", () => {
  assert.equal(liveOf(input({ moment: "unopened" })).headline, "Maman put this in your name.");
  assert.equal(liveOf(input({ moment: "unopened", voice: "funder" })).headline, "Léa has not opened it yet.");
  assert.equal(liveOf(input({ moment: "unopened", voice: "reader" })).headline, "Maman put this in Léa's name.");
  // The amount is the figure at that moment, and the sentence leaves it to the figure.
  assert.equal(liveOf(input({ moment: "unopened" })).figure?.value, "$7.00");
  assert.doesNotMatch(liveOf(input({ moment: "unopened" })).headline, /\$/);
});

test("names that were never given leave sentences that still read", () => {
  const nameless = input({ funderName: null, recipientName: null });
  for (const moment of MOMENTS) {
    for (const voice of VOICES) {
      const live = liveOf({ ...nameless, moment, voice });
      assert.doesNotMatch(live.headline, /null|undefined/, `${moment} as ${voice}`);
      assert.doesNotMatch(live.figure?.label ?? "", /null|undefined/, `${moment} as ${voice}`);
    }
  }
});

test("while a daily gift counts, its recipient reads where money already theirs goes, and nobody else does (D208)", () => {
  const line = "It is yours already. Use it from Home whenever you like.";
  assert.equal(liveOf(input({ moment: "counting", voice: "recipient", takeableFromHome: true })).quiet, line);
  for (const voice of ["funder", "reader"] as const) assert.equal(liveOf(input({ moment: "counting", voice, takeableFromHome: true })).quiet ?? null, null, voice);
  assert.equal(liveOf(input({ moment: "counting", voice: "recipient", takeableFromHome: false })).quiet ?? null, null, "nothing held, nothing said");
  // The figure already says how much: the line carries no amount.
  assert.deepEqual(figuresIn(line), []);
  for (const moment of MOMENTS.filter((one) => one !== "counting")) {
    assert.equal(liveOf(input({ moment, voice: "recipient", takeableFromHome: true })).quiet ?? null, null, moment);
  }
});
