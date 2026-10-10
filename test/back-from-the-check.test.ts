import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { MOTION } from "../src/design-tokens";
import { liveOf, type LiveInput } from "../src/gift-live";
import { GIFT_LIVE, SHOW_PROOF } from "../src/sentences";
import { cameBackShown, SHOWN_MARK, shownReturnPath, withoutShownMark } from "../src/shown-return";

/**
 * Back from the verification, on a gift's page (the founder, 10 Oct 2026, on what he saw on 9 Oct and on an animated
 * mockup). The page came back on the "Show it" block with "Checking for your proof" in small under it; at the payment
 * the block said "Shown: ..." in small, the page read the gift again, the character was another drawing with no
 * movement, the title changed, "Reached on ..." pushed the amount down, and then the moment opened.
 *
 * Now the card says where the proof stands, its character jumps and becomes the circle in the air, the words change
 * where they stand as it lands, and the moment opens after. No sentence was reworded and no block was added.
 */
const page = readFileSync("app/components/GiftPage.tsx", "utf8");
const block = readFileSync("app/kit/ShowProof.tsx", "utf8");
const motion = readFileSync("app/kit/Motion.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

const WAITING: LiveInput = {
  moment: "awaitingProof",
  voice: "recipient",
  funderName: "Mom",
  recipientName: "Boo",
  source: "university",
  amountDisplay: "$5.00",
  theirsDisplay: "$0.00",
  returnedDisplay: "$0.00",
  todayReading: null,
  target: 1,
  started: true,
  lastJudged: null,
  shown: true,
  shape: "stamp",
  openBy: null,
  connectBy: null,
  nextReadingInWords: null,
  cameBackOnInWords: null,
};

test("while their own proof is asked about, the card says so itself and the block under it draws nothing", () => {
  // The state is the card's headline, in the words a proof under review already has, and nothing is dated under it.
  const checking = liveOf({ ...WAITING, proof: "pending" });
  assert.equal(checking.headline, "Shown. Viky is checking it.");
  assert.equal(checking.next, null);
  assert.equal(checking.figure?.label, liveOf(WAITING).figure?.label, "the money and its label stand as they stood");
  assert.match(page, /const shownAndChecked = checkingTheirOwn && cameBackShown;\n\s+const said = liveOf\(shownAndChecked \? \{ \.\.\.liveInput, proof: "pending" \} : liveInput\);/, "said only to a person brought back with a proof made");
  // What the funder would read is not changed by it: their own page has no session to ask about.
  assert.match(page, /const theirs = liveOf\(\{ \.\.\.liveInput, voice: "funder" \}\);/);
  // The wait is the card's own line, the wheel and one sentence, where the next moment is said.
  assert.equal(GIFT_LIVE.awaitingProof.keepOpen, "Keep this page open.");
  assert.match(page, /waiting=\{checkingTheirOwn && !landed \? L\.awaitingProof\.keepOpen : dayReading\.phase === "certifying" \? WAITS\.counting\(source\) : null\}/);
  // The same words the verification page shows while it reads: the two screens say one thing.
  assert.match(readFileSync("docs/reclaim/utoulouse-enrolment-provider.md", "utf8") + readFileSync("test/utoulouse-provider-script.test.ts", "utf8"), /Keep this page open\./);
  // The block is silent while the server is asked and once the proof has paid, and its two small lines are gone.
  assert.match(block, /if \(saidByTheCard\(state\)\) return null;/);
  assert.doesNotMatch(block, /W\.checking|W\.shown\(/);
  assert.ok(!("shown" in SHOW_PROOF), "nothing draws that sentence any more");
  // And an action that draws nothing takes no room on the card.
  assert.match(css, /\.gift-action:empty \{\n\s*display: none;\n\}/);
});

test("the page and the block are never seen out of step, from the first image on", () => {
  // The block tells the page before the browser paints what it draws, and that it is gone when it is.
  assert.match(block, /const silent = saidByTheCard\(state\);\n\s+useLayoutEffect\(\(\) => \{\n\s+tell\.current\?\.\(silent\);\n\s+return \(\) => tell\.current\?\.\(false\);\n\s+\}, \[silent\]\);/);
  // The first image: both start from the same rule, the session read on the server with the page.
  assert.match(page, /const \[proofSilent, setProofSilent\] = useState\(\(\) => checkingAtLoad\(\{ yours: mine, review: proofReview, openAtLoad: openProof \}\)\);/);
  assert.match(block, /useState<State>\(\(\) => \(checkingAtLoad\(\{ yours, review, openAtLoad \}\) \? \{ at: "checking" \} : \{ at: "asking" \}\)\);/);
  // Said only where the block is mounted, by the one test that mounts it.
  assert.match(page, /const checkingTheirOwn = proofSilent && mine && showsProof && !proofReview;/);
  assert.match(page, /return showsProof \? \(\s*<ShowProof /);
  // The link, the button and a refusal are still the block's own.
  for (const kept of ["{W.signInTo(condition.source)}", "{W.waiting}", "{W.stopWaiting}", "W.button", "{state.message}"]) assert.ok(block.includes(kept), kept);
});

test("a character never changes shape without its movement: reached, it jumps and is the circle when it comes down", () => {
  // The lone character of a gift had or not knows what it was drawn as a moment ago.
  const lone = readFileSync("app/kit/HadOrNot.tsx", "utf8");
  assert.match(lone, /if \(drawn\.now !== character\) setDrawn\(\{ now: character, was: drawn\.now \}\);/);
  assert.match(lone, /const change = drawn\.was === "today" && drawn\.now === "earned" \? "earned" : drawn\.was === "toCome" && drawn\.now === "today" \? "woken" : null;/);
  // Started before the browser paints the new shape, so the shape it had is the movement's first image.
  assert.match(lone, /useLayoutEffect\(\(\) => \{\n\s+const element = root\.current;\n\s+if \(!element \|\| !change\) return;\n\s+const running = playChange\(element, change\);/);
  assert.match(lone, /<Character state="earned" standing=\{false\} drawn="inline" from="today" /);
  assert.match(lone, /<Character state="today" standing=\{false\} drawn="inline" wakes /);
  // The jump of a day earned, and the waking of a day that opens: no third movement. Nothing under reduced motion.
  assert.match(motion, /export function playChange\(root: Element, change: "earned" \| "woken"\): Animation\[\] \{\n\s+if \(reduced\(\)\) return \[\];\n\s+return change === "earned" \? playEarned\(root, 0, "becomes"\) : playWoken\(root, 0\);/);
  // The becoming: 120 ms across the top of the jump, each side holding its first image until then.
  assert.equal(MOTION.earned.becomeMs, 120);
  assert.match(motion, /delay: delay \+ gatherMs \+ riseMs - becomeMs \/ 2, easing: EASING\.standard, fill: "backwards" \}\);/);
  assert.match(motion, /for \(const was of root\.querySelectorAll\('\[data-part="was"\], \[data-part="was-gloss"\]'\)\) animations\.push\(fade\(was, 1, 0\)\);/);
  assert.match(motion, /for \(const now of root\.querySelectorAll\('\[data-part="body"\], \[data-part="face"\], \[data-part="figure"\] > \[data-part="gloss"\]'\)\) animations\.push\(fade\(now, 0, 1\)\);/);
  // The page tells the character at once, before the card says anything.
  assert.match(page, /<HadOrNot state=\{reach\.reaching \|\| milestone\.reached \? "reached" : milestone\.finished \|\| milestone\.cancelled \? "void" : "waiting"\} asleep=\{!milestone\.opened\} \/>/);
});

test("the day carries the triangle it was inside the group that turns, and its highlight where the light is", () => {
  const carried = renderToStaticMarkup(createElement(Character, { state: "earned", standing: false, drawn: "inline", from: "today" }));
  assert.match(carried, /data-character="earned"[^>]* data-from="today"/);
  const whirl = carried.slice(carried.indexOf('data-part="whirl"'), carried.indexOf('data-part="was-gloss"'));
  assert.ok(whirl.includes('data-part="was"') && whirl.indexOf('data-part="was"') < whirl.indexOf('data-part="body"'), "the triangle turns with the day, under the circle");
  assert.ok(carried.indexOf('data-part="was-gloss"') > carried.indexOf('data-part="face"'), "its highlight is outside the turn, as the circle's is");
  // The triangle is the day of today's own drawing.
  const today = renderToStaticMarkup(createElement(Character, { state: "today", standing: false, drawn: "inline" }));
  const triangle = /<path d="(M[^"]+)"/.exec(today)?.[1] ?? "none";
  assert.ok(carried.includes('<path d="' + triangle + '"'));
  // A day earned that nothing carries is the drawing it was, and a named drawing carries nothing.
  const plain = renderToStaticMarkup(createElement(Character, { state: "earned", standing: false, drawn: "inline" }));
  assert.ok(!plain.includes("data-from") && !plain.includes('data-part="was"'));
  assert.ok(!renderToStaticMarkup(createElement(Character, { state: "earned", standing: false, from: "today" })).includes('data-part="was"'));
  // Out of sight outside the movement; the first image of a day that waits its turn; still under reduced motion.
  assert.match(css, /\[data-character="earned"\] \[data-part="was"\],\n\[data-character="earned"\] \[data-part="was-gloss"\] \{\n\s*opacity: 0;\n\}/);
  assert.match(css, /\.arrival-pending svg\[data-character="earned"\]\[data-from\] \[data-part="was"\],\n\.arrival-pending svg\[data-character="earned"\]\[data-from\] \[data-part="was-gloss"\] \{\n\s*opacity: 1;\n\}/);
  assert.match(css, /\.arrival-pending svg\[data-character="earned"\]:not\(\[data-from\]\) \[data-part="eye"\] \{\n\s*transform: scaleY\(0\.36\);/, "a day earned since another visit still stands asleep");
  const reducedCss = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("The fold's own mark")));
  assert.match(reducedCss, /\[data-from\] \[data-part="was-gloss"\] \{\n\s*opacity: 0;/);
});

test("a day earned on the page that drew it as a triangle makes the same jump (Count now)", () => {
  // The arrival remembers each day's shape as this screen drew it, and a day earned that was a triangle becomes from it.
  assert.match(motion, /type Shown = Readonly<Record<string, Readonly<\{ settled: number; open: number; days: readonly CharacterState\[\] \}>>>;/);
  assert.match(motion, /if \(day === "earned" && \(was === "today" \|\| was === "catchable"\)\) from\.set\(/);
  assert.match(motion, /list\.map\(\(gift\) => shown\[gift\.id\]\?\.days\),/, "known in the very image that brings the change");
  assert.match(motion, /fromExample \? \[\] : list\.map\(\(gift\) => drew\.current\[gift\.id\]\),/, "and in the play that follows it");
  assert.match(motion, /playEarned\(element, step\.delay, from \? "becomes" : true\)/);
  // A day earned since another visit was never drawn otherwise by this screen: asleep until its turn, as before.
  assert.match(motion, /const NOTHING: Plan = \{ round: 0, days: new Map\(\), amountAt: null, decided: true, pending: new Set\(\), from: NO_TRIANGLE, about: "" \};/);
  for (const row of ["app/kit/DayRow.tsx", "app/kit/DayStrip.tsx"]) assert.match(readFileSync(row, "utf8"), /\{\(from\) => \(\s*<Character[\s\S]{0,700}?from=\{characterOf\((state|day)\) === "earned" \? from : undefined\}/, row);
});

test("as it lands the words change where they stand, the amount swells once, and the moment opens after", () => {
  // The card is drawn from the gift as it was until the character has landed and the old words are out.
  assert.match(page, /const reaching = !still && !released && Boolean\(status && said && status !== said && status\.giftId === said\.giftId && hadAndReached\(status\) && !hadAndReached\(said\)\);/);
  assert.match(page, /if \(status !== said && !reaching\) setSaid\(status\);/, "anything else read of the gift is said at once");
  assert.match(page, /const cues = \[after\(EARNED_AIRBORNE_MS, \(\) => setStep\(1\)\), after\(EARNED_AIRBORNE_MS \+ wordsOutMs, \(\) => setStep\(2\)\), after\(EARNED_AIRBORNE_MS \+ momentAfterMs, \(\) => setMomentFree\(true\)\)\];/);
  // Once landed the card alone says the gift as it is, by the rules every card is said by.
  assert.match(page, /const landed = reaching && step === 2 && status\?\.kind === "milestone" \? status : null;/);
  assert.match(page, /const live = landed\s+\? liveOf\(\{ \.\.\.liveInput, moment: readAs\(giftOfMilestone\(landed\), voice\)\.moment, /);
  // Timed by animations that move nothing, on the clock the jump runs on.
  assert.match(page, /const cue = document\.documentElement\.animate\(\[\], \{ duration: ms \}\);/);
  assert.doesNotMatch(page + motion, /setTimeout|setInterval/, "never a clock");
  assert.match(motion, /export const EARNED_AIRBORNE_MS = MOTION\.earned\.gatherMs \+ MOTION\.earned\.riseMs \+ MOTION\.earned\.fallMs;/);
  // Under reduced motion nothing is held: the final state at once.
  assert.match(page, /const still = useReducedMotion\(\);/);
  // The three lines that turn and the amount that swells are named by the card.
  const card = readFileSync("app/kit/GiftLive.tsx", "utf8");
  assert.equal(card.split('data-turns="words"').length - 1 - 1, 4, "the state, the wait or the next moment, and the money's label (and once in the comment)");
  assert.match(card, /<p className=\{CARD_AMOUNT\} data-turns="amount">/);
  assert.match(css, /\[data-turns="amount"\] \{\n\s*transform-origin: 0 50%;\n\}/);
  // Out on Material's short2, in on short4, the swell of the moment made smaller, the moment 700 ms after the landing.
  assert.deepEqual(MOTION.landing, { wordsOutMs: 100, wordsInMs: 200, swell: 1.08, momentAfterMs: 700 });
  assert.match(motion, /fill: "forwards" \}\) : line\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: wordsInMs, easing: EASING\.standard \}\)/);
  // The head of a page that saw the reach stays as it was: no character appears above the card as its own lands.
  assert.match(page, /moment === "counting" \|\| moment === "climbing" \|\| moment === "awaitingProof" \|\| reach\.sawTheReach \? null : \(/);
  assert.match(page, /sawTheReach: reachedHere !== null, release \};/);
  // The moment itself is unchanged: it is only held until the page lets it.
  const moment = readFileSync("app/kit/ReachedMoment.tsx", "utf8");
  assert.match(moment, /<ReachedMoments gifts=\{owed && !held \? \[gift\] : \[\]\} here onOpened=\{\(\) => settled\.current\?\.\(\)\} \/>/);
  assert.match(page, /held=\{reach\.momentHeld\} quiet=\{landed !== null\} onSettled=\{reach\.release\} \/>/);
  assert.deepEqual(MOTION.moment, { inMs: 450, becomesAfterMs: 900, pieces: 64, fallMs: 2200, spreadMs: 1100 });
});

test("\"Shown.\" is never said of what may not have been: the address after a proof carries a mark, read once", () => {
  // The verification page goes to one address after a proof and to another after a verification abandoned (the
  // installed SDK's own words: "after successful proof generation", "after an error which aborts the verification").
  const route = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(route, /proofRequest\.setRedirectUrl\(`\$\{accountAuthOriginFromRequest\(request\)\}\/g\/\$\{giftId\}\?shown=1`\);/, "with a proof made: the mark");
  assert.match(route, /proofRequest\.setCancelRedirectUrl\(`\$\{accountAuthOriginFromRequest\(request\)\}\/g\/\$\{giftId\}`\);/, "abandoned: none");
  assert.equal(shownReturnPath("1000008"), "/g/1000008?" + SHOWN_MARK + "=1", "the route writes out what the page reads");
  // Read with the page, on the server, and kept for as long as the page stands.
  const served = readFileSync("app/g/[id]/page.tsx", "utf8");
  assert.match(served, /const \{ t, shown \} = await props\.searchParams;/);
  assert.match(served, /cameBackShown=\{cameBackShown\(shown\)\}/);
  assert.equal(cameBackShown("1"), true);
  for (const other of [undefined, "", "0", "true", ["1", "1"]]) assert.equal(cameBackShown(other), false);
  assert.match(page, /const \[shown\] = useState\(cameBackShown\);/);
  // Taken out of the address bar, so a page loaded again does not say it a second time; the rest of the address stays.
  assert.match(page, /if \(new URL\(window\.location\.href\)\.searchParams\.has\(SHOWN_MARK\)\) window\.history\.replaceState\(null, "", withoutShownMark\(window\.location\.href\)\);/);
  assert.equal(withoutShownMark("https://viky.cash/g/1000008?shown=1"), "/g/1000008");
  assert.equal(withoutShownMark("https://viky.cash/g/1000008?t=AbCdEfGhIjKlMnOpQrStUv&shown=1#k"), "/g/1000008?t=AbCdEfGhIjKlMnOpQrStUv#k");
  assert.equal(withoutShownMark("https://viky.cash/g/1000008"), "/g/1000008");
  // Without the mark, on a session still open: the card says what the page is doing, in the sentence that existed,
  // with the same wait under it, and never "Shown.".
  assert.equal(SHOW_PROOF.checking, "Checking for your proof");
  assert.match(page, /const asked = checkingTheirOwn && !cameBackShown \? \{ \.\.\.said, headline: SHOW_PROOF\.checking, next: null \} : said;/);
  assert.doesNotMatch(block, /W\.checking/, "and the block under the card still draws nothing then");
});

test("the jump is one in the product, and its height gives way to the room above the character", () => {
  // The curve, the durations, the squash and the turn are the tokens', untouched.
  assert.deepEqual({ gatherMs: MOTION.earned.gatherMs, riseMs: MOTION.earned.riseMs, fallMs: MOTION.earned.fallMs, riseBy: MOTION.earned.riseBy, turns: MOTION.earned.turns }, { gatherMs: 80, riseMs: 170, fallMs: 130, riseBy: 0.38, turns: 1 });
  // Where the jump is read: the rise is the smaller of the jump's own and the free room, the stretch of its top taken off.
  assert.match(motion, /const rise = riseOf\(figure, riseBy\);/);
  // Written as a length taken from the character at rest, never as a share of a box that grows while it turns.
  assert.match(motion, /const share = riseWithin\(figure, riseBy\);/);
  assert.match(motion, /if \(height > 0\) return `\$\{Math\.round\(share \* height \* 1000\) \/ 1000\}px`;/);
  assert.match(motion, /return Math\.max\(0, Math\.round\(Math\.min\(riseBy, roomAbove\(figure\) \/ height - \(APEX_STRETCH - 1\)\) \* 1000\) \/ 1000\);/);
  assert.match(motion, /transform: `translateY\(-\$\{rise\}\) scale\(0\.94, \$\{APEX_STRETCH\}\)`, easing: EASING\.emphasizedAccelerate \}/);
  assert.match(motion, /const APEX_STRETCH = 1\.08;/);
  assert.equal((motion.match(/riseBy \* 100/g) ?? []).length, 0, "no jump rises by its own figure alone any more");
  // The room: the nearest box above on the page, or the inner edge of a box that cuts what leaves it; beside is not above.
  assert.match(motion, /if \(\(box\.width === 0 && box\.height === 0\) \|\| box\.bottom > top \|\| OUT_OF_FLOW\.has\(getComputedStyle\(before\)\.position\)\) continue;\n\s+return top - box\.bottom;/);
  assert.match(motion, /if \(around && getComputedStyle\(around\)\.overflowY !== "visible"\) return Math\.max\(0, top - \(around\.getBoundingClientRect\(\)\.top \+ around\.clientTop\)\);/);
  assert.match(motion, /return Number\.POSITIVE_INFINITY;/, "nothing above is no limit");
});

test("under the card the page changes only once the moment covers it", () => {
  const moment = readFileSync("app/kit/ReachedMoment.tsx", "utf8");
  // The moment says when it is fully there, having risen in, and the page is told once: then, or when none is owed.
  assert.match(moment, /animations\[0\]\.finished\.then\(\(\) => opened\.current\?\.\(\)\)\.catch\(\(\) => undefined\);/);
  assert.match(moment, /if \(!answer\.seen\) setOwed\(true\);\n\s+else settled\.current\?\.\(\);/);
  assert.match(moment, /\.catch\(\(\) => \{\n\s+if \(live\) settled\.current\?\.\(\);\n\s+\}\);/, "an answer that fails leaves nothing waiting");
  // "See it again" is not drawn while the page under the moment is still as it was.
  assert.match(moment, /\{quiet \? null : \(\s*<button type="button" onClick=\{\(\) => setAgain\(true\)\}/);
  // The page: drawn from the gift as it was until then, the controls of the person it is for with it.
  assert.match(page, /const release = useCallback\(\(\) => setReleased\(true\), \[\]\);/);
  assert.match(page, /if \(status !== said && !reaching\) setSaid\(status\);/);
  // A reader nobody plays the moment to waits for nothing.
  assert.match(page, /const noMomentToWaitFor = landed !== null && !\(mine \|\| readerIsFunder\);/);
});
