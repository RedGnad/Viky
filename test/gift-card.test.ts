import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CARD_CASES,
  DAILY_DURATION,
  draftFromTerms,
  draftToTerms,
  durationBounds,
  EMPTY_DRAFT,
  filledCases,
  isComplete,
  nextCase,
  shapeOf,
  type GiftDraft,
} from "../src/gift-draft";
import { CHESS_MILESTONE, DET_MILESTONE } from "../src/milestone-conditions";
import { MAX_GIFT_UNITS } from "../src/money";
import { OFFER } from "../src/sentences";

/**
 * The card a gift is filled in on (the product vision of 19 Sep 2026, sections 4 and 6).
 *
 * What these tests defend is the join between an object and the routes under it: a card is complete exactly when a
 * gift can be made from it, the terms it writes are the terms those routes already take, and nothing on it asks a
 * visitor for an account. The screens themselves are read as text, the way the other screen tests do, because what
 * matters here is which file asks what: the four questions are on the card, and the money is not.
 */

const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
const sheets = ["WhoSheet", "WillSheet", "AmountSheet", "HowLongSheet"].map((name) => readFileSync(`app/kit/offer/${name}.tsx`, "utf8"));
const pay = readFileSync("app/components/PayGift.tsx", "utf8");

const lesson: GiftDraft = {
  recipientName: "Léa",
  funderName: "Mum",
  conditionId: "duolingo-daily",
  subject: "",
  target: "10",
  dollars: "30",
  days: "30",
};

test("four cases, and each one is filled by its own answer", () => {
  assert.deepEqual(CARD_CASES, ["for", "will", "amount", "howLong"]);
  assert.deepEqual(filledCases(EMPTY_DRAFT), { for: false, will: false, amount: false, howLong: false });
  assert.equal(nextCase(EMPTY_DRAFT), "for");
  assert.deepEqual(filledCases(lesson), { for: true, will: true, amount: true, howLong: true });
  assert.equal(isComplete(lesson), true);
  assert.equal(nextCase(lesson), undefined);
  // One name is not two: the gift says who it is for and who it is from.
  assert.equal(filledCases({ ...lesson, funderName: "" }).for, false);
  assert.equal(nextCase({ ...lesson, funderName: "" }), "for");
});

test("a case is filled only by an answer the routes would accept", () => {
  assert.equal(filledCases({ ...lesson, dollars: "0.50" }).amount, false, "under the contract's own floor");
  assert.equal(filledCases({ ...lesson, dollars: "1001" }).amount, false, "over the pilot's ceiling");
  assert.equal(filledCases({ ...lesson, dollars: "1000" }).amount, true);
  assert.equal(filledCases({ ...lesson, days: "6" }).howLong, false);
  assert.equal(filledCases({ ...lesson, days: "91" }).howLong, false);
  assert.equal(filledCases({ ...lesson, target: "0" }).will, false, "a day has a bar to reach");
  // The name is the funder's to give or to leave: only a wrong one is refused (D27).
  assert.equal(filledCases({ ...lesson, subject: "ama_learns" }).will, true);
  assert.equal(filledCases({ ...lesson, subject: "not a name!" }).will, false);
});

test("the days the card offers are the days the route accepts, to the number", () => {
  const route = readFileSync("app/api/gift/create/route.ts", "utf8");
  assert.match(route, new RegExp(`durationDays < ${DAILY_DURATION.min} \\|\\| durationDays > ${DAILY_DURATION.max}`));
  assert.ok(DAILY_DURATION.min <= DAILY_DURATION.suggested && DAILY_DURATION.suggested <= DAILY_DURATION.max);
  assert.deepEqual(durationBounds("duolingo-daily"), DAILY_DURATION);
  assert.deepEqual(durationBounds("chess-rating"), CHESS_MILESTONE.duration);
  assert.deepEqual(durationBounds("duolingo-english-test"), DET_MILESTONE.duration);
  assert.equal(MAX_GIFT_UNITS, 1_000_000_000n, "and the amount is bounded by the one rule, in src/money.ts");
});

test("a climb needs its cadence and the reading the funder chose from; a certificate needs a name and a score", () => {
  const climb: GiftDraft = { ...lesson, conditionId: "chess-rating", subject: "erik", target: "1200", days: "30" };
  assert.equal(filledCases(climb).will, false, "no cadence, no reading");
  assert.equal(filledCases({ ...climb, cadence: "rapid", standing: 1100, standingReadAt: "2026-09-19T00:00:00.000Z" }).will, true);
  // A target at or under where they stand is not a climb (D45), and the register's own rule says so.
  assert.equal(filledCases({ ...climb, cadence: "rapid", standing: 1300, standingReadAt: "2026-09-19T00:00:00.000Z" }).will, false);

  const certificate: GiftDraft = { ...lesson, conditionId: "duolingo-english-test", subject: "Lea Martin", target: "120", days: "90" };
  assert.equal(filledCases(certificate).will, true);
  assert.equal(filledCases({ ...certificate, subject: "Lea" }).will, false, "the certificate carries a full name (U3)");
  assert.equal(filledCases({ ...certificate, target: "123" }).will, false, "the score is the source's own scale");
});

test("the shape comes from the register, never from the screen", () => {
  assert.equal(shapeOf("duolingo-daily"), "days");
  assert.equal(shapeOf("chess-rating"), "climb");
  assert.equal(shapeOf("duolingo-english-test"), "stamp");
  assert.equal(shapeOf("nothing-like-this"), undefined);
  const preview = readFileSync("app/kit/offer/ShapePreview.tsx", "utf8");
  assert.match(card, /shapeOf\(draft\.conditionId\)/);
  assert.match(card, /<ShapePreview shape=\{shape\}/);
  assert.match(preview, /shape === "days"/);
});

test("what the card writes is what the gift is made from, and it comes back the same", () => {
  const climb: GiftDraft = {
    ...lesson,
    conditionId: "chess-rating",
    subject: "erik",
    cadence: "rapid",
    standing: 1100,
    standingReadAt: "2026-09-19T00:00:00.000Z",
    target: "1200",
  };
  for (const draft of [lesson, climb, { ...lesson, course: "es", courseTitle: "Spanish" }]) {
    assert.deepEqual(draftFromTerms(draftToTerms(draft, undefined)), draft, "nothing is lost on the way to the device");
  }
  // A card nobody has signed in for belongs to nobody yet, and takes the account only when one pays (D74).
  assert.equal(draftToTerms(lesson, undefined).account, "");
  assert.equal(draftToTerms(lesson, "0xABC").account, "0xABC");
});

test("nothing on the card asks for an account, and the paying screen asks for one before it signs anything", () => {
  for (const source of [card, ...sheets]) {
    assert.doesNotMatch(source, /ensureSigner|signIn\(|createAccount|AccountPanel/, "the card asks nobody to sign in");
  }
  assert.match(card, /router\.push\("\/fund"\)/, "the one action of a filled card is to pay for it");
  // On the paying screen the passkey is opened at the signature and nowhere earlier.
  const give = pay.slice(pay.indexOf("const give = useCallback"), pay.indexOf("const record: Made"));
  assert.ok(give.indexOf("await ensureSigner()") < give.indexOf("await prepareGift({"), "the passkey opens before the terms are signed");
  assert.match(pay, /<AccountPanel \/>/, "and an account is made on the paying screen");
});

test("a case opens in a sheet, and a sheet is a dialog rather than a page", () => {
  const sheet = readFileSync("app/kit/Sheet.tsx", "utf8");
  assert.match(sheet, /showModal\(\)/, "the browser keeps the focus inside it and Escape closes it");
  assert.match(sheet, /onCancel=\{onClose\}/);
  assert.match(sheet, /event\.target === dialog\.current/, "and pressing the backdrop leaves it");
  for (const source of sheets) {
    assert.match(source, /<Sheet\n?\s+open=\{open\}/, "each case is drawn in a sheet");
    assert.doesNotMatch(source, /next\/link|router\./, "a case never becomes a page");
  }
  // The four are drawn once and opened by name: an open dialog taken out of the page keeps its layer over it.
  assert.equal(card.match(/open=\{open === "/g)?.length, 4);
});

test("the card says what is still missing rather than showing an action that cannot be pressed", () => {
  assert.match(card, /\{W\.pay\(formatAusd\(units\)\)\}/);
  assert.match(card, /\{W\.stillNeeded\}/);
  assert.equal(OFFER.pay("$30.00"), "Pay $30.00");
  assert.match(OFFER.invitation, /Nothing is asked of you until you pay/);
});
