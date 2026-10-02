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
 * A string over the limit passes only when it is named below, in one of three lists: read in a fold or a sheet, with
 * where; not a sentence of a screen at all; or waiting for the pass of its family, which is the list this series
 * empties. A new long sentence fails here, and so does a name left in a list after its sentence was shortened, moved
 * or removed, so the lists cannot drift from the screens.
 */
const LIMIT = 90;
const FILLED = "XXXXXX";

/** Out of scope by the founder's word: Help, Privacy, Legal and the judges page. The lab under /dev is no screen of the product. */
const EXEMPT_GROUPS = new Set(["HELP", "JUDGES"]);
const EXEMPT_FILES = /^app\/(help|privacy|legal|judges|dev)\/|^app\/components\/(JudgesAccount|MilestoneJudges)\.tsx$|^app\/components\/dev\//;

/** Over the limit, and read in a fold or in a sheet: where. */
const FOLDED: Readonly<Record<string, string>> = {
  "GIFT_PAGE.goesBackToThem": 'the fold "What was agreed" of a gift',
  "GIFT_PAGE.comesBackToYou": 'the fold "What was agreed" of a gift',
  "GIFT_PAGE.fromCountsNote": 'the fold "How this is checked" of a gift',
  "GIFT_PAGE.takeReview": 'the sheet "Take $2.00?"',
  "GIFT_PAGE.notYetBody": 'under "I do not have Duolingo yet", once it is pressed',
  "CONSENT.funderBefore": 'the fold "How this is checked" of a gift',
  "END_GIFT.funderMay": 'the fold "What was agreed" of a gift',
  "GIFT_PAGE.linkAgainWhy": 'the sheet "Get the link again"',
  "GIFT_PAGE.linkFindWhy": 'the sheet "Find the link again"',
  "GIFT_LIVE.climbing.alertRefused": 'the sheet "Messages"',
  "MORNING.refused": 'the sheet "Messages"',
  "FUND.made.next": 'the fold "What happens next", under the link of a gift just made',
  "MILESTONE_FUND.made.next": 'the fold "What happens next", under the link of a gift just made',
  "app/kit/CheckThisDay.tsx: Take the reading behind a day that count": 'under "Check this day yourself", in the fold "How this is checked"',
  "app/kit/CheckThisDay.tsx: What it proves: the source itself answer": 'under "Check this day yourself", in the fold "How this is checked"',
  "app/kit/CheckThisReading.tsx: Take a reading this gift rests on, and c": 'under "Check this reading yourself", in the fold "How this is checked"',
  "app/kit/CheckThisReading.tsx: What it proves: the source itself answer": 'under "Check this reading yourself", in the fold "How this is checked"',
};

/** Over the limit, and not a sentence of a screen. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  "GIFT_LIVE.startTooHigh.askMessage": "the text of a message the person sends from their own phone",
  "MILESTONE_ACTIONS.startTooHighMine": "printed by no screen: the gift's page says this state in its own lines (GIFT_LIVE.startTooHigh)",
  "MILESTONE_ACTIONS.startTooHighTheirs": "printed by no screen: the gift's page says this state in its own lines (GIFT_LIVE.startTooHigh)",
};

const GOAL = "3: the sheets where a goal is chosen";
const MONEY = "4: spend and withdraw";
const HOME = "5: Home, Me and the account's door";
const PAY = "6: the pay sheet and the waiting screen";
/** Screens the six families do not name: the steps where the person a gift is for connects or proves, two pages, and refusals. */
const UNNAMED = "outside the six families: named to the founder on 1 Oct 2026";

/** Over the limit and still in the open: the family whose pass takes each one out of this list. */
const WAITING: Readonly<Record<string, string>> = {

  "FUND.detail.courseAfterName": GOAL,
  "MILESTONE_FUND.detail.settlingRehearsal": GOAL,
  "GRADE_SCALE.help": GOAL,

  "USE_MONEY.phone.body": MONEY,
  "USE_MONEY.bank.body": MONEY,
  "USE_MONEY.giftcard.body": MONEY,
  "USE_MONEY.bankBy": MONEY,
  "CASH_OUT.gatherFailed": MONEY,
  "CASH_OUT.reviewGetting": MONEY,
  "CASH_OUT.reviewPayout": MONEY,
  "CASH_OUT.comeBack": MONEY,
  "CASH_OUT.exactQuantity": MONEY,
  "CASH_OUT.codeRefusals.viky": MONEY,
  "CASH_OUT.closedBody": MONEY,
  "CASH_OUT.own.refusals.viky": MONEY,
  "CASH_OUT.failures.keptChanging": MONEY,
  "YOUR_CODE.use": MONEY,
  "PHONE_OUT.cardLine": MONEY,
  "PHONE_OUT.numberHelp": MONEY,
  "PHONE_OUT.onItsWay": MONEY,
  "GIFT_CARD_OUT.chooseHelp": MONEY,
  "GIFT_CARD_OUT.onItsWay": MONEY,
  "RELAY_CEILING.tooSmallToTakeOut": MONEY,

  "LANDING_STORY.blocks.body": HOME,
  "HOME.promiseBody": HOME,
  "HOME.waitsFor.all": HOME,
  "HOME.waitsFor.read": HOME,
  "ACCOUNT_DOOR.computer": HOME,
  "ACCOUNT_DOOR.ifItKeepsFailing.iphone": HOME,
  "GIFT_CARD.milestoneStartTooHigh": HOME,
  "ME.codeUse": HOME,

  "OFFER.nothingToPay.body": PAY,
  "PAY.chainMargin": PAY,
  "PAY.floor": PAY,
  "PAY.passkeyMakesTheAccount": PAY,
  "PAY.partnerFilledIn": PAY,
  "PAY.partnerPaste": PAY,
  "PAY.partnerEmbedded": PAY,
  "PAY.partnerLocked": PAY,
  "PAY.cardNotOffered": PAY,
  "PAY.fromJudgeCredit": PAY,
  "PAY.takesSeconds": PAY,
  "FUND.check.missed": PAY,
  "FUND.check.fourteenDays": PAY,
  "FUND.check.nothingToSwap": PAY,
  "FUND.check.swapAfter": PAY,
  "FUND.check.arrivedUse": PAY,
  "FUND.account.why": PAY,
  "FUND.waiting.theirWords": PAY,
  "FUND.waiting.thenChanged": PAY,
  "FUND.arrived.pageMayClose": PAY,
  "FUND.arrived.short": PAY,
  "FUND.closed.kept": PAY,
  "FUND.closed.keptWhileOpen": PAY,
  "FUND.closed.signInAgain": PAY,
  "MILESTONE_FUND.check.howItWorks": PAY,
  "MILESTONE_FUND.check.whyCeiling": PAY,
  "MILESTONE_FUND.check.fourteenDays": PAY,

  "MILESTONE_ACTIONS.nothingToDo": UNNAMED,
  "MILESTONE_ACTIONS.firstReading": UNNAMED,
  "MILESTONE_ACTIONS.outcome.started": UNNAMED,
  "MILESTONE_ACTIONS.outcome.startedAbove": UNNAMED,
  "SHOW_PROOF.whatHappens": UNNAMED,
  "SHOW_PROOF.notThereYet": UNNAMED,
  "SHOW_PROOF.nothingLost": UNNAMED,
  "SHOW_PROOF.reviewRefused": UNNAMED,
  "WCA_PROOF.whoHelp": UNNAMED,
  "WCA_PROOF.whoShape": UNNAMED,
  "MARATHON_PROOF.bibHelp": UNNAMED,
  "MARATHON_PROOF.bibClosed": UNNAMED,
  "CATALOGUE.intro": UNNAMED,
  "CATALOGUE.limits": UNNAMED,
  "ADD_UNIVERSITY.intro": UNNAMED,
  "ADD_UNIVERSITY.steps.body": UNNAMED,
  "ADD_UNIVERSITY.never": UNNAMED,
  "ADD_UNIVERSITY.next": UNNAMED,
  "RELAY_CEILING.hour": UNNAMED,
  "RELAY_CEILING.dayAll": UNNAMED,
  "RELAY_CEILING.judgeTries": UNNAMED,
  "app/~offline/page.tsx: Viky needs a connection to show a gift. ": UNNAMED,
};

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
  const lists = { FOLDED, ELSEWHERE, WAITING };

  const unnamed = [...names].filter((name) => !(name in FOLDED) && !(name in ELSEWHERE) && !(name in WAITING));
  assert.deepEqual(unnamed, [], `over ${LIMIT} characters and in the open: shorten it, or move the rest into a fold or a sheet and name it there`);

  for (const [list, entries] of Object.entries(lists)) {
    const stale = Object.keys(entries).filter((name) => !names.has(name));
    assert.deepEqual(stale, [], `${list} names sentences that are no longer over ${LIMIT} characters, or no longer exist`);
  }
  const twice = Object.keys(FOLDED).filter((name) => name in WAITING || name in ELSEWHERE).concat(Object.keys(ELSEWHERE).filter((name) => name in WAITING));
  assert.deepEqual(twice, [], "a sentence is named in one list");

  const open = long.filter((one) => one.name in WAITING).length;
  t.diagnostic(`${all.length} sentences measured, ${long.length} over ${LIMIT} characters: ${long.length - open} in a fold, a sheet or off the screen, ${open} still in the open`);
  const families = new Map<string, number>();
  for (const one of long) if (one.name in WAITING) families.set(WAITING[one.name], (families.get(WAITING[one.name]) ?? 0) + 1);
  for (const [family, count] of [...families].sort()) t.diagnostic(`${count} waiting for ${family}`);
});

/**
 * A label in the small capitals is four words at most, never a sentence (rule 5). Held here for the labels this pass
 * drew; the card's other labels are data, and are read with their screens.
 */
test("the labels of the recipient's controls are four words at most", () => {
  const source = readFileSync("src/sentences.ts", "utf8");
  const group = source.slice(source.indexOf("export const YOU_DECIDE = {"), source.indexOf("} as const;", source.indexOf("export const YOU_DECIDE = {")));
  const labels = ["title", "messages", "on", "off", "stop", "anytime", "onABreak", "yours", "cannotBeUndone"];
  for (const label of labels) {
    const found = new RegExp(`\\n  ${label}: "([^"]+)"`).exec(group);
    assert.ok(found, `${label} is not a label of YOU_DECIDE`);
    assert.ok(found[1].split(" ").length <= 4, `${label} runs to ${found[1].split(" ").length} words: "${found[1]}"`);
  }
  for (const words of ["One thing", "Two things", "Next reading", "Ended 1 Oct 2026", "Back to Maman", "Day 3 of 7"]) assert.ok(words.split(" ").length <= 4, words);
});
