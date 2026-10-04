import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOST_LINES_IN_A_FOLD } from "../app/kit/Lines";
import { feeUnderItsName, WAY_OUT_EURO } from "../src/rails";
import { CASH_OUT, CONSENT, FUND, GIFT_PAGE, MILESTONE_PAGE, PAY } from "../src/sentences";

/**
 * A fold holds lines, a label and its value, four at most, never a paragraph (the founder, 4 Oct 2026). His list named
 * the pay sheet's fold and "No Duolingo yet?"; on his word the rule was carried through the folds that were left:
 * "What was agreed", "How this is checked", "What you can do", "What happens next" and the way out's figures.
 */

const read = (file: string) => readFileSync(file, "utf8");

test("the gift page's two folds are lines, four at most, and print no paragraph", () => {
  assert.equal(MOST_LINES_IN_A_FOLD, 4);
  const page = read("app/components/GiftPage.tsx");
  const agreed = page.slice(page.indexOf("const agreedRows: Row[] = ["), page.indexOf("const checkedRows: Row[] = ["));
  assert.match(agreed, /\.slice\(0, MOST_LINES_IN_A_FOLD\);\n\s*const agreed = <Lines quiet rows=\{agreedRows\} \/>;/);
  assert.doesNotMatch(agreed, /<p /, "no paragraph in what was agreed");
  const checked = page.slice(page.indexOf("const checkedRows: Row[] = ["), page.indexOf("const stopCost"));
  assert.match(checked, /\.slice\(0, MOST_LINES_IN_A_FOLD\);\n\s*const checked = \(\n\s*<>\n\s*<Lines quiet rows=\{checkedRows\} \/>/);
  assert.doesNotMatch(checked, /<p /, "no paragraph in how it is checked: the lines, then the two tools");
  // A habit: what a day pays, how long, where a missed day goes.
  assert.match(agreed, /\[W\.lines\.days, agreedWhen\(daily\)\] as const, \[W\.lines\.missedDay, backToFunder\] as const\]/);
  assert.deepEqual([GIFT_PAGE.lines.days, GIFT_PAGE.lines.missedDay, GIFT_PAGE.lines.backToYou], ["Days", "A missed day", "back to you"]);
  // The funder still reads that the person it is for can end it (the audit of 1 Oct 2026).
  assert.deepEqual([GIFT_PAGE.lines.canEnd("Boo"), GIFT_PAGE.lines.theRest], ["Boo can end it", "the rest comes back to you"]);
  assert.equal(GIFT_PAGE.lines.canEnd(null), "The person it is for can end it");
  assert.deepEqual([GIFT_PAGE.lines.yoursAlready, GIFT_PAGE.lines.fromHome], ["Yours already", "use it from Home"]);
  assert.equal(GIFT_PAGE.lines.madeOn("2 Oct 2026", "4"), "2 Oct 2026, gift 4");
  // A milestone: what, when, and where it goes if not.
  assert.deepEqual([MILESTONE_PAGE.lines.toReach, MILESTONE_PAGE.lines.when, MILESTONE_PAGE.lines.ifNot, MILESTONE_PAGE.lines.startedAt], ["To reach", "When", "If not", "Started at"]);
});

test("who agreed to what is read is a line, to the person and to the funder", () => {
  assert.equal(CONSENT.lines.reads("your lessons"), "Viky reads your lessons");
  assert.equal(CONSENT.lines.youAgreed("2 Oct 2026"), "you agreed on 2 Oct 2026");
  assert.equal(CONSENT.lines.theyAgreed("Boo", "2 Oct 2026"), "Boo agreed on 2 Oct 2026");
  assert.equal(CONSENT.lines.theyStopped("Boo", "3 Oct 2026"), "Boo stopped it on 3 Oct 2026");
  assert.equal(CONSENT.lines.notYet("Boo"), "Boo has not said yes yet");
  assert.deepEqual([CONSENT.lines.theyCanStop, CONSENT.lines.notReadComesBack], ["They can stop", "what is not read comes back to you"]);
  assert.deepEqual([CONSENT.lines.nothingRead, CONSENT.lines.untilTheyAgree("Boo")], ["Nothing is read", "until Boo agrees"]);
  const consent = read("app/kit/Consent.tsx");
  assert.match(consent, /export function recipientConsentRows\(/);
  assert.match(consent, /export function funderConsentRows\(/);
  assert.match(consent, /if \(state\?\.kind === "stop"\) return \[\[reads, C\.lines\.theyStopped\(/, "a stop is said with its day, and nothing promises a reading after it");
});

test("what happens next, under the link of a gift just made, is the pay sheet's own lines and the way back to a lost link", () => {
  const link = read("app/components/PayGift.tsx");
  assert.match(link, /<Lines quiet rows=\{\[!madeMilestone \? P\.fold\.missedDay : certificateById\(made\.conditionId\) \? P\.fold\.notShown : P\.fold\.notReached, P\.fold\.notOpened, W\.made\.lostLink\]\} \/>/);
  assert.deepEqual(FUND.made.lostLink, ["A lost link", "this gift's page makes a new one"]);
  assert.deepEqual(PAY.fold.missedDay, ["A missed day", "back to you"]);
});

test("where the way out's figures come from is a line a service, with the day its figure was read", () => {
  assert.equal(feeUnderItsName(WAY_OUT_EURO), "0.99 %, at least €1.99");
  assert.equal(CASH_OUT.keptAndRead(feeUnderItsName(WAY_OUT_EURO), WAY_OUT_EURO.read), "0.99 %, at least €1.99, read 16 Sep 2026");
  assert.equal(CASH_OUT.rateOf("European Central Bank", "2 Oct 2026"), "European Central Bank, 2 Oct 2026");
  assert.match(read("app/components/CashOut.tsx"), /<Lines quiet rows=\{\[\.\.\.WAYS_OUT\.map\(\(way\) => \[way\.name, W\.keptAndRead\(feeUnderItsName\(way\), way\.read\.split\(" \("\)\[0\]\)\] as const\)/);
});

test("the exact dollars under a converted figure are on no screen any more", () => {
  for (const file of ["app/kit/ReachedMoment.tsx", "app/components/PayGift.tsx", "app/components/CashOut.tsx", "app/kit/LedAmount.tsx"]) assert.doesNotMatch(read(file), /ExactLine/, file);
  assert.doesNotMatch(read("src/sentences.ts"), /Exactly \$\{/);
});
