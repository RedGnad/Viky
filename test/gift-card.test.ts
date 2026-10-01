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
test("the card opens filled, the name included: Boo, which the funder replaces (D300)", () => {
  assert.equal(STARTING_DRAFT.recipientName, "Boo", "the founder's default name, 28 Sep 2026");
  assert.equal(STARTING_DRAFT.funderName, "");
  assert.equal(STARTING_DRAFT.dollars, "30");
  assert.equal(STARTING_DRAFT.days, String(DAILY_DURATION.suggested));
  assert.ok(STARTING_DRAFT.conditionId.length > 0 && conditionById(STARTING_DRAFT.conditionId)?.live, "a condition a gift can really be made on");
  assert.deepEqual(filledCases(STARTING_DRAFT), { for: true, will: true, amount: true, howLong: true });
  assert.equal(isComplete(STARTING_DRAFT), true, "the action says what it will take from the first screen");
  // And the screens read that card rather than an empty one, on the server as in the browser.
  assert.match(readFileSync("src/card-draft.ts", "utf8"), /return STARTING_DRAFT;/);
  assert.match(card, /start\.card \?\? startingCardDraft\(\)/, "or the card the server drew from this device's cookie (D160)");
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
  assert.match(card, /<Character state="toCome" className="h-auto w-\[96px\]" standing=\{false\} \/>/, "one character, larger since D226");
  // The condition line is a control, so it gets more room under the name than a caption would (D133).
  assert.match(card, /className=\{`\$\{INLINE_BUTTON\} mt-\[var\(--space-sm\)\] justify-between/);
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
  assert.match(card, /<MoneyKey currency=\{money\.currency\} onOpen=\{\(\) => setReading\(true\)\}/, "the key says there is a list behind it (D152)");
  assert.match(card, /figureWithMark\(figureIn\(/, "what a label says is grouped as that currency groups it (D152)");
  assert.match(card, /quick\.map\(\(count\) =>/);
  // The three the register gives this condition, and no fourth (D130): the chip that opened a field is gone, and so
  // is the field, so the only lengths a card offers are the three the register was asked about.
  assert.match(card, /const quick = \[bounds\.min, bounds\.suggested, bounds\.max\];/);
  assert.doesNotMatch(card, /otherLength|typingDays|aria-label=\{W\.daysLabel\}/);
  assert.doesNotMatch(readFileSync("src/sentences.ts", "utf8"), /otherLength:/, "and the sentence it carried is gone with it");
  // The action waits for the length and the amount, which are on the card; what it waits for inside the sheet, it opens
  // the sheet on rather than going grey (the founder, 28 Sep 2026).
  assert.match(card, /disabled=\{filled\.will && !ready\}/);
  assert.match(card, /onClick=\{\(\) => \(filled\.will \? setPaying\(true\) : setChoosing\(condition \? "questions" : "list"\)\)\}/);
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
  // The name, the amount's box and its field at 48; the key beside the field keeps 48 too, inside the box's inset of 3
  // on every side (D257), so the box stands 54.
  assert.equal((card.match(/min-h-\[var\(--tap-target\)\]/g) ?? []).length, 3, "the name and the amount twice");
  const key = readFileSync("app/kit/MoneyKey.tsx", "utf8");
  assert.match(key, /min-h-\[var\(--tap-target\)\] \$\{nested \?/, "the key is a thumb's size whatever its sign, nested or alone");
  assert.match(key, /min-w-\[var\(--tap-target\)\]/, "and never narrower than a thumb");
  // One line, not two (D137). It opens the four families (D233), except while the condition on the card is not answered:
  // then its own questions, where the person left them (the founder, 28 Sep 2026).
  assert.equal((card.match(/\$\{INLINE_BUTTON\} mt-\[var\(--space-sm\)\] justify-between/g) ?? []).length, 1, "one control for what they will do");
  // At its own width, centred in the card on a phone and at its left on a large screen (the founder, 29 Sep 2026).
  assert.match(card, /<span className="flex justify-center \[@media\(min-width:1024px\)\]:justify-start">\s*<button/);
  assert.match(card, /onClick=\{\(\) => setChoosing\(condition && !filled\.will \? "questions" : "list"\)\}/, "the catalogue, or the questions left half answered; one value carries whether it opens and on which face (D150)");
  assert.doesNotMatch(card, /cardDetail|detail\.said/, "the line says the label and the name, and the rest lives in the step it opens (D138)");
  assert.match(card, /className=\{`\$\{CHIP\} /, "a chip is the inline button at the size of a choice");
  assert.match(card, /className=\{`\$\{INLINE_BUTTON\} mt-\[var\(--space-sm\)\] justify-between/, "and the condition line is one too, so every control lifts the same way");
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
  // The action repeats the figure as it was asked for (D157): a whole currency does not sit on the cent.
  assert.match(card, /!filled\.will \? W\.finishWill : !filled\.howLong \? W\.chooseLength : units === undefined \? W\.stillNeeded : W\.pay\(asked\(units\)\)/);
  assert.doesNotMatch(card, /var\(--accent\)/, "nothing else on the card paints itself with the sun");
});

test("a card is the object on the ground, as the rendered mockups draw it by day and D223 draws it by night", () => {
  // Night: a paper of its own since D223, one step above the ink ground, no shadow and no edge at all. The cream it
  // replaced stood at 17:1 on that ground, the brightest thing on a screen somebody had set to dark.
  assert.match(css, /--paper: #FFF6E2;/);
  assert.equal((css.match(/--paper: #332E3F;/g) ?? []).length, 2, "the night paper, in both night blocks");
  assert.ok(contrastRatio("#332E3F", COLOURS.dark.background) >= 1.25, "the card and the ground are never the same value");
  // A warm paper on a cool night (D231): the sun over the ground at 12 %, as Material brands a dark surface, so it
  // has more red than blue where the ground has more blue than red.
  // The ground's own family since D305 (the founder's direction A): lavender, blue above red, like the ground.
  assert.ok(parseInt("#332E3F".slice(5, 7), 16) > parseInt("#332E3F".slice(1, 3), 16), "the lavender of the ground");
  assert.ok(parseInt(COLOURS.dark.background.slice(1, 3), 16) < parseInt(COLOURS.dark.background.slice(5, 7), 16), "on a cool ground");
  for (const [ink, on, least, what] of [
    ["#FFF6E2", "#332E3F", 4.5, "the ink on the night paper"],
    ["#C7C4DA", "#332E3F", 4.5, "the quiet voice on it"],
    ["#B9B2CD", "#332E3F", 4.5, "and the faint one"],
    ["#FFF6E2", "#484154", 4.5, "the ink in a field"],
    ["#B9B2CD", "#484154", 4.5, "the placeholder in a field"],
    ["#FFF6E2", "#4E485E", 4.5, "the ink on a chosen row"],
    ["#C7C4DA", "#4E485E", 4.5, "the quiet voice on a chosen row and on the shut action"],
    ["#FFC531", "#332E3F", 3, "the sun on it"],
    ["#B79BFF", "#332E3F", 3, "the diamond's night edge on it"],
  ] as const) assert.ok(contrastRatio(ink, on) >= least, what);
  for (const said of ["--paper-field: #484154;", "--chosen: #4E485E;", "--on-surface: #FFF6E2;", "--on-surface-muted: #C7C4DA;", "--paper-relief: #C7C4DA;"]) {
    assert.equal((css.match(new RegExp(said.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 2, `${said} in both night blocks`);
  }
  assert.match(css, /--control-relief-colour: var\(--paper-relief\);/, "a key on the paper stands on the paper's own relief");
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
  // `ensureAccount`, which makes the account on a device that remembers none (the audit of 1 Oct 2026).
  assert.match(paySheet, /await ensureAccount\(\)/);
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
  // Escape closes it, and only its own: a nested sheet's close never closes the sheet it was opened from (D313).
  assert.match(sheetFile, /onCancel=\{\(event\) => \{\n\s+if \(event\.target === dialog\.current\) onClose\(\);/);
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
  // The character stands in the hero moment between the sentence and the card since D214 (it was the diamond of D131,
  // floated into the hollow the title leaves at its top right on a phone).
  assert.match(signedOut, /<HeroMoment played=\{heroPlayed\} \/>/);
  assert.match(signedOut, /<h1 className=\{HERO\}>\{W\.promise\}<\/h1>/);
  assert.match(signedOut, /<p className=\{`\$\{LEAD\}[^`]*max-w-\[460px\][^`]*`\}>\{W\.promiseUnder\}<\/p>/, "the sentence in the quiet voice");
  const order = ["<h1 className={HERO}>", "{W.promiseUnder}", "<HeroMoment", "<OfferCard paying="].map((mark) => signedOut.indexOf(mark));
  assert.deepEqual(order, [...order].sort((left, right) => left - right), "the title, the sentence, the character, the card");
  assert.ok(order.every((at) => at > 0));
  // One column: nothing turns the block into a row and nothing reorders it at any width.
  assert.doesNotMatch(signedOut, /flex-row|order-1|order-2/, "no second column and no reordering");
  // The whole composition is centred in the window at every width, the card included (D131 from 1024, D221 below).
  assert.match(signedOut, /className="arrives-in-turn flex w-full flex-col items-center"/);
  assert.match(signedOut, /className="w-full text-center"/, "the words centred; their share of the room is a spacer since D250");
  assert.doesNotMatch(signedOut, /items-start|\[@media\(min-width:1024px\)\]:text-center/, "nothing left-aligned on a phone");
  assert.match(signedOut, /<div className="arrives-in-turn flex w-full flex-col items-center/, "one column, on one axis, and its pieces arrive in turn (D147)");
  assert.doesNotMatch(signedOut, /<h1 className=\{`\$\{HERO\}[^`]*max-w/, "the title is free to take the column, which is what holds it on one line at 76");
  assert.match(signedOut, /<Shell kind="destination" active="home" action=\{<SignInDoor \/>\} bare wide>/, "the wide column, and no rail's room");
  assert.match(home, /<Shell kind="destination" active="home" width="card" title=\{NAV\.home\} character=\{<HeadCharacter scene="home" \/>\}>/, "with an account, the column is the card's width, the destination carries its title like the two others (D230), and the character is at its head in its scene (D154, D237)");
  assert.doesNotMatch(signedOut, /promiseBody|howItWorks|exampleGift/, "no third paragraph, and no example of a gift beside a real one");
});
