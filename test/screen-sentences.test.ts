import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

/**
 * No sentence of a screen runs past 90 characters in the open (the founder, 1 Oct 2026, with the six rules of
 * kit-rules.html): a longer one is read in a fold or in a sheet, where somebody went to read it.
 *
 * What is measured: every string of `src/sentences.ts`, the file screens take their words from, and every text written
 * directly in a screen under `app/`. One string is one sentence of a screen, as it is printed, whatever it holds. A
 * value put into a sentence counts for six characters, the length of an amount ("$25.00") or of a short first name.
 * The register's own words (`src/conditions.ts`, `src/milestone-conditions.ts`) are read in the sheets where a goal is
 * chosen: they join this measure with that family's pass.
 *
 * A string over the limit passes only when it is named below, in one list: read in a fold or a sheet, with where; not
 * a sentence of a screen at all; said once after a press, as a refusal is; or left in the open by name, which is a
 * proposal to the founder and never a default. A new long sentence fails here, and so does a name left in a list
 * after its sentence was shortened, moved or removed, so the lists cannot drift from the screens.
 */
const LIMIT = 90;
const FILLED = "XXXXXX";

/** Out of scope by the founder's word: Help, Privacy, Legal and the judges page. The lab under /dev is no screen of the product. */
const EXEMPT_GROUPS = new Set(["HELP", "JUDGES"]);
const EXEMPT_FILES = /^app\/(help|privacy|legal|judges|dev)\/|^app\/components\/(JudgesAccount|MilestoneJudges)\.tsx$|^app\/components\/dev\//;

/** Its first sentence stands in the open and the rest is folded under "How it works" (app/kit/Said.tsx). */
const FIRST = (where: string) => `its first sentence in the open, the rest folded: ${where}`;
const PAY_SHEET = "the pay sheet";
const WHAT_HAPPENS = 'the fold "What happens to my money" of the pay sheet';
const HOW_CHECKED = 'the fold "How this is checked" of a gift';
const GOAL_SHEET = 'the fold "How this is checked" at the foot of a goal\'s sheet';

/** Over the limit, and read in a fold or in a sheet: where. */
const FOLDED: Readonly<Record<string, string>> = {
  "GIFT_PAGE.goesBackToThem": 'the fold "What was agreed" of a gift',
  "GIFT_PAGE.comesBackToYou": 'the fold "What was agreed" of a gift',
  "GIFT_PAGE.fromCountsNote": HOW_CHECKED,
  "GIFT_PAGE.takeReview": 'the sheet "Take $2.00?"',
  "GIFT_PAGE.notYetBody": 'the fold "No Duolingo yet?"',
  "GIFT_PAGE.linkAgainWhy": 'the sheet "Get the link again"',
  "GIFT_PAGE.linkFindWhy": 'the sheet "Find the link again"',
  "GIFT_LIVE.climbing.alertRefused": 'the sheet "Notifications"',
  "MORNING.refused": 'the sheet "Notifications"',
  "CONSENT.funderBefore": HOW_CHECKED,
  "END_GIFT.funderMay": 'the fold "What was agreed" of a gift',
  "FUND.made.next": 'the fold "What happens next", under the link of a gift just made',
  "MILESTONE_FUND.made.next": 'the fold "What happens next", under the link of a gift just made',
  "app/kit/CheckThisDay.tsx: Take the reading behind a day that count": `under "Check this day yourself", in ${HOW_CHECKED}`,
  "app/kit/CheckThisDay.tsx: What it proves: the source itself answer": `under "Check this day yourself", in ${HOW_CHECKED}`,
  "app/kit/CheckThisReading.tsx: Take a reading this gift rests on, and c": `under "Check this reading yourself", in ${HOW_CHECKED}`,
  "app/kit/CheckThisReading.tsx: What it proves: the source itself answer": `under "Check this reading yourself", in ${HOW_CHECKED}`,

  // The sheets where a goal is chosen.
  "FUND.detail.courseAfterName": FIRST(GOAL_SHEET),
  "GRADE_SCALE.help": GOAL_SHEET,

  // The steps where the person a gift is for proves.
  "SHOW_PROOF.whatHappens": FIRST("above Show it"),
  "SHOW_PROOF.reviewRefused": FIRST("where a review refused a page"),
  "WCA_PROOF.whoHelp": FIRST("under the WCA ID's field"),
  "MARATHON_PROOF.bibHelp": FIRST("under the bib's field"),
  "MARATHON_PROOF.bibClosed": FIRST("where the bib's field stood"),

  // Spend and withdraw.
  "USE_MONEY.phone.body": FIRST('a card of "Spend or withdraw"'),
  "USE_MONEY.bank.body": FIRST('a card of "Spend or withdraw"'),
  "USE_MONEY.giftcard.body": FIRST('a card of "Spend or withdraw"'),
  "USE_MONEY.bankBy": FIRST('a card of "Spend or withdraw"'),
  "CASH_OUT.exactQuantity": FIRST("under the amount ready to send"),
  "CASH_OUT.closedBody": FIRST("the way out, once the session closed"),
  "PHONE_OUT.numberHelp": FIRST("under the number's field"),
  "PHONE_OUT.onItsWay": FIRST("a top-up on its way"),
  "GIFT_CARD_OUT.onItsWay": FIRST("a gift card on its way"),
  "GIFT_CARD_OUT.chooseHelp": 'the sheet "Choose a card"',
  "ME.codeUse": 'the fold "Need your code for a payout service?" on Me',

  // The pay sheet and the wait.
  // What the card service asks the first time, said in the one fold since the mockup of 3 Oct 2026.
  "PAY.partnerFilledIn": WHAT_HAPPENS,
  "PAY.partnerPaste": WHAT_HAPPENS,
  "PAY.partnerEmbedded": WHAT_HAPPENS,
  "PAY.partnerLocked": WHAT_HAPPENS,
  "PAY.cardNotOffered": `${PAY_SHEET}, whole; ${FIRST("the page of a payment that landed short")}`,
  "PAY.chainMargin": WHAT_HAPPENS,
  "PAY.floor": WHAT_HAPPENS,
  "PAY.missedBy": WHAT_HAPPENS,
  "PAY.chargedIn": WHAT_HAPPENS,
  "PAY.cardLine.before": `${PAY_SHEET}, the one line under its button`,
  "PAY.passkeyMakesTheAccount": PAY_SHEET,
  "PAY.fromJudgeCredit": PAY_SHEET,
  "FUND.check.missed": WHAT_HAPPENS,
  "FUND.check.fourteenDays": WHAT_HAPPENS,
  "MILESTONE_FUND.check.howItWorks": WHAT_HAPPENS,
  "MILESTONE_FUND.check.whyCeiling": WHAT_HAPPENS,
  "MILESTONE_FUND.check.fourteenDays": WHAT_HAPPENS,
  "FUND.waiting.theirWords": 'folded whole under "How it works", on the wait',
  "FUND.arrived.short": FIRST("a payment that landed short"),
  "FUND.closed.kept": FIRST("the wait, once the session closed"),
  "FUND.closed.keptWhileOpen": FIRST("the wait, once the session closed"),
  "FUND.closed.signInAgain": 'under "How it works", on the wait once the session closed',
  "OFFER.nothingToPay.body": FIRST("the pay address with no gift filled in"),
};

const NO_SCREEN = "printed by no screen of the product today";

/** Over the limit, and not a sentence a person reads on a screen. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  "GIFT_LIVE.startTooHigh.askMessage": "the text of a message the person sends from their own phone",
  "HOME.waitsFor.all": "read by a screen reader only, in place of the goals going by",
  "HOME.promiseBody": "printed by the looks laboratory only",
  "MILESTONE_ACTIONS.startTooHighMine": NO_SCREEN,
  "MILESTONE_ACTIONS.startTooHighTheirs": NO_SCREEN,
  "MILESTONE_ACTIONS.nothingToDo": NO_SCREEN,
  "MILESTONE_FUND.detail.settlingRehearsal": NO_SCREEN,
  "FUND.check.nothingToSwap": NO_SCREEN,
  "FUND.check.swapAfter": NO_SCREEN,
  "FUND.check.arrivedUse": NO_SCREEN,
  "FUND.account.why": NO_SCREEN,
  "FUND.arrived.pageMayClose": NO_SCREEN,
  "YOUR_CODE.use": NO_SCREEN,
  "PHONE_OUT.cardLine": NO_SCREEN,
};

const REFUSAL = "a refusal, said once, after the press it refuses";

/**
 * Over the limit, and no standing text: a refusal or an answer, said once, after the press it answers. The rule is
 * about what stands on a page and is read by everybody; these are read by the one person who pressed.
 */
const AFTER_A_PRESS: Readonly<Record<string, string>> = {
  "CASH_OUT.gatherFailed": REFUSAL,
  "CASH_OUT.codeRefusals.viky": REFUSAL,
  "CASH_OUT.own.refusals.viky": REFUSAL,
  "CASH_OUT.failures.keptChanging": REFUSAL,
  "RELAY_CEILING.hour": REFUSAL,
  "RELAY_CEILING.dayAll": REFUSAL,
  "RELAY_CEILING.judgeTries": REFUSAL,
  "RELAY_CEILING.tooSmallToTakeOut": REFUSAL,
  "SHOW_PROOF.nothingLost": REFUSAL,
  "WCA_PROOF.whoShape": REFUSAL,
  "ACCOUNT_DOOR.ifItKeepsFailing.iphone": "what to try, said in the alert of a passkey that failed",
  "SHOW_PROOF.notThereYet": "the answer of a proof shown under the target",
  "MILESTONE_ACTIONS.outcome.started": "the answer of the first reading",
  "MILESTONE_ACTIONS.outcome.startedAbove": "the answer of a first reading already at the target",
};

const DOCUMENT = "a page read like Help (the shell's document kind): the rule does not reach it";

/**
 * Over the limit and left in the open, by name. The founder accepted the fifteen on 2 Oct 2026: the landing's story,
 * the note of non-affiliation, and the two pages read like Help. A sentence joins this list only by his word.
 */
const ACCEPTED: Readonly<Record<string, string>> = {
  "LANDING_STORY.blocks.body": "the landing's own story, four paragraphs under their drawings: folding half a pitch hides it",
  "HOME.waitsFor.read": "the note that says Viky is not affiliated with the schools, races and services named: kept in the open",
  "CATALOGUE.intro": DOCUMENT,
  "CATALOGUE.limits": DOCUMENT,
  "ADD_UNIVERSITY.intro": DOCUMENT,
  "ADD_UNIVERSITY.steps.body": DOCUMENT,
  "ADD_UNIVERSITY.never": DOCUMENT,
  "ADD_UNIVERSITY.next": DOCUMENT,
};

/** Over the limit and still in the open, waiting for the pass of a family. Empty since the second pass of 2 Oct 2026. */
const WAITING: Readonly<Record<string, string>> = {};

type Said = Readonly<{ name: string; text: string }>;

/** A string as a screen prints it, with every value put into it counted for six characters. */
function textOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => FILLED + span.literal.text).join("");
  return null;
}

/** Every string of the sentences file, named by where it is kept: "GIFT_PAGE.takeReview". */
function sentences(): Said[] {
  const file = "src/sentences.ts";
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const said: Said[] = [];
  const walk = (node: ts.Node, name: string) => {
    const text = textOf(node);
    if (text !== null) {
      said.push({ name, text });
      return;
    }
    if (ts.isPropertyAssignment(node)) return walk(node.initializer, name ? `${name}.${node.name.getText()}` : node.name.getText());
    if (ts.isVariableDeclaration(node) && node.initializer) return walk(node.initializer, node.name.getText());
    ts.forEachChild(node, (child) => walk(child, name));
  };
  walk(source, "");
  return said.filter((one) => !EXEMPT_GROUPS.has(one.name.split(".")[0]));
}

/** Every text written directly in a screen, named by its file and its first forty characters. */
function written(): Said[] {
  const said: Said[] = [];
  for (const file of globSync("app/**/*.tsx").sort()) {
    if (EXEMPT_FILES.test(file)) continue;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const walk = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, " ").trim();
        if (text.length > 0) said.push({ name: `${file}: ${text.slice(0, 40)}`, text });
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  return said;
}

test("no sentence of a screen runs past 90 characters outside a fold, a sheet or a page the rule does not reach", (t) => {
  const all = [...sentences(), ...written()];
  const long = all.filter((one) => one.text.length > LIMIT);
  const names = new Set(long.map((one) => one.name));
  const lists = { FOLDED, ELSEWHERE, AFTER_A_PRESS, ACCEPTED, WAITING };
  const named = (name: string) => Object.values(lists).filter((list) => name in list).length;

  const unnamed = [...names].filter((name) => named(name) === 0);
  assert.deepEqual(unnamed, [], `over ${LIMIT} characters and in the open: shorten it, or move the rest into a fold or a sheet and name it there`);

  for (const [list, entries] of Object.entries(lists)) {
    const stale = Object.keys(entries).filter((name) => !names.has(name));
    assert.deepEqual(stale, [], `${list} names sentences that are no longer over ${LIMIT} characters, or no longer exist`);
  }
  assert.deepEqual([...names].filter((name) => named(name) > 1), [], "a sentence is named in one list");
  assert.deepEqual(Object.keys(WAITING), [], "no family is waiting for its pass any more");

  const count = (list: Readonly<Record<string, string>>) => long.filter((one) => one.name in list).length;
  t.diagnostic(
    `${all.length} sentences measured, ${long.length} over ${LIMIT} characters: ${count(FOLDED)} in a fold or a sheet, ${count(ELSEWHERE)} off the screen, ${count(AFTER_A_PRESS)} said once after a press, ${count(ACCEPTED)} left in the open, accepted by the founder`,
  );
});

/**
 * A label in the small capitals is four words at most, never a sentence (rule 5). Held here for the labels this pass
 * drew; the card's other labels are data, and are read with their screens.
 */
test("the labels of the recipient's controls are four words at most", () => {
  const source = readFileSync("src/sentences.ts", "utf8");
  const group = source.slice(source.indexOf("export const YOU_DECIDE = {"), source.indexOf("} as const;", source.indexOf("export const YOU_DECIDE = {")));
  const labels = ["title", "notifications", "on", "off", "stop", "anytime", "onABreak", "yours", "cannotBeUndone"];
  for (const label of labels) {
    const found = new RegExp(`\\n  ${label}: "([^"]+)"`).exec(group);
    assert.ok(found, `${label} is not a label of YOU_DECIDE`);
    assert.ok(found[1].split(" ").length <= 4, `${label} runs to ${found[1].split(" ").length} words: "${found[1]}"`);
  }
  for (const words of ["One thing", "Two things", "Next reading", "Ended 1 Oct 2026", "Back to Maman", "Day 3 of 7"]) assert.ok(words.split(" ").length <= 4, words);
});

test("Me's three round buttons stand under no printed label, and a gift's keep theirs (the founder, 2 Oct 2026)", () => {
  const me = readFileSync("app/kit/Me.tsx", "utf8");
  assert.match(me, /<RoundControls label=\{W\.controls\} untitled>/);
  assert.doesNotMatch(me, /YOU_DECIDE/);
  assert.match(readFileSync("app/kit/RoundControls.tsx", "utf8"), /\{untitled \? null : <p className=\{META\}>\{label\}<\/p>\}/);
  for (const file of ["app/kit/YouDecide.tsx", "app/kit/FunderControls.tsx"]) assert.match(readFileSync(file, "utf8"), /<RoundControls label=\{Y\.title\}>/);
});
