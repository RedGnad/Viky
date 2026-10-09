import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOST_LINES_IN_A_FOLD } from "../app/kit/Lines";
import { CHESS_MODES } from "../src/chess-com";
import { BUILDING, conditionById, CONDITIONS, PRONOTE_GRADE_SHOWN, readWhen } from "../src/conditions";
import { helpLine } from "../src/help-line";
import { certificateById } from "../src/milestone-conditions";
import { feeUnderItsName, WAY_OUT_CARD, WAY_OUT_EURO } from "../src/rails";
import { WCA_EVENTS, wcaEventIsTimed } from "../src/wca";
import { CASH_OUT, CONSENT, FUND, GIFT_PAGE, GRADE_SCALE, MILESTONE_PAGE, OFFER, PAY, USE_MONEY } from "../src/sentences";

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
  assert.match(agreed, /\[W\.lines\.days, agreedWhen\(daily\)\] as const, \[W\.lines\.missedDay, backToFunder\] as const, madeBeforeOpening\]/);
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

test("what happens next is said by the gift's own page since 8 Oct 2026, and the pay sheet keeps its lines", () => {
  // The screen of a gift just made, and its fold "What happens next", are gone: the gift's page is that screen, and
  // what it folded is in "What was agreed" and in the line under the state (test/ui-pass-the-gift-after-paying.test.ts).
  const pay = read("app/components/PayGift.tsx");
  assert.doesNotMatch(pay, /data-made-next|W\.made\./);
  assert.equal("made" in FUND, false);
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

test("how a condition is checked, on the sheet where it is chosen: where it is read from, when, what counts, what the person has to do", () => {
  // The founder, 4 Oct 2026. No line says what a reading does not prove on this sheet: that is the judges page's.
  assert.deepEqual(OFFER.checked, { from: "Read from", when: "Read", counts: "What counts", they: "They must" });
  const all = [...CONDITIONS, ...BUILDING, PRONOTE_GRADE_SHOWN];
  for (const condition of all) {
    const { from, when, counts, they } = condition.checked;
    for (const [name, value] of Object.entries({ from, when, counts, they })) {
      assert.ok(value.length >= 6, `${condition.id}: ${name} says something`);
      assert.ok(value.length <= 40, `${condition.id}: ${name} is a line, not a sentence (${value.length}: "${value}")`);
      assert.doesNotMatch(value, /\.$/, `${condition.id}: ${name} is a value, with no full stop`);
    }
    // The subject stays exact: the account did it. Never "they did it", and nothing says it cannot be cheated.
    assert.doesNotMatch(`${counts} ${condition.help}`, /\bthey did\b|cannot cheat|can't cheat|cannot be cheated/i, condition.id);
    // And the help says no more what a reading does not prove.
    assert.doesNotMatch(condition.help, /, not who|not the wearer|not each piece of work|not a place at|is not read/, `${condition.id}: the help`);
  }
  assert.equal(conditionById("duolingo-daily")?.help, "Read each morning from their public Duolingo profile, with nothing to install: it proves the account did the lesson.");
  // Two statements about the thing itself stay, said without a negation (the founder, 5 Oct 2026): they say what
  // the giver buys. An MITx Online certificate is an online course, and a TOEFL score held before the gift counts.
  assert.match(String(conditionById("mitx-online-certificate")?.help), /It proves an online course passed on MITx Online\.$/);
  assert.match(String(conditionById("toefl-mybest-shown")?.help), /it proves the account that signed in holds it\. A score they already hold counts\.$/);
  for (const id of ["mitx-online-certificate", "toefl-mybest-shown"]) assert.doesNotMatch(String(conditionById(id)?.help), /\bnot\b/, id);
  assert.equal(conditionById("duolingo-daily")?.checked.counts, "a lesson the account did that day");
  // "Read" is the value the gift's page prints for the same condition: one function says it to both.
  const duolingo = conditionById("duolingo-daily")!;
  assert.equal(readWhen(duolingo, false), duolingo.recipient?.reads);
  assert.equal(readWhen(duolingo, false), "every day, for the day before");
  assert.equal(readWhen(duolingo, false), duolingo.checked.when);
  assert.equal(readWhen(duolingo, true), duolingo.recipient?.asItGoes?.reads);
  assert.equal(readWhen(duolingo, true), "when this page opens, and through the day");
  assert.equal(readWhen(conditionById("chess-rating")!, true), "every day");
  assert.equal(readWhen(conditionById("marathon-finish")!, false), "after the finish");
  const page = read("app/components/GiftPage.tsx");
  assert.match(page, /asItGoes && !readingsStopped \? \(\[W\.lines\.read, asItGoes\.reads\] as const\) : nextReading && !gift\.finished && words\?\.reads \? \(\[W\.lines\.read, words\.reads\] as const\) : null,/, "the gift's page reads the same words");
  assert.equal(OFFER.checked.when, GIFT_PAGE.lines.read, "under the same label");
  // The sheet draws the four from the condition.
  const sheet = read("app/kit/offer/WillSheet.tsx");
  const fold = sheet.slice(sheet.indexOf('<details className="gift-fold" data-how-checked="">'), sheet.indexOf("</details>", sheet.indexOf('data-how-checked=""')));
  assert.match(fold, /\[W\.checked\.from, condition\.checked\.from\],\n\s*\[W\.checked\.when, readWhen\(condition, newDailyGiftsPayTheSameDay\(\)\)\],\n\s*\[W\.checked\.counts, condition\.checked\.counts\],\n\s*\[W\.checked\.they, condition\.checked\.they\],/);
  assert.doesNotMatch(fold, /<p |Does not prove|\.not\b/, "no paragraph, and no line about what it does not prove");
  assert.doesNotMatch(sheet, /folded\.push|const down = /, "no sentence is sent down into the fold any more");
  // The judges page and the fold "Check this day" are not touched: what a reading does not prove is said there.
  assert.match(read("src/condition-proof.ts"), /never who did it/);
});

test("a field of that sheet keeps its instruction in the one line under it", () => {
  // The rest of a long help went into the fold, which holds no sentence now: what a field needs is said in one line.
  for (const condition of CONDITIONS.filter((one) => one.live)) {
    const certificate = certificateById(condition.id);
    if (!certificate) continue;
    for (const [name, help] of Object.entries({ nameHelp: certificate.words.nameHelp, target: certificate.target.help, course: certificate.course?.help })) {
      if (!help) continue;
      assert.ok(helpLine(help).line, `${condition.id}: ${name} has a line under its field ("${help}")`);
    }
  }
  // What a wrong name or a wrong scale costs is in that line: it was folded, where nobody read it.
  assert.equal(certificateById("coursera-certificate")?.words.nameHelp, "The name on their Coursera account, or it cannot pay.");
  assert.equal(GRADE_SCALE.help, "Their university must grade this way, or it cannot pay.");
  assert.match(read("app/kit/offer/WillSheet.tsx"), /\{draft\.scaleFixed \? null : <p className=\{HELP\}>\{GRADE_SCALE\.help\}<\/p>\}/);
});

test("how each way out works is four lines: what the person gets, in how long, what it costs, what it takes", () => {
  assert.deepEqual([USE_MONEY.phone.get, USE_MONEY.phone.time, USE_MONEY.phone.cost, USE_MONEY.phone.need], ["credit or data on your number", "usually a minute", "the price shown before you pay", "your number, no ID"]);
  assert.deepEqual([USE_MONEY.giftcard.get, USE_MONEY.giftcard.time, USE_MONEY.giftcard.cost, USE_MONEY.giftcard.need], ["a code for the shop you choose", "usually within a minute", "the price shown before you pay", "nothing: no sign-up, no ID"]);
  assert.deepEqual([USE_MONEY.mobileGet("Wave or Orange Money"), USE_MONEY.mobileTime("15 minutes"), USE_MONEY.mobile.cost, USE_MONEY.mobile.need], ["money on your Wave or Orange Money number", "within 15 minutes", "the rate shown before you send", "the number and its holder's name"]);
  // The cost of the bank and of the card is the service's published figure, the one the fold of sources dates.
  assert.equal(feeUnderItsName(WAY_OUT_EURO), "0.99 %, at least €1.99");
  assert.equal(feeUnderItsName(WAY_OUT_CARD), "up to 3.95 %, at least €4.00");
  // The times said are the ones the screens of each way already say once it is under way.
  assert.match(read("src/sentences.ts"), /onItsWay: "The phone company usually takes a minute\./);
  assert.match(read("src/sentences.ts"), /onItsWay: "The code usually comes within a minute\./);
});

test("a name not everybody knows says what it is in the grey line under it", () => {
  // The founder, 5 Oct 2026, each checked against what its reading accepts.
  const under = (id: string) => conditionById(id)?.under;
  assert.equal(under("toefl-mybest-shown"), "English test");
  assert.equal(under("codeforces-rating"), "Competitive programming");
  assert.equal(under("credly-badge"), "Professional badges");
  assert.equal(under("accredible-credential"), "Digital certificates");
  assert.equal(under("marathon-finish"), "A marathon, a half or a 10 km");
  // The WCA's line: two of its seventeen events are not timed (Fewest Moves counts moves, Multi-Blind a score), so
  // its name says a result where "a time" was proposed.
  const wca = conditionById("wca-time");
  assert.equal(wca?.name, "A cube result in competition");
  assert.equal(wca?.under, "Rubik's Cube and others, WCA");
  assert.equal(Object.keys(WCA_EVENTS).length, 17);
  assert.deepEqual(Object.keys(WCA_EVENTS).filter((id) => !wcaEventIsTimed(id)), ["333fm", "333mbf"]);
  // Every line has one, so every row of a list is the same height (the founder, 5 Oct 2026): a few words, no full
  // stop, never a reservation, and never the line's own name again.
  for (const condition of [...CONDITIONS, ...BUILDING, PRONOTE_GRADE_SHOWN]) {
    // Two to five words, and short enough to hold on one line of a 360 pixel phone (31 characters do, measured).
    // The race's line is the one he kept longer: "A marathon, a half or a 10 km".
    const words = condition.under.split(" ").length;
    assert.ok(words >= 2 && (words <= 5 || condition.id === "marathon-finish") && condition.under.length <= 32 && !/\.$/.test(condition.under), `${condition.id}: two to five words, no full stop ("${condition.under}")`);
    assert.doesNotMatch(condition.under, /\bnot\b|\bonly\b|\bunless\b|\bexcept\b/i, `${condition.id}: no reservation`);
    assert.notEqual(condition.under.toLowerCase(), condition.name.toLowerCase(), condition.id);
  }
  // The ten the founder added, each checked against what its reading counts.
  assert.equal(under("duolingo-english-test"), "Taken online, on camera");
  // The schools moved from edX's name to its grey line, and Strava's name lost a word: at 360 pixels each of the
  // two names took two lines, and its row stood taller than the others (the founder, 5 Oct 2026).
  assert.equal(under("edx-certificate"), "Harvard, MIT and more");
  assert.equal(conditionById("edx-certificate")?.name, "An edX certificate");
  assert.equal(conditionById("strava-daily")?.name, "Kilometres a day, on Strava");
  assert.equal(under("mitx-online-certificate"), "Online, on MITx");
  assert.equal(under("coursera-certificate"), "Online courses");
  assert.equal(under("chess-rating"), "Rapid, blitz, bullet or daily");
  assert.deepEqual([...CHESS_MODES], ["rapid", "blitz", "bullet", "daily"]);
  assert.equal(under("chess-tactics"), "Their best puzzle rating");
  assert.equal(under("fitbit-daily"), "From their activity tracker");
  // Proposed as "Enrolment, a year passed or a grade": seven words, and two lines on a 360 pixel phone, so that row
  // stood taller than the others. The same three things in five words.
  for (const id of ["university-enrollment-shown", "university-year-passed-shown", "university-grade-shown"]) assert.equal(under(id), "Enrolment, year passed or grade", id);
  // Two were proposed narrower than what the reading counts, and say what is true in the same form. A day on
  // Duolingo is the profile's whole XP, whatever the course, and Duolingo teaches math, music and chess beside
  // languages; a day on Strava is the distance of every activity, whatever its kind.
  assert.equal(under("duolingo-daily"), "Languages, math, music or chess");
  assert.match(read("src/duolingo-public.ts"), /"totalXp":\(\?<totalXp>/);
  assert.equal(under("strava-daily"), "Runs, rides, walks and more");
  const strava = read("src/strava.ts");
  assert.match(strava, /if \(at >= start && at < end\) metres \+= distance;/);
  assert.doesNotMatch(strava.slice(strava.indexOf("export function distanceOfDay"), strava.indexOf("/** The day's verdict")), /sport_type|\.type\b/, "no kind of activity is left out");
  assert.match(read("app/kit/offer/WillSheet.tsx"), /<span className=\{HELP\} data-what-it-is="">\n\s*\{option\.under\}\n\s*<\/span>/);
});
