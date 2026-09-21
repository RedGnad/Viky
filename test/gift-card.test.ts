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
  STARTING_DRAFT,
  type GiftDraft,
} from "../src/gift-draft";
import { CHESS_MILESTONE, DET_MILESTONE } from "../src/milestone-conditions";
import { MAX_GIFT_UNITS } from "../src/money";
import { contrastRatio } from "../src/contrast";
import { COLOURS } from "../src/design-tokens";
import { conditionById } from "../src/conditions";
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
// One sheet is left on the card: the catalogue and then the condition's own questions (the founder, 20 Sep 2026).
const sheets = ["WillSheet"].map((name) => readFileSync(`app/kit/offer/${name}.tsx`, "utf8"));
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
  // The funder's own name is not asked for on the card and never blocks: the card says "a gift from you" until
  // they write one, and a gift from nobody is one this product has always made (the founder, 20 Sep 2026).
  assert.equal(filledCases({ ...lesson, funderName: "" }).for, true);
  assert.equal(isComplete({ ...lesson, funderName: "" }), true);
});

/**
 * The card a visitor meets is a plausible gift, not four holes: the one thing left empty is the first name, and the
 * action can be pressed from the first second, because nothing is taken until the passkey (the founder, 20 Sep 2026).
 */
test("the card opens filled, and the only empty thing on it is the name", () => {
  assert.equal(STARTING_DRAFT.recipientName, "", "the one thing Viky cannot guess");
  assert.equal(STARTING_DRAFT.funderName, "");
  assert.equal(STARTING_DRAFT.dollars, "30");
  assert.equal(STARTING_DRAFT.days, String(DAILY_DURATION.suggested));
  assert.ok(STARTING_DRAFT.conditionId.length > 0 && conditionById(STARTING_DRAFT.conditionId)?.live, "a condition a gift can really be made on");
  assert.deepEqual(filledCases(STARTING_DRAFT), { for: false, will: true, amount: true, howLong: true });
  assert.equal(isComplete(STARTING_DRAFT), true, "the action says what it will take from the first screen");
  // And the screens read that card rather than an empty one, on the server as in the browser.
  assert.match(readFileSync("src/card-draft.ts", "utf8"), /return STARTING_DRAFT;/);
  assert.match(card, /startingCardDraft\)/);
  // The card does not take the cursor by itself (D140): on a phone it raised the keyboard as the page opened.
  assert.doesNotMatch(card, /autoFocus/, "nothing on the card takes the cursor by itself");
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
  // And it draws the product's own pieces rather than shapes of its own: the day strip for a gift counted by days,
  // and the milestone's own character for a climb. Its meter stays on a gift that has been read (D132): on a card
  // being filled in there is no reading, so the bar was always empty and said nothing.
  for (const piece of ["DayStrip", "Character"]) {
    assert.match(card, new RegExp(`<${piece}`), `the card draws the gift's own ${piece}`);
  }
  assert.doesNotMatch(card, /<MilestoneMeter/, "an empty bar is not a picture of anything");
  // And that one character stands in the middle of the card, not at its left margin (D133).
  assert.match(card, /<span className="flex justify-center">\s*<Character state="toCome"/);
  // The condition line is a control, so it gets more room under the name than a caption would (D133).
  assert.match(card, /className=\{`\$\{INLINE_BUTTON\} mt-\[var\(--space-sm\)\] w-full/);
  assert.equal(globSync("app/kit/offer/ShapePreview.tsx").length, 0, "the shape invented beside the product's own is gone");
});

test("the card shows what the rendered mockups show, in their order", () => {
  // The label with the funder in it, the name in its own line, what they will do, the days, the amount, the length.
  // The line that says whose gift it is belongs to a gift's own page, where the reader is somebody else. On the card
  // a funder is filling in it said what they already knew, so it is gone from there (D138) and the words stay.
  assert.equal(OFFER.fromYou, "A gift from you");
  assert.equal(OFFER.fromFunder("Mum"), "A gift from Mum");
  assert.equal(OFFER.forNobody, "For");
  assert.equal(OFFER.who, "who?");
  assert.doesNotMatch(card, /\{funder \? W\.fromFunder\(funder\) : W\.fromYou\}/, "the card being filled in carries no such line (D138)");
  assert.match(card, /placeholder=\{W\.who\}/);
  assert.match(card, /\{condition \? condition\.name : W\.invites\.will\}/);
  // The shape has the length of the gift, and one mark a day; the row says for itself which edge still hides one.
  assert.match(card, /durationDays: Number\.isInteger\(days\) && days > 0 \? days : bounds\.suggested/);
  assert.doesNotMatch(card, /day-row-fade|day-row-frame/, "the fade is the row's own now, at the edge that hides a day (D145)");
  // The star of the screen, typed where it stands, and the length on chips under it.
  // The figure is typed in the currency the person reads in (D143), and its mark is drawn in the house's own line
  // and stands in front of the figure whatever the currency (D145), so pressing it never moves the field.
  assert.match(card, /<MoneyMark currency=\{money\.currency\} \/>/);
  assert.match(card, /figureWithMark\(readableFigure\(/);
  assert.match(card, /quick\.map\(\(count\) =>/);
  // The three the register gives this condition, and no fourth (D130): the chip that opened a field is gone, and so
  // is the field, so the only lengths a card offers are the three the register was asked about.
  assert.match(card, /const quick = \[bounds\.min, bounds\.suggested, bounds\.max\];/);
  assert.doesNotMatch(card, /otherLength|typingDays|aria-label=\{W\.daysLabel\}/);
  assert.doesNotMatch(readFileSync("src/sentences.ts", "utf8"), /otherLength:/, "and the sentence it carried is gone with it");
  assert.match(card, /disabled=\{!ready\}/);
});

/**
 * A field is edited where it stands (the founder, 20 Sep 2026): opening a page to type a first name or an amount is
 * a journey wearing a card's clothes, and worse still on a keyboard. What keeps a sheet is what is a real choice.
 */
test("the name, the amount and the length are typed on the card, and nothing opens a sheet for them", () => {
  for (const gone of ["WhoSheet", "AmountSheet", "HowLongSheet"]) {
    assert.equal(globSync(`app/kit/offer/${gone}.tsx`).length, 0, `${gone} is gone`);
  }
  assert.match(card, /value=\{draft\.recipientName\}/, "the name is typed on the card");
  // The amount too, though what the field holds is the person's own currency and what the draft carries is the
  // dollars the contract will hold (D143).
  assert.match(card, /value=\{typed\}/);
  assert.match(card, /unitsFromTyped\(value, money\.currency, money\.rates\)/);
  // The length is chosen rather than typed since D130: three chips, the register's own, and no field beside them.
  assert.doesNotMatch(card, /value=\{draft\.days\}/);
  assert.match(card, /change\(\{ \.\.\.draft, days: String\(count\) \}\)/, "a chip writes the length on the draft");
  // The funder's own name is the one field the image did not draw: it is asked where they pay, at a size a phone
  // reads without zooming and a thumb can hit, and it never blocks.
  assert.match(readFileSync("app/kit/offer/PaySheet.tsx", "utf8"), /value=\{draft\.funderName\}/);
  // Every field on the card is a control at the size every control keeps, and the chips are the product's own button.
  // The name, the amount's box and its field, and the mark that changes the currency (D144): every one of them a
  // control at the size every control keeps.
  assert.equal((card.match(/min-h-\[var\(--tap-target\)\]/g) ?? []).length, 4, "the name, the amount twice, and the one currency mark");
  // One line, not two (D137): it opens the catalogue while nothing is chosen and that condition's questions after.
  assert.equal((card.match(/\$\{INLINE_BUTTON\} mt-\[var\(--space-sm\)\] w-full/g) ?? []).length, 1, "one control for what they will do");
  assert.match(card, /setChoosing\(condition \? "questions" : "list"\)/, "one value carries both whether it opens and on which face (D150)");
  assert.doesNotMatch(card, /cardDetail|detail\.said/, "the line says the label and the name, and the rest lives in the step it opens (D138)");
  assert.match(card, /className=\{`\$\{CHIP\} /, "a chip is the inline button at the size of a choice");
  assert.match(card, /className=\{`\$\{INLINE_BUTTON\} mt-\[var\(--space-sm\)\] w-full/, "and the condition line is one too, so every control lifts the same way");
  // The two that are left, and both are a choice rather than a field.
  assert.match(card, /<WillSheet openAt=\{choosing\}/, "and the sheet opens on the face the card asks for (D136), in one prop (D150)");
  assert.match(card, /<PaySheet open=\{paying\}/);
});

test("one accent per surface: the card's Pay, and a sheet's own Done", () => {
  assert.equal(card.match(/PRIMARY_BUTTON\b/g)?.length, 2, "the one action, imported once and drawn once");
  // While a sheet is open it is the surface a person is on, and the card's action is behind the veil, so the sheet's
  // Done wears the sun (the rendered mockups). Nothing else inside a sheet does.
  for (const source of sheets) {
    assert.equal(source.match(/className=\{PRIMARY_BUTTON\}/g)?.length, 1, "a sheet has one action in the sun");
  }
  // The same button, shut, says what it waits for rather than its price: the condition's own questions first, then a
  // length the route takes, then an amount that can be read.
  assert.match(card, /!filled\.will \? W\.finishWill : !filled\.howLong \? W\.chooseLength : units === undefined \? W\.stillNeeded : W\.pay\(inTheirCurrency\(units\)\)/);
  assert.doesNotMatch(card, /var\(--accent\)/, "nothing else on the card paints itself with the sun");
});

test("a card is the light object on the ground, as the rendered mockups draw it", () => {
  // Night is drawn: cream paper on the ink ground, 17:1 apart, with a shadow under it and no edge at all.
  assert.match(css, /--paper: #FFF6E2;/);
  assert.ok(contrastRatio("#FFF6E2", COLOURS.dark.background) > 15, "the card and the ground are never the same value");
  assert.match(css, /--card-shadow: none;/, "no shadow at all on the ink ground (D128)");
  assert.match(css, /--card-edge: transparent;/);
  // Day is drawn too since home-light.html: the same cream, on a lavender ground, with its own softer shadow and a
  // warm hairline. The near-white card it replaced stood at 1.09:1 on its ground and needed a hairline of ink.
  assert.ok(contrastRatio("#FFF6E2", COLOURS.light.background) >= 1.3);
  assert.match(css, /--card-edge: #F0E3C2;/);
  assert.doesNotMatch(css, /--card-shadow: 0 /, "and no blurred shadow by day either (D128)");
  // Everything inside a card reads on paper, so nothing inside one had to be rewritten for the ink to change.
  assert.match(ui, /export const CARD =\n?\s*"on-paper/);
  for (const said of ["--text: var(--on-surface)", "--muted: var(--on-surface-muted)", "--control-border: var(--on-surface)"]) {
    assert.ok(css.includes(said), `the paper re-points ${said}`);
  }
});

test("the card's three voices are steps of the scale", () => {
  // One step each from the image of 19 Sep 2026, onto the scale (D126): 25 for the name it carries, 39 for the
  // amount, 13 for a label. The amount stays the star: 39 over 25 is the same one and a half the image drew.
  assert.match(css, /--type-card-who: 25px;/);
  assert.match(css, /--type-card-amount: 39px;/);
  assert.match(css, /--type-card-label: 13px;/);
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
  // Both are drawn once and opened by name: an open dialog taken out of the page keeps its layer over it.
  assert.equal((card.match(/ openAt=\{choosing\}/g) ?? []).length + (card.match(/ open=\{paying\}/g) ?? []).length, 2);
});

test("the page without an account is the character, the title, the sentence and the card, in that order everywhere", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  // The page without an account is the one drawn whenever no session names one (D149).
  const signedOut = home.slice(home.indexOf("if (!address)"), home.indexOf("const moving ="));
  // D129: one column at every width, and the text is never under the card. The two columns of D128 lasted an evening,
  // and what they had put under the card on a phone was a regression on the page of that morning.
  // The diamond of D131, floated into the hollow the title leaves at its top right on a phone, above it from 1024.
  assert.match(signedOut, /<Character\s+state="diamond"\s+tone="sun"/);
  assert.match(signedOut, /className="float-right [^"]*\[@media\(min-width:1024px\)\]:float-none/);
  assert.match(signedOut, /<h1 className=\{HERO\}>\{W\.promise\}<\/h1>/);
  assert.match(signedOut, /<p className=\{`\$\{LEAD\}[^`]*max-w-\[460px\][^`]*`\}>\{W\.promiseUnder\}<\/p>/, "the sentence in the quiet voice");
  const order = ["<Character", "<h1 className={HERO}>", "{W.promiseUnder}", "<OfferCard />"].map((mark) => signedOut.indexOf(mark));
  assert.deepEqual(order, [...order].sort((left, right) => left - right), "the character, the title, the sentence, the card");
  assert.ok(order.every((at) => at > 0));
  // One column: nothing turns the block into a row and nothing reorders it at any width.
  assert.doesNotMatch(signedOut, /flex-row|order-1|order-2/, "no second column and no reordering");
  // From 1024 the whole composition is centred in the window, the card included (D131).
  assert.match(signedOut, /\[@media\(min-width:1024px\)\]:items-center/);
  assert.match(signedOut, /\[@media\(min-width:1024px\)\]:text-center/);
  assert.match(signedOut, /<div className="arrives-in-turn flex w-full flex-col items-start/, "one column, on one left edge, and its pieces arrive in turn (D147)");
  assert.doesNotMatch(signedOut, /<h1 className=\{`\$\{HERO\}[^`]*max-w/, "the title is free to take the column, which is what holds it on one line at 76");
  assert.match(signedOut, /<Shell kind="destination" active="home" action=\{<SignInDoor \/>\} bare wide>/, "the wide column, and no rail's room");
  assert.match(home, /<Shell kind="destination" active="home" width="card">/, "with an account, the column is the card's width");
  assert.doesNotMatch(signedOut, /promiseBody|howItWorks|exampleGift/, "no third paragraph, and no example of a gift beside a real one");
});
