import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DUOLINGO_DAILY, conditionOfGoal } from "../src/conditions";
import { dayNow, leftInWords, lessonWouldPay } from "../src/day-now";
import { asItGoesNow, liveOf, type LiveInput } from "../src/gift-live";
import { GOAL_TYPE_DUOLINGO_COURSE_XP } from "../src/gift-terms";
import { FUND, GIFT_PAGE } from "../src/sentences";

/**
 * The day on the third daily contract, as its page says it (the founder's mockup of 3 Oct 2026): a lesson is paid the
 * day it is done, the oldest open day first. Four states, no button, and how long is left where the next reading was.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const CATCH_UP = 30 * 3_600;
const TODAY = 20_700;
/** 14:48 UTC on that day: nine hours and twelve minutes before the contract's day ends. */
const NOW = TODAY * DAY_MS + 14 * HOUR_MS + 48 * 60_000;
/** Seven days from the day of the connection, yesterday: today is day 2. */
const GIFT = { startDay: TODAY - 1, endDay: TODAY + 5, creditedDays: 1, missedDays: 0 };
const WORDS = DUOLINGO_DAILY.recipient!.asItGoes!;

test("where today stands: an earlier day still open, today waited for, today counted, or nothing", () => {
  // Day 1 counted, today open: the lesson of today is waited for until the contract's day ends.
  assert.deepEqual(dayNow(GIFT, CATCH_UP, NOW), { kind: "open", day: TODAY, endsAtMs: (TODAY + 1) * DAY_MS });
  // Today counted.
  assert.deepEqual(dayNow({ ...GIFT, creditedDays: 2 }, CATCH_UP, NOW), { kind: "counted", day: TODAY });
  // Yesterday missed and still inside its window, which ends at 06:00 UTC tomorrow: the next lesson pays it, one more pays today.
  assert.deepEqual(dayNow({ ...GIFT, creditedDays: 0 }, CATCH_UP, NOW), { kind: "catchUp", day: TODAY - 1, deadlineMs: (TODAY + 1) * DAY_MS + 6 * HOUR_MS, then: TODAY });
  // Two days open before 06:00: the oldest first, then yesterday. After 06:00 the oldest has gone and yesterday is next.
  const twoBehind = { startDay: TODAY - 2, endDay: TODAY + 4, creditedDays: 0, missedDays: 0 };
  assert.deepEqual(dayNow(twoBehind, CATCH_UP, TODAY * DAY_MS + 3 * HOUR_MS), { kind: "catchUp", day: TODAY - 2, deadlineMs: TODAY * DAY_MS + 6 * HOUR_MS, then: TODAY - 1 });
  assert.deepEqual(dayNow(twoBehind, CATCH_UP, TODAY * DAY_MS + 7 * HOUR_MS), { kind: "catchUp", day: TODAY - 1, deadlineMs: (TODAY + 1) * DAY_MS + 6 * HOUR_MS, then: TODAY });
  // The last day missed, the day after: it can still be caught up, and no day comes after it.
  const lastMissed = { startDay: TODAY - 7, endDay: TODAY - 1, creditedDays: 6, missedDays: 0 };
  assert.deepEqual(dayNow(lastMissed, CATCH_UP, NOW), { kind: "catchUp", day: TODAY - 1, deadlineMs: (TODAY + 1) * DAY_MS + 6 * HOUR_MS, then: null });
  // Past the last day with every day settled, a gift not connected, a clock not known yet: nothing.
  assert.equal(dayNow({ ...lastMissed, creditedDays: 7 }, CATCH_UP, NOW), null);
  assert.equal(dayNow({ ...GIFT, startDay: 0 }, CATCH_UP, NOW), null);
  assert.equal(dayNow(GIFT, CATCH_UP, 0), null);
  // A day given back by an ending is settled like any other.
  assert.deepEqual(dayNow({ ...GIFT, creditedDays: 1, givenBackDays: 1 }, CATCH_UP, NOW), { kind: "counted", day: TODAY });
  // The page looks only while a lesson would pay a day.
  assert.deepEqual([dayNow(GIFT, CATCH_UP, NOW), dayNow({ ...GIFT, creditedDays: 2 }, CATCH_UP, NOW), null].map(lessonWouldPay), [true, false, false]);
});

test("how long is left is a figure of hours and minutes, never seconds", () => {
  assert.equal(leftInWords((TODAY + 1) * DAY_MS, NOW), "9 h 12");
  assert.equal(leftInWords(NOW + 13 * HOUR_MS + 40 * 60_000, NOW), "13 h 40");
  assert.equal(leftInWords(NOW + 3 * HOUR_MS + 5 * 60_000 + 59_000, NOW), "3 h 05");
  assert.equal(leftInWords(NOW + 45 * 60_000, NOW), "45 min");
  assert.equal(leftInWords(NOW - 1, NOW), "0 min");
});

function input(over: Partial<LiveInput>): LiveInput {
  return {
    moment: "counting",
    voice: "recipient",
    funderName: "Mom",
    recipientName: "Boo",
    source: "Duolingo",
    amountDisplay: "$16.80",
    theirsDisplay: "$2.40",
    returnedDisplay: "$0.00",
    todayReading: null,
    target: null,
    started: true,
    lastJudged: "earned",
    openBy: null,
    connectBy: null,
    nextReadingInWords: null,
    cameBackOnInWords: null,
    ...over,
  };
}

const card = (gift: typeof GIFT, nowMs: number, over: Partial<LiveInput> = {}, certifying = false) => liveOf(input({ ...over, asItGoes: asItGoesNow(dayNow(gift, CATCH_UP, nowMs), nowMs, "$2.40", certifying, WORDS) }));

test("the four states of the mockup, to the person the gift is for", () => {
  // 1. Today is open, the lesson is not in yet: how long is left today, where the next reading was.
  const open = card(GIFT, NOW);
  assert.equal(open.headline, "Today's lesson is not in yet.");
  assert.deepEqual(open.figure, { label: "Yours so far", value: "$2.40" });
  assert.deepEqual(open.nextAt, { label: "Left today", value: "9 h 12" });
  assert.equal(open.next, null);
  // 2. The lesson is seen: the attested reading runs, and the figures do not move until it is counted.
  const seen = card(GIFT, NOW, {}, true);
  assert.equal(seen.headline, "Your lesson is in.");
  assert.deepEqual(seen.nextAt, { label: "Left today", value: "9 h 12" });
  // 3. Counted: what today added, where the time left was.
  const counted = card({ ...GIFT, creditedDays: 2 }, NOW, { theirsDisplay: "$4.80" });
  assert.equal(counted.headline, "Today counted.");
  assert.deepEqual(counted.figure, { label: "Yours so far", value: "$4.80" });
  assert.deepEqual(counted.nextAt, { label: "Today", value: "+ $2.40" });
  // 4. Yesterday can still be caught up: what the next lesson pays, and the real end of yesterday's window.
  const behind = card({ startDay: TODAY - 2, endDay: TODAY + 4, creditedDays: 1, missedDays: 0 }, TODAY * DAY_MS + 16 * HOUR_MS + 20 * 60_000);
  assert.equal(behind.headline, "Yesterday can still be caught up.");
  assert.equal(behind.next, "Your next lesson pays yesterday. One more pays today.");
  assert.deepEqual(behind.nextAt, { label: "Left for yesterday", value: "13 h 40" });
  // No state announces a next reading, and none says a figure twice.
  for (const live of [open, seen, counted, behind]) assert.ok(!JSON.stringify(live).includes("Next reading"));
});

test("the same four states to the person who offered it, and to a reader who is neither", () => {
  const theirs = { voice: "funder" as const };
  assert.equal(card(GIFT, NOW, theirs).headline, "Today's lesson is not in yet.");
  assert.deepEqual(card(GIFT, NOW, theirs).figure, { label: "Theirs so far", value: "$2.40" });
  assert.equal(card(GIFT, NOW, theirs, true).headline, "Boo's lesson is in.");
  assert.equal(card(GIFT, NOW, { ...theirs, recipientName: null }, true).headline, "Their lesson is in.");
  assert.equal(card({ ...GIFT, creditedDays: 2 }, NOW, theirs).headline, "Today counted.");
  const behind = card({ ...GIFT, creditedDays: 0 }, NOW, theirs);
  assert.equal(behind.headline, "Yesterday can still be caught up.");
  assert.equal(behind.next, "Boo's next lesson pays yesterday. One more pays today.");
  assert.equal(card({ ...GIFT, creditedDays: 0 }, NOW, { voice: "reader", recipientName: null }).next, "Their next lesson pays yesterday. One more pays today.");
});

test("an older day is named by its date, the last day has no day after it, and days over say so", () => {
  // Before 06:00 with two days behind: the oldest is the day before yesterday, named by its date.
  const twoBehind = { startDay: TODAY - 2, endDay: TODAY + 4, creditedDays: 0, missedDays: 0 };
  const early = card(twoBehind, TODAY * DAY_MS + 3 * HOUR_MS);
  assert.match(early.headline, /^\d{1,2} [A-Z][a-z]{2} can still be caught up\.$/);
  assert.match(String(early.next), /^Your next lesson pays \d{1,2} [A-Z][a-z]{2}\. One more pays yesterday\.$/);
  assert.match(String(early.nextAt?.label), /^Left for \d{1,2} [A-Z][a-z]{2}$/);
  assert.equal(early.nextAt?.value, "3 h 00");
  // The last day missed: the next lesson pays it, and nothing is promised after it.
  const last = card({ startDay: TODAY - 7, endDay: TODAY - 1, creditedDays: 6, missedDays: 0 }, NOW);
  assert.equal(last.next, "Your next lesson pays yesterday.");
  // Every day settled and the gift not closed yet: its days are over, and nothing is waited for.
  const over = card({ startDay: TODAY - 7, endDay: TODAY - 1, creditedDays: 7, missedDays: 0 }, NOW);
  assert.equal(over.headline, "Its days are over.");
  assert.equal(over.nextAt, null);
  assert.equal(over.next, null);
});

test("once a day has gone back it takes the right column, and how long is left is a sentence under the state", () => {
  const withBack = { returnedDisplay: "$2.40" };
  const open = card({ ...GIFT, missedDays: 0 }, NOW, withBack);
  assert.deepEqual(open.back, { label: "Back to Mom", value: "$2.40" });
  assert.equal(open.nextAt, null);
  assert.equal(open.next, "9 h 12 left today.");
  const behind = card({ ...GIFT, creditedDays: 0 }, NOW, { ...withBack, voice: "funder" });
  assert.deepEqual(behind.back, { label: "Back to you", value: "$2.40" });
  assert.equal(behind.next, "Boo's next lesson pays yesterday. One more pays today. 15 h 12 left for yesterday.");
  // Counted: what today added has no sentence, the figure of the money already moved.
  assert.equal(card({ ...GIFT, creditedDays: 2 }, NOW, withBack).next, null);
});

test("a gift on the first two versions reads as it always did, and the first day is said by the contract", () => {
  const before = liveOf(input({ nextReadingInWords: "Next reading: tomorrow, 5 Oct, at 02:30 your time.", nextReadingAt: "02:30" }));
  assert.equal(before.headline, "Yesterday counted.");
  assert.deepEqual(before.nextAt, { label: "Next reading", value: "02:30" });
  // The first day: the day after the connection on the first two versions, the day of the connection on the third.
  assert.equal(GIFT_PAGE.forDaysFromConnecting(7), "for 7 days from the day after it is connected");
  assert.equal(GIFT_PAGE.forDaysFromConnecting(7, true), "for 7 days from the day it is connected");
  assert.equal(FUND.made.firstDay("Duolingo"), "First day counted the day after they connect Duolingo.");
  assert.equal(FUND.made.firstDay("Duolingo", true), "First day counted the day they connect Duolingo.");
  assert.equal(FUND.made.next("Boo", "connects their Duolingo", "each day with a lesson", "$2.40", "09:00")[1], "From the day after, each day with a lesson puts $2.40 in Boo's name.");
  assert.equal(FUND.made.next("Boo", "connects their Duolingo", "each day with a lesson", "$2.40", "09:00", true)[1], "From that day, each day with a lesson puts $2.40 in Boo's name.");
  assert.equal(WORDS.countingFrom("4 Oct"), "Done. From today, 4 Oct, every day with your lesson is yours, counted the day you do it.");
  // A gift counted on one course is the same condition, with the same words.
  assert.equal(conditionOfGoal(GOAL_TYPE_DUOLINGO_COURSE_XP)?.recipient?.asItGoes, WORDS);
});

test("what was agreed says only what is guaranteed, and the judges page says the exact rule (the re-read of 3 Oct 2026, C2 and C4)", () => {
  // The founder's own sentence. The exact case, a second lesson after the day's pay, is not promised here.
  assert.equal(WORDS.agreed, "One lesson pays one day. A second lesson the same day counts for tomorrow only if today was already counted when it was taken.");
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /\{paysTheSameDay\(status\.version\) && words\?\.asItGoes \? <p className=\{BODY\}>\{words\.asItGoes\.agreed\}<\/p> : null\}/, "in what was agreed, for a gift on the third contract and for no other");
  const judges = readFileSync("app/judges/page.tsx", "utf8");
  // Said only once the third contract is set: until then no gift is on it.
  assert.match(judges, /const thirdVersionSet = giftEscrowV3Address\(\) !== null;/);
  assert.match(judges, /\{thirdVersionSet \? \(\n\s*<p className=\{HELP\} data-third-version-rule>/);
  assert.ok(judges.includes("A lesson taken after the day was paid is counted"), "the exact rule, first half");
  assert.ok(judges.includes("by the first reading of the next day; taken before, it is not kept."), "the exact rule, second half");
  // Where our own key is described: what it alone can do on the third contract, and what still holds.
  assert.ok(judges.includes("On the third daily contract this key alone can have a day paid from the moment a gift is connected, without the day's delay the second version left"));
  assert.ok(judges.includes("The money still goes only to the recipient or to the funder, and the pause is still the only brake."));
  // And the contract is listed first, as the chain answers for it, once it is set.
  assert.match(readFileSync("src/judges-chain.ts", "utf8"), /if \(escrowV3\) jobs\.push\(factsFor\("The gift contract, for a habit, third version: new gifts are made here, and a day is paid the day it is read", escrowV3, giftEscrowV3Abi as unknown as Abi,/);
});

test("the page reads as it opens, and nothing is pressed", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  // Read as the day goes: only a gift the server says is, in its counting moment, by either of its two people, while a
  // lesson would pay a day, and never once the month's limit is reached.
  assert.match(page, /const asItGoes = daily\?\.readLive && moment === "counting" \? \(words\?\.asItGoes \?\? null\) : null;/);
  assert.match(page, /const readsTheDay = Boolean\(asItGoes && \(mine \|\| readerIsFunder\) && !readingsStopped && lessonWouldPay\(today\)\);/);
  assert.match(page, /const dayReading = useDayReading\(readsTheDay, giftId, \(\) => void refresh\(\)\);/);
  // No next reading is announced and no count is offered for it.
  assert.match(page, /readingsStopped \|\| asItGoes \? null : W\.nextReading\(/);
  assert.match(page, /&& !gift\.sourceClosed && !readingsStopped && !asItGoes \? \(/);
  // The hook looks first, and asks for the count only for a lesson seen.
  const hook = readFileSync("app/kit/DayReading.tsx", "utf8");
  assert.ok(hook.indexOf("await lookNow(giftId)") > 0 && hook.indexOf("await lookNow(giftId)") < hook.indexOf("await countNow(giftId)"));
  assert.match(hook, /if \(looked\.kind !== "seen"\) \{\n\s*setState\(said\(looked\)\);\n\s*return;\n\s*\}/);
  // The status says which gifts are read so, from the server's own rule.
  assert.match(readFileSync("src/gift-status.ts", "utf8"), /readLive: readAsTheDayGoes\(record\),/);
});

test("the look taken as the page comes to the front is silent for a second, then a wheel beside the state, without a word", () => {
  const hook = readFileSync("app/kit/DayReading.tsx", "utf8");
  assert.match(hook, /export const LOOK_SILENT_MS = 1_000;/);
  // Only that look may show itself, and only over a card that was saying nothing: a failure stays said.
  assert.match(hook, /if \(cameToFront\) \{[\s\S]*?slow = window\.setTimeout\(\(\) => \{\s*if \(live\) setState\(\(before\) => \(before\.phase === "quiet" \? \{ phase: "looking" \} : before\)\);\s*\}, LOOK_SILENT_MS\);\s*cameToFront = false;/);
  // The looks of each minute stay silent: the mark is set again only when the page comes back to the front.
  assert.equal(hook.match(/cameToFront = true/g)?.length, 2, "as the page opens, and as it is brought back");
  // On the state's own line, with a name for a reader that speaks the page and no word on the screen.
  const card = readFileSync("app/kit/GiftLive.tsx", "utf8");
  assert.match(card, /<p className="gift-state">\s*\{live\.headline\}\s*\{looking && !waiting \? \(\s*<span className="gift-state-wheel-place">\s*<span className="working-ring working-ring-inline gift-state-wheel" role="status" aria-label=\{L\.asItGoes\.looking\} data-looking="" \/>\s*<\/span>\s*\) : null\}\s*<\/p>/);
  // Its place has no width: the wheel takes no room on the line, so nothing moves when it comes or goes.
  assert.match(readFileSync("app/globals.css", "utf8"), /\.gift-state-wheel-place \{\s*position: relative;\s*display: inline-block;\s*width: 0;\s*height: 0;\s*\}/);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /looking=\{dayReading\.phase === "looking"\}/);
});
