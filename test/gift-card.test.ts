import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
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
import { contrastRatio } from "../src/contrast";
import { COLOURS, TRACKING } from "../src/design-tokens";
import { OFFER } from "../src/sentences";

/**
 * The card a gift is filled in on (the product vision of 19 Sep 2026, and the drawn card of the same day).
 *
 * Two things are defended here. The rules: a card is complete exactly when a gift can be made from it, the terms it
 * writes are the terms the create routes already take, and nothing on it asks a visitor for an account. And the
 * drawing: there is one card in the product, this is that card empty, and what it shows at each step of its filling
 * is the table of section 2 rather than a list of labels and blanks, which is what the first version was.
 */

const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
const face = readFileSync("app/kit/GiftCard.tsx", "utf8");
const sheetFile = readFileSync("app/kit/Sheet.tsx", "utf8");
const sheets = ["WhoSheet", "WillSheet", "AmountSheet", "HowLongSheet"].map((name) => readFileSync(`app/kit/offer/${name}.tsx`, "utf8"));
const pay = readFileSync("app/components/PayGift.tsx", "utf8");
const ui = readFileSync("app/components/ui.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");

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

test("the shape a condition gives the card comes from the register, never from the screen", () => {
  assert.equal(shapeOf("duolingo-daily"), "days");
  assert.equal(shapeOf("chess-rating"), "climb");
  assert.equal(shapeOf("duolingo-english-test"), "stamp");
  assert.equal(shapeOf("nothing-like-this"), undefined);
  assert.match(card, /shapeOf\(draft\.conditionId\)/);
});

test("there is one card, and the one being filled in is drawn by it", () => {
  // The defect of 19 Sep: a second card was built beside the gift's own, and the new one was a list of definitions.
  assert.match(face, /export function CardFace\(/, "the drawing of a card is one function");
  assert.match(card, /import \{ CardFace \} from "\.\.\/GiftCard"/);
  assert.match(card, /<CardFace/);
  assert.doesNotMatch(card, /<dl|<dt|<dd/, "a card is not a list of definitions");
  // And it draws the product's own pieces rather than shapes of its own.
  for (const piece of ["Character", "DayStrip", "MilestoneMeter"]) {
    assert.match(card, new RegExp(`<${piece}`), `the card draws the gift's own ${piece}`);
  }
  assert.equal(globSync("app/kit/offer/ShapePreview.tsx").length, 0, "the shape invented beside the product's own is gone");
});

test("the card shows what the table says at each step of its filling", () => {
  // Empty: a gift with no name on it, and the question in the line under it.
  assert.equal(OFFER.emptyTitle, "A gift");
  assert.equal(OFFER.invites.for, "Who is it for?");
  assert.match(card, /line\("for", null, BODY\)/, "the empty card asks who it is for, where the condition will be");
  assert.match(card, /\{W\.emptyTitle\}/);
  // Named: the gift's own title, from the gift card's words, and the next question under it.
  assert.match(card, /line\("for", GIFT_CARD\.forName\(recipient\), ""\)/);
  assert.match(card, /line\("will", condition \? condition\.name : null, BODY\)/);
  // The shape appears with the condition, and it has the length of the gift once there is one.
  assert.match(card, /shape === undefined \?/);
  assert.match(card, /durationDays: filled\.howLong \? days : durationBounds\(draft\.conditionId\)\.suggested/);
  // The bottom: the amount at display size, the length in the third voice, and the action only when it can be pressed.
  assert.match(card, /money-display font-semibold tabular-nums/);
  assert.match(card, /line\("howLong", filled\.howLong \? W\.forHowLong\(days\) : null, META\)/);
  assert.match(card, /\{W\.stillNeeded\}/);
  assert.equal(OFFER.stillNeeded, "Fill the four, and it is ready");
});

test("an empty case says the word that is missing, in its place, and the whole line opens it", () => {
  assert.deepEqual(Object.keys(OFFER.invites).sort(), [...CARD_CASES].sort());
  for (const invite of Object.values(OFFER.invites)) assert.ok(invite.length > 0 && !invite.endsWith(":"), invite);
  assert.match(card, /onClick=\{\(\) => setOpen\(slot\)\}/, "a line of the card opens its own case");
  assert.match(card, /said === null \? "text-\[var\(--muted\)\]" : ""/, "and a missing word is said in the quiet voice");
  assert.doesNotMatch(card, /underline/, "an underlined link is not how a case says it is empty");
});

test("the accent is on Pay and nowhere else, on the card or in its sheets", () => {
  assert.equal(card.match(/className=\{PRIMARY_BUTTON\}/g)?.length, 1, "one action wears the accent");
  // A sheet ends a question; ending a question is not what the screen is asking for, so it takes the quiet fill.
  for (const source of sheets) assert.doesNotMatch(source, /PRIMARY_BUTTON/, "a sheet's own button wears the accent");
  assert.match(card, /\{W\.pay\(formatAusd\(units\)\)\}/);
  assert.doesNotMatch(card, /var\(--accent\)/, "nothing else on the card paints itself with the sun");
});

test("a card is seen as a card on the ground, which its surface alone does not do", () => {
  // The measurement that forced the ink edge (the drawn card, section 4): under 1.3:1, a card is a rectangle of
  // almost the same colour as the page, which is what the captures of 19 Sep showed.
  for (const appearance of ["light", "dark"] as const) {
    const palette = COLOURS[appearance];
    assert.ok(contrastRatio(palette.surface, palette.background) < 1.3, `${appearance} surface already stands off the ground`);
    assert.ok(contrastRatio(palette.controlBorder, palette.background) >= 3, `${appearance} ink edge is not seen on the ground`);
  }
  assert.match(ui, /export const CARD =\n?\s*"[^"]*border-\[var\(--control-border\)\]/, "the card's edge is the ink");
  assert.match(ui, /export const CARD =\n?\s*"[^"]*border-\[length:var\(--card-border-width\)\]/, "and it is still a hairline, not a control's outline");
});

test("the card's title is the title face at the mark's size, and the face is still named in two places only", () => {
  assert.equal(TRACKING.cardTitle, -0.5);
  assert.match(css, /--tracking-card-title: -0\.5px;/);
  assert.match(ui, /export const CARD_TITLE = `\$\{MARK\} tracking-\[var\(--tracking-card-title\)\]`/);
  assert.equal((ui.match(/var\(--font-title\)/g) ?? []).length, 2, "the card title composes the mark instead of naming the face");
  assert.match(face, /\$\{CARD_TITLE\} break-words/, "and the one card uses it");
});

test("a sheet rises from the bottom, darkens once, and leaves the card readable behind it", () => {
  assert.match(css, /dialog\.sheet \{[\s\S]*?margin: auto auto 0;/, "it sits on the bottom edge at every width");
  assert.match(css, /max-height: min\(88dvh/, "and stops under the top of the screen");
  const scrim = css.match(/--scrim: rgba\([^)]*,\s*([0-9.]+)\)/g) ?? [];
  assert.ok(scrim.length >= 2);
  for (const said of scrim) {
    const strength = Number(said.match(/([0-9.]+)\)$/)?.[1]);
    assert.ok(strength <= 0.5, `the page behind is darkened at ${strength}, which is a page nobody can read`);
  }
  assert.match(sheetFile, /onPointerDown/, "a sheet is dismissed by pulling it down, the gesture a sheet has");
  assert.match(sheetFile, /if \(pulled > 80\) dialog\.current\?\.close\(\)/);
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
  assert.match(sheetFile, /showModal\(\)/, "the browser keeps the focus inside it and Escape closes it");
  assert.match(sheetFile, /onCancel=\{onClose\}/);
  assert.match(sheetFile, /event\.target === dialog\.current/, "and pressing the backdrop leaves it");
  for (const source of sheets) {
    assert.match(source, /<Sheet\n?\s+open=\{open\}/, "each case is drawn in a sheet");
    assert.doesNotMatch(source, /next\/link|router\./, "a case never becomes a page");
  }
  // The four are drawn once and opened by name: an open dialog taken out of the page keeps its layer over it.
  assert.equal(card.match(/open=\{open === "/g)?.length, 4);
});

test("the page without an account is one line, the card, and one line", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  const signedOut = home.slice(home.indexOf("if (!address)"), home.indexOf("const moving ="));
  assert.match(signedOut, /<h1 className=\{TITLE\}>\{W\.promise\}<\/h1>\s*<OfferCard \/>/, "the promise is above the card, in one line");
  assert.match(signedOut, /<OfferCard \/>\s*<p className=\{PROSE\}>\{W\.promiseUnder\}<\/p>/, "and one sentence under it");
  assert.doesNotMatch(signedOut, /promiseBody|howItWorks|exampleGift/, "no third paragraph, and no example of a gift beside a real one");
  assert.match(signedOut, /min-h-\[68dvh\][\s\S]*justify-center/, "on a wide screen the card sits in the height rather than at the top of an empty page");
});
