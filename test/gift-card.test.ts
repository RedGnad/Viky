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
import { COLOURS } from "../src/design-tokens";
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
  for (const piece of ["DayStrip", "MilestoneMeter"]) {
    assert.match(card, new RegExp(`<${piece}`), `the card draws the gift's own ${piece}`);
  }
  assert.equal(globSync("app/kit/offer/ShapePreview.tsx").length, 0, "the shape invented beside the product's own is gone");
});

test("the card shows what the rendered mockups show, in their order", () => {
  // The label, the name with the question in its place, what they will do, the days, the amount, the length.
  assert.equal(OFFER.yourGift, "Your gift");
  assert.equal(OFFER.fromFunder("Mum"), "A gift from Mum");
  assert.equal(OFFER.forName("Léa"), "For Léa");
  assert.equal(OFFER.forNobody, "For");
  assert.equal(OFFER.who, "who?");
  assert.match(card, /\{funder \? W\.fromFunder\(funder\) : W\.yourGift\}/);
  assert.match(card, /underline decoration-dotted/, "the question is where the name will be, not a link at the right");
  assert.match(card, /line\("will", condition \? condition\.name : null/);
  assert.match(card, /\{W\.daysAppear\}/, "and the days say they are waiting for the condition");
  // The shape appears with the condition, and it has the length of the gift once there is one.
  assert.match(card, /durationDays: filled\.howLong \? days : durationBounds\(draft\.conditionId\)\.suggested/);
  // The star of the screen, and the length under it in the third voice.
  assert.match(card, /\{formatAusd\(units \?\? 0n\)\}/, "an amount nobody has given is $0.00 in the faint ink");
  assert.match(card, /\{amountLine\}/);
  assert.match(card, /line\("howLong", filled\.howLong \? W\.forHowLong\(days\) : null, CARD_LABEL/);
  // One button, always drawn, shut until the four are filled and saying what it waits for.
  assert.equal(OFFER.stillNeeded, "Fill the four to pay");
  assert.match(card, /disabled=\{!ready \|\| units === undefined\}/);
});

test("an empty case says the word that is missing, in its place, and the whole line opens it", () => {
  assert.deepEqual(Object.keys(OFFER.invites).sort(), [...CARD_CASES].sort());
  for (const invite of Object.values(OFFER.invites)) assert.ok(invite.length > 0 && !invite.endsWith(":"), invite);
  assert.match(card, /onClick=\{\(\) => setOpen\(slot\)\}/, "a line of the card opens its own case");
  assert.match(card, /said === null \? faint : ""/, "and a missing word is said in the faint ink of the paper");
  // The one underline on the card is the dotted one under "who?", which is the question in the name's own place.
  assert.equal(card.match(/underline/g)?.length, 2, "no underlined link stands in for an empty case");
  assert.match(card, /decoration-dotted/);
});

test("one accent per surface: the card's Pay, and a sheet's own Done", () => {
  assert.equal(card.match(/PRIMARY_BUTTON\b/g)?.length, 2, "the one action, imported once and drawn once");
  // While a sheet is open it is the surface a person is on, and the card's action is behind the veil, so the sheet's
  // Done wears the sun (the rendered mockups). Nothing else inside a sheet does.
  for (const source of sheets) {
    assert.equal(source.match(/className=\{PRIMARY_BUTTON\}/g)?.length, 1, "a sheet has one action in the sun");
  }
  assert.match(card, /W\.pay\(formatAusd\(units\)\) : W\.stillNeeded/, "the same button, saying what it waits for");
  assert.doesNotMatch(card, /var\(--accent\)/, "nothing else on the card paints itself with the sun");
});

test("a card is the light object on the ground, as the rendered mockups draw it", () => {
  // Night is drawn: cream paper on the ink ground, 17:1 apart, with a shadow under it and no edge at all.
  assert.match(css, /--paper: #FFF6E2;/);
  assert.ok(contrastRatio("#FFF6E2", COLOURS.dark.background) > 15, "the card and the ground are never the same value");
  assert.match(css, /--card-shadow: 0 20px 44px rgba\(0, 0, 0, 0\.5\);/);
  assert.match(css, /--card-edge: transparent;/);
  // Day is drawn too since home-light.html: the same cream, on a lavender ground, with its own softer shadow and a
  // warm hairline. The near-white card it replaced stood at 1.09:1 on its ground and needed a hairline of ink.
  assert.ok(contrastRatio("#FFF6E2", COLOURS.light.background) >= 1.3);
  assert.match(css, /--card-edge: #F0E3C2;/);
  assert.match(css, /--card-shadow: 0 16px 40px rgba\(30, 22, 51, 0\.2\);/);
  // Everything inside a card reads on paper, so nothing inside one had to be rewritten for the ink to change.
  assert.match(ui, /export const CARD =\n?\s*"on-paper/);
  for (const said of ["--text: var(--on-surface)", "--muted: var(--on-surface-muted)", "--control-border: var(--on-surface)"]) {
    assert.ok(css.includes(said), `the paper re-points ${said}`);
  }
});

test("the card's three voices are the image's own sizes", () => {
  // The mockups' numbers, not the scale's: 28 for the name it carries, 42 for the amount, 11 for a label.
  assert.match(css, /--type-card-who: 28px;/);
  assert.match(css, /--type-card-amount: 42px;/);
  assert.match(css, /--type-card-label: 11px;/);
  assert.match(ui, /export const CARD_TITLE = `\$\{TITLE_FACE\} text-\[length:var\(--type-card-who\)\]/);
  assert.match(ui, /export const CARD_AMOUNT = `\$\{TITLE_FACE\} text-\[length:var\(--type-card-amount\)\]/);
  assert.match(ui, /export const CARD_LABEL =\n?\s*"text-\[length:var\(--type-card-label\)\]/);
  assert.match(face, /\$\{CARD_TITLE\} break-words/, "and the one card wears them");
});

test("a sheet rises from the bottom, darkens once, and leaves the card readable behind it", () => {
  assert.match(css, /dialog\.sheet \{[\s\S]*?margin: auto auto 0;/, "it sits on the bottom edge at every width");
  assert.match(css, /max-height: 74dvh;/, "and stops under the top of the screen, where the mockups cap it");
  assert.match(sheetFile, /h-\[5px\] w-\[44px\]/, "with the handle the mockups draw");
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

test("nothing on the card asks for an account, and the sheet that pays makes it at the press", () => {
  for (const source of [card, ...sheets]) {
    assert.doesNotMatch(source, /ensureSigner|signIn\(|createAccount|AccountPanel/, "the card asks nobody to sign in");
  }
  assert.match(card, /setPaying\(true\)/, "the one action of a filled card opens the sheet that pays for it");
  // And that sheet says what pressing it will do before it does it (the mockup pay.html). The panel that makes an
  // account by hand is its fallback, for a device the passkey could not serve, and it appears in place.
  const paySheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(paySheet, /await ensureSigner\(\)/);
  assert.match(paySheet, /W\.passkeyMakesTheAccount/);
  assert.match(paySheet, /\{problem && !address \? <AccountPanel \/> : null\}/);
  // On the paying screen the passkey is opened at the signature and nowhere earlier.
  const give = pay.slice(pay.indexOf("const give = useCallback"), pay.indexOf("const record: Made"));
  assert.ok(give.indexOf("await ensureSigner()") < give.indexOf("await prepareGift({"), "the passkey opens before the terms are signed");
  // The paying screen no longer makes an account at all: it is made in the sheet, at the press (the mockup pay.html).
  assert.doesNotMatch(pay, /W\.account\.title/, "the screen that used to ask for an account first is gone");
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
  // The hero of the mockups: the gift character beside the promise, one line under it, then the card, in that order.
  assert.match(signedOut, /<Character state="gift" tone="sun"/);
  assert.match(signedOut, /<h1 className=\{HERO\}>\{W\.promise\}<\/h1>/);
  assert.ok(signedOut.indexOf("{W.promiseUnder}") < signedOut.indexOf("<OfferCard />"), "the line under the promise comes before the card");
  assert.doesNotMatch(signedOut, /promiseBody|howItWorks|exampleGift/, "no third paragraph, and no example of a gift beside a real one");
  assert.match(signedOut, /min-h-\[68dvh\][\s\S]*justify-center/, "on a wide screen the card sits in the height rather than at the top of an empty page");
});
