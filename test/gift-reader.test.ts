import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gesturesFor, notTheirs, voiceOf, type Gestures, type Voice } from "../src/gift-voice.js";
import { whoInWords, amountsInWords } from "../app/kit/GiftCard.js";
import { GIFT_PAGE, GIFT_CARD } from "../src/sentences.js";
import { CONDITIONS } from "../src/conditions.js";
import type { GiftSummary } from "../src/client/gift.js";

/**
 * A gift's page read by somebody who is neither of its two people (D99): a judge opening a link, most often.
 *
 * Found in production on 18 Sep 2026: a signed-in reader of /g/1 was told "$20.00 is in your name", which is false of
 * them, and the only thing that said otherwise was one line at the bottom. These tests hold the two halves of the fix:
 * the words are in the third person from the title down, and no gesture of the two people is offered.
 */

const OPENED = { youAreTheFunder: false, youAreTheRecipient: false, opened: true, cancelled: false };

test("a reader is whoever meets an opened gift that is neither theirs to fund nor theirs to earn", () => {
  assert.equal(voiceOf(OPENED), "reader");
  assert.equal(voiceOf({ ...OPENED, youAreTheFunder: true }), "funder");
  assert.equal(voiceOf({ ...OPENED, youAreTheRecipient: true }), "recipient");
  // Before it is opened, whoever holds the link is the person it is for: the link is the key, and opening is how they
  // become that person. A reader can only ever meet a gift somebody has already opened.
  assert.equal(voiceOf({ ...OPENED, opened: false }), "recipient");
});

test("only a reader signed in as somebody else is told the gift is not theirs", () => {
  assert.equal(notTheirs("reader", true), true);
  // With no account the page cannot know: they may be the person it is for, coming back to sign in.
  assert.equal(notTheirs("reader", false), false);
  assert.equal(notTheirs("recipient", true), false);
  assert.equal(notTheirs("funder", true), false);
});

test("a reader is offered no gesture at all, and the two people keep theirs", () => {
  const nothing = gesturesFor("reader", OPENED);
  for (const [gesture, offered] of Object.entries(nothing)) assert.equal(offered, false, `a reader is offered ${gesture}`);

  const recipient = gesturesFor("recipient", OPENED);
  assert.equal(recipient.countNow, true);
  assert.equal(recipient.takeTheMoney, true);
  assert.equal(recipient.connectTheAccount, true);
  assert.equal(recipient.copyTheLink, false, "the link lives on the device that made the gift");

  const funder = gesturesFor("funder", OPENED);
  assert.equal(funder.copyTheLink, true);
  assert.equal(funder.seeTheProof, true, "the proof of a day goes to both of them");
  assert.equal(funder.takeTheMoney, false, "what was earned leaves only to the person it is for");
  assert.equal(funder.countNow, false);

  // A gift taken back before it was opened has nothing left to do, whoever is reading.
  for (const voice of ["funder", "recipient", "reader"] as Voice[]) {
    const cancelled = gesturesFor(voice, { opened: false, cancelled: true });
    for (const [gesture, offered] of Object.entries(cancelled)) assert.equal(offered, false, `${voice} is offered ${gesture} on a gift taken back`);
  }
});

test("nothing a reader is shown speaks to them in the second person", () => {
  const you = /\b(your|yours|you)\b/i;
  assert.doesNotMatch(GIFT_PAGE.titleReading("Maman", "Ama", "$20.00"), you);
  assert.equal(GIFT_PAGE.titleReading("Maman", "Ama", "$20.00"), "Maman put $20.00 in Ama's name.");
  // Every gift does not carry both names: a gift made before the names existed carries neither.
  for (const [funder, recipient] of [
    ["Maman", null],
    [null, "Ama"],
    [null, null],
  ] as Array<[string | null, string | null]>) {
    const title = GIFT_PAGE.titleReading(funder, recipient, "$20.00");
    assert.doesNotMatch(title, you, `"${title}" speaks to the reader`);
    assert.match(title, /\$20\.00/);
  }
  assert.doesNotMatch(GIFT_CARD.fromFor("Maman", "Ama"), you);
  assert.doesNotMatch(GIFT_CARD.theirsGoneBack("$8.00", "$20.00", "$4.00"), you);
  assert.doesNotMatch(GIFT_PAGE.dayWords.returnedReading, you);
  assert.doesNotMatch(GIFT_PAGE.readingWhose("Maman", "Ama"), you);
  // The sentence beside the next reading: the register carries both persons, and a reader gets the third one.
  for (const condition of CONDITIONS) {
    if (!condition.recipient) continue;
    assert.doesNotMatch(condition.recipient.readsTheirs, you, `${condition.id} tells a reader Viky reads their own account`);
    assert.match(condition.recipient.reads, you, `${condition.id} no longer speaks to the person it is for`);
  }
  // With no account the page cannot know whose gift it is, so it asks rather than assumes.
  assert.match(GIFT_PAGE.signInToSee, /^Sign in if/);
  // The one sentence that does address them says the one thing that is true of them.
  assert.match(GIFT_PAGE.notYours, /not yours/i);
});

const summary = (role: GiftSummary["role"]): GiftSummary =>
  ({
    giftId: "1",
    role,
    goalType: 1,
    goalUsername: "ama_learns",
    usernameSource: "funder",
    recipientName: "Ama",
    funderName: "Maman",
    catchUpSeconds: 86_400,
    days: [],
    fundedAt: 0,
    startDay: 20_700,
    endDay: 20_707,
    amountDisplay: "$20.00",
    perDayDisplay: "$2.85",
    durationDays: 7,
    creditedDays: 1,
    missedDays: 3,
    opened: true,
    counting: true,
    finished: false,
    cancelled: false,
    earnedDisplay: "$2.85",
    theirsDisplay: "$2.85",
    returnedDisplay: "$8.55",
  }) as GiftSummary;

test("the card at the head of the page names both sides when neither of them is reading", () => {
  assert.equal(whoInWords(summary("reader")), "From Maman, for Ama");
  assert.equal(whoInWords(summary("recipient")), "From Maman");
  assert.equal(whoInWords(summary("funder")), "For Ama");

  const reader = amountsInWords(summary("reader"), true);
  assert.equal(reader, "$2.85 of $20.00 theirs, $8.55 gone back");
  assert.doesNotMatch(reader, /\byours?\b/i);
  // The funder's line says where the money came back to, which is only true of them.
  assert.match(amountsInWords(summary("funder"), true), /back to you/);
});

test("the page decides who may do what in one place, and not in ten conditions of its own", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /const voice = voiceOf\(gift\)/);
  assert.match(page, /const may = gesturesFor\(voice, gift\)/);
  for (const gesture of ["openTheGift", "connectTheAccount", "countNow", "takeTheMoney", "seeTheProof", "beTold", "copyTheLink"] as Array<keyof Gestures>) {
    assert.match(page, new RegExp(`may\\.${gesture}\\b`), `${gesture} is no longer read from the one place that decides it`);
  }
  // The title, the card and the state all follow the voice, so a reader cannot be handed the recipient's words again.
  assert.match(page, /titleReading\(funder, recipient, gift\.amountDisplay\)/);
  assert.match(page, /summaryOf\(gift, voice\)/);
  assert.match(page, /voice=\{voice\}/, "the row of days still speaks in one fixed voice");
  assert.match(page, /voice === "recipient" \? words\?\.reads : words\?\.readsTheirs/, "the reading sentence is back in the second person for everybody");
});
