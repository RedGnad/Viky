import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { EASING, MOTION, SPRING } from "../src/design-tokens.js";
import { arrivalSchedule, bezierProgress, springEasing, springOvershoot, springProgress, springSettleMs } from "../src/motion.js";

/**
 * The motion of the brief (section 6) as numbers: the curves and springs are Material's own, a spring settles when the
 * physics says it does, only position and size may overshoot, and nothing lasts anywhere near the five seconds of
 * WCAG 2.2.2.
 */

test("the curves are Material's published tokens, character for character", () => {
  assert.equal(EASING.standard, "cubic-bezier(0.2, 0, 0, 1)");
  assert.equal(EASING.emphasizedDecelerate, "cubic-bezier(0.05, 0.7, 0.1, 1)");
  assert.equal(EASING.emphasizedAccelerate, "cubic-bezier(0.3, 0, 0.8, 0.15)");
  assert.deepEqual(SPRING.expressiveFastSpatial, { damping: 0.6, stiffness: 800 });
  assert.deepEqual(SPRING.expressiveDefaultSpatial, { damping: 0.8, stiffness: 380 });
  assert.deepEqual(SPRING.effects, { damping: 1, stiffness: 1600 });
});

test("a spring starts at rest, ends on its target, and the expressive one overshoots while the effects one never does", () => {
  for (const spring of Object.values(SPRING)) {
    assert.equal(springProgress(spring, 0), 0);
    assert.ok(Math.abs(springProgress(spring, springSettleMs(spring) / 1000) - 1) < 0.001);
  }
  const peak = Math.max(...Array.from({ length: 300 }, (_, i) => springProgress(SPRING.expressiveFastSpatial, i / 600)));
  assert.ok(peak > 1.05 && peak < 1.12, `expressive peak ${peak}`);
  assert.ok(Math.abs(springOvershoot(SPRING.expressiveFastSpatial) - (peak - 1)) < 0.005);
  const effects = Array.from({ length: 300 }, (_, i) => springProgress(SPRING.effects, i / 600));
  assert.ok(Math.max(...effects) <= 1, "colour and opacity never overshoot");
});

test("a spring becomes a curve a browser can play: linear() from 0 to 1, as long as the spring takes to settle", () => {
  const { easing, durationMs } = springEasing(SPRING.expressiveFastSpatial);
  assert.match(easing, /^linear\(0, .*, 1\)$/);
  assert.equal(durationMs, springSettleMs(SPRING.expressiveFastSpatial));
  assert.ok(durationMs > 300 && durationMs < 600, `settles in ${durationMs} ms`);
});

test("the standard curve is solved as a browser solves it: it starts at 0, ends at 1, and is past halfway early", () => {
  assert.equal(bezierProgress(EASING.standard, 0), 0);
  assert.equal(bezierProgress(EASING.standard, 1), 1);
  assert.ok(bezierProgress(EASING.standard, 0.5) > 0.75);
  let last = 0;
  for (let t = 0; t <= 1; t += 0.05) {
    const value = bezierProgress(EASING.standard, t);
    assert.ok(value >= last - 1e-9, "the curve never goes back");
    last = value;
  }
});

const TIMINGS = {
  earnedAirborneMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs,
  earnedMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs + springSettleMs(MOTION.earned.landing),
  returnedMs: MOTION.returned.durationMs,
  countMs: MOTION.count.durationMs,
  budgetMs: MOTION.arrival.budgetMs,
  staggerMs: MOTION.arrival.staggerMs,
};

test("each moment is brief, and every one of them ends long before WCAG 2.2.2's five seconds", () => {
  assert.ok(MOTION.press.durationMs >= 100 && MOTION.press.durationMs <= 150, "a press is 100 to 150 ms");
  assert.ok(MOTION.count.durationMs < 1000, "an amount counts in under a second");
  const gift = Math.max(springSettleMs(MOTION.gift.spatial) + MOTION.gift.bowDelayMs, springSettleMs(MOTION.gift.effects));
  for (const [moment, ms] of Object.entries({ earned: TIMINGS.earnedMs, returned: MOTION.returned.durationMs, count: MOTION.count.durationMs, gift, press: MOTION.press.durationMs, reveal: MOTION.reveal.durationMs, hover: MOTION.hover.durationMs })) {
    assert.ok(ms < 1000, `${moment} lasts ${ms} ms`);
  }
  assert.equal(MOTION.ceilingMs, 5000);
  assert.equal(MOTION.arrival.budgetMs, 2000);
});

test("an arrival plays the days earned, then the days gone back, then the amount, in under two seconds however much changed", () => {
  for (let earned = 0; earned <= 90; earned += earned < 10 ? 1 : 20) {
    for (let returned = 0; returned <= 90; returned += returned < 10 ? 1 : 20) {
      for (const amount of [true, false]) {
        const plan = arrivalSchedule(earned, returned, amount, TIMINGS);
        assert.ok(plan.endMs < MOTION.arrival.budgetMs, `${earned} earned, ${returned} back: ${plan.endMs} ms`);
        assert.equal(plan.earnedAt.length, earned);
        assert.equal(plan.returnedAt.length, returned);
        assert.ok(plan.staggerMs >= 0 && plan.staggerMs <= MOTION.arrival.staggerMs);
        const lastEarned = earned > 0 ? plan.earnedAt[earned - 1] : -1;
        for (const at of plan.returnedAt) assert.ok(at > lastEarned, "a day gone back starts after every day earned has started");
        if (plan.amountAt !== null) {
          assert.ok(plan.amountAt >= Math.max(lastEarned, ...plan.returnedAt), "the amount counts last");
          assert.ok(amount);
        }
      }
    }
  }
  // The laboratory's own example: two days earned, one gone back, then the amount.
  const example = arrivalSchedule(2, 1, true, TIMINGS);
  assert.deepEqual(example.earnedAt, [0, MOTION.arrival.staggerMs]);
  assert.ok(example.endMs < 2000);
});

test("every movement answers a gesture: nothing plays on a clock, nothing repeats, and reduced motion stops all of it", () => {
  const source = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /\(hover: hover\) and \(pointer: fine\)/, "hover answers a pointer only");
  assert.doesNotMatch(source, /iterations/, "no moment repeats");
  assert.doesNotMatch(source, /setInterval|setTimeout/, "nothing waits for a clock to start");
  assert.match(source, /IntersectionObserver/, "a reveal answers the scroll");

  // The press and the hover are the two movements the stylesheet plays, because they answer a finger and a pointer.
  const css = readFileSync("app/globals.css", "utf8");
  // One exception, and it is named: while a gift is being made the chain is asked for up to thirty seconds, and a
  // still screen reads as an action nobody registered (the founder's instruction of 19 Sep 2026, Nielsen 1993 and
  // NN/g 2014). Everything outside the working ring still answers a gesture and still plays once.
  const outsideTheRing = css
    .replace(/\.working-ring \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes working-turn \{[\s\S]*?\n\}/, "")
    // The second exception, and it answers a gesture: a sheet rises once because a case of the card was pressed
    // (the product vision of 19 Sep 2026, section 4). It plays one time and stops.
    .replace(/dialog\.sheet\[open\] \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes sheet-rise \{[\s\S]*?\n\}/, "")
    // The third exception, and it answers the second of the four triggers, the arrival on a screen (D146): a page
    // change is a gesture, and what the page carries enters once, in 250 ms. Under reduced motion it is the fade
    // alone, which is the one place the stylesheet names an animation instead of playing one.
    .replace(/\.page-enters > \*:not\(header, dialog\),\n\s*\.page-enters > header > \*:not\(\.page-mark\)(,\n\s*\.page-enters \.arrives-in-turn > \*)? \{[\s\S]*?\n\s*\}/g, "")
    .replace(/\.page-enters \.arrives-in-turn[^{]*\{[\s\S]*?\n\s*\}/g, "")
    .replace(/@keyframes page-enter \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes page-fade \{[\s\S]*?\n\}/, "")
    // The fourth exception, and it answers the first gesture of all, opening the installed app: once per device, on
    // the launch screen's own image, never against reduced motion (src/launch-intro.ts, the founder, 28 Sep 2026).
    .replace(/\.launch-intro-figure \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes launch-intro-hop \{[\s\S]*?\n\}/, "")
    .replace(/\.launch-intro-word span \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes launch-intro-drop \{[\s\S]*?\n\}/, "")
    // Not a movement at all: the day row's fades follow its scroll from the first image, a timeline of the scroll and
    // not of the clock, so nothing plays by itself (the founder, 28 Sep 2026).
    .replace(/@supports \(animation-timeline: scroll\(\)\) \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes row-fade-left \{[\s\S]*?\n\}/, "")
    .replace(/@keyframes row-fade-right \{[\s\S]*?\n\}/, "");
  assert.doesNotMatch(outsideTheRing, /@keyframes|animation-name|infinite/, "the stylesheet plays no animation of its own beyond the one loop, the sheet, the arrival and the first opening");
  assert.match(css, /dialog\.sheet\[open\] \{\s*\n\s*animation: sheet-rise \d+ms/, "the sheet rises once, on the press that opened it");
  assert.match(css, /animation: working-turn \d+ms linear infinite/, "the one loop is the working ring, and it is the only one");
  assert.equal(css.match(/infinite/g)?.length, 1, "exactly one loop in the whole stylesheet");
  assert.ok(css.includes(`--press-duration: ${MOTION.press.durationMs}ms`), "the press lasts what the token says");
  assert.ok(css.includes(`--press-easing: ${MOTION.press.easing}`), "the press is the token's curve");
  assert.ok(css.includes(`--hover-duration: ${MOTION.hover.durationMs}ms`), "the hover lasts what the token says");
  assert.ok(css.includes(`--hover-lift: ${MOTION.hover.lift}px`), "a pointer lifts a button by what the token says");
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/, "a button lifts under a pointer only");
  // The arrival on a screen is MOTION.reveal itself, to the millisecond, the curve and the rise.
  assert.ok(css.includes(`--page-enter-duration: ${MOTION.reveal.durationMs}ms`), "a screen arrives in what the token says");
  assert.ok(css.includes(`--page-enter-easing: ${MOTION.reveal.easing}`), "on the token's curve");
  assert.ok(css.includes(`--page-enter-rise: ${MOTION.reveal.rise}px`), "rising what the token says");
  assert.ok(css.includes(`--page-enter-from: ${MOTION.reveal.fromOpacity};`), "from the opacity the token says, never from nothing (D196)");
  assert.match(css, /@keyframes page-enter \{\n\s*from \{\n\s*transform: translateY\(var\(--page-enter-rise\)\);\n\s*opacity: var\(--page-enter-from\);/, "the entrance starts at 60 %");
  assert.match(css, /\.page-enters > \*:not\(header, dialog\)/, "what a page carries enters; the sheets and the mark do not");
  assert.match(
    css,
    /animation: page-enter var\(--page-enter-duration\) var\(--page-enter-easing\) backwards;/,
    "once, unseen until its turn comes, and nothing left behind it after",
  );
  // The blocks of a screen arrive one after another, and the whole arrival still ends inside NN/g's half second.
  assert.ok(css.includes(`--page-enter-stagger: ${MOTION.reveal.staggerMs}ms`), "each block waits what the token says");
  assert.ok(css.includes(`--page-enter-most-staggered: ${MOTION.reveal.mostStaggeredMs}ms`), "and none waits longer than the token's ceiling");
  assert.ok(css.includes(`--page-enter-last-turn: ${MOTION.reveal.lastTurnMs}ms`), "a list's turns stop at the token's own last one");
  assert.ok(MOTION.reveal.durationMs + MOTION.reveal.mostStaggeredMs <= 500, "a page of any length has arrived in half a second");
  // The turns are the founder's (D171): 80 ms apart, which is not a step Material publishes (it sits between short1
  // and short2, and short2 is the next one to try if 80 still reads as simultaneous), three of them and no more, so
  // the ceiling is three turns and a list stops at the same ceiling.
  assert.equal(MOTION.reveal.staggerMs, 80);
  assert.equal(MOTION.reveal.mostStaggeredMs, 3 * MOTION.reveal.staggerMs);
  assert.equal(MOTION.reveal.lastTurnMs, MOTION.reveal.mostStaggeredMs);
  assert.match(css, /\.page-enters \.arrives-in-turn > :nth-child\(n \+ 5\) \{\n\s*animation-delay: var\(--page-enter-last-turn\)/, "the fourth card and every one after it arrive together");
  // Material publishes sixteen durations and no others (md.sys.motion.duration.short1 to extra-long4); a duration
  // outside that list is refused in review, which is the rule the motion roadmap of 21 Sep 2026 sets.
  const MATERIAL_MS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000];
  assert.ok(MATERIAL_MS.includes(MOTION.reveal.durationMs), `the reveal is ${MOTION.reveal.durationMs} ms, which Material does not publish`);
  const shell = readFileSync("app/kit/Shell.tsx", "utf8");
  assert.match(shell, /className=\{`\$\{enters \? "page-enters " : ""\}mx-auto /, "every screen reached by a navigation enters block by block; the document's first is drawn whole and still (D198)");
  assert.match(shell, /const \[enters\] = useState\(\(\) => aScreenWasDrawn\)/, "and whether one was drawn is a module variable the server never sets, so hydration agrees");
  assert.doesNotMatch(shell, /page-arrives|useHasDrawnBefore/, "no screen arrives in one fade any more");
  assert.doesNotMatch(css, /\.page-arrives/, "and the stylesheet has no such screen");
  assert.match(readFileSync("app/template.tsx", "utf8"), /export default function Template/, "and a template is what builds it again on every navigation");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.control-relief:is\(:active, :hover\)/, "under reduced motion a press gives way but nothing travels");
  // A screen still arrives, by fading alone: the rise is dropped and the duration is kept (the founder, 21 Sep 2026).
  assert.match(reduced, /animation-name: page-fade !important/, "under reduced motion a screen fades in and nothing rises");
  assert.match(reduced, /animation-duration: var\(--page-enter-duration\) !important/, "and the fade keeps its own time");
  // Outside that query nothing plays the fade alone (D171): every screen enters, and the fade is reduced motion's.
  const outside = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.equal((outside.match(/animation(-name)?: page-fade/g) ?? []).length, 0, "the fade alone belongs to reduced motion");
});

/**
 * The character is where it can answer, and the two expressions are built from the parts it already has (D148, the
 * motion roadmap's step 2). Nothing new is drawn, nothing plays on a clock, and a screen with no pointer plays the
 * expression once on the choice, in and held and back, for 700 ms, which is Material's extra-long1.
 */
test("the character stands on the four screens, and answers with the parts it already has", () => {
  const drawing = readFileSync("app/kit/Character.tsx", "utf8");
  for (const part of ["gaze", "eye", "mouth"]) {
    assert.match(drawing, new RegExp(`data-part="${part}"`), `the ${part} is named, so an expression can move it`);
  }
  const head = readFileSync("app/kit/HeadCharacter.tsx", "utf8");
  assert.match(head, /<Expression>[\s\S]*state="diamond"/, "the same character as the page without an account, and it feels what the record says");
  assert.doesNotMatch(head, /<Gaze/, "and it follows no pointer (D216)");
  for (const [screen, file] of Object.entries({
    "a gift's page": "app/components/GiftPage.tsx",
    "the way out": "app/cash-out/page.tsx",
    "the sheet that pays": "app/kit/offer/PaySheet.tsx",
  })) {
    assert.match(readFileSync(file, "utf8"), /<HeadCharacter \/>/, `${screen} carries the character`);
  }
  // The card asks the character nothing (D216): no control on it says what it is being asked about.
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.equal((card.match(/asksAbout\(|feel\(/g) ?? []).length, 0, "nothing on the card asks the character anything");
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /export function Expression\(/);
  assert.match(motion, /mood\.once/, "a device with no pointer is given the round trip rather than a hover");
  assert.equal(MOTION.hover.durationMs * 2 + MOTION.hover.heldMs, 700, "in, held, and back is Material's extra-long1");
  assert.ok(MOTION.hover.heldMs === 300, "the beat it is held for is Material's medium2");
});

/**
 * An amount that changed counts to its value once (brief, section 6), driven frame by frame rather than by the
 * stylesheet, so `document.getAnimations()` never sees it. Every run that photographs a screen has to wait for the
 * count, or it keeps a figure that was true for 200ms: the captures of 18 Sep showed $0.11, $0.24 and $0.78 for an
 * account holding $2.00, which is how this was found (relecture, line 5).
 */
test("the amount says when it has arrived, and every capture run waits for it", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /data-count-settled=\{settled \? "true" : "false"\}/, "nothing says when the count is over");
  // Three things make that answer true, and the run of 19 Sep proved that the first two alone are not enough: the
  // figure equalled its value before the count began, the attribute said "arrived", and the picture was taken in the
  // middle of the count ($1.15 of an account holding $2.00).
  assert.match(motion, /const settled = plan\.decided && \(plan\.amountAt === null \|\| from === to \|\| counted === count\)/);
  assert.match(motion, /const UNDECIDED: Plan = \{ \.\.\.NOTHING, decided: false \}/, "an arrival that has not read the device yet must say so");
  assert.match(motion, /useState<Plan>\(\{ \.\.\.UNDECIDED, pending: changed\.pending \}\)/, "the arrival starts undecided, not settled, knowing what is pending (the fix to #154)");
  assert.match(motion, /setCounted\(count\)/, "the count that finished is what says it is over, by name");
  // Every path out of deciding answers, including the one where nothing plays: a silent return would leave whoever
  // waits for the count waiting until their timeout, on every screen that holds an amount.
  assert.equal(motion.match(/decided: true/g)?.length, 3, "each decision says so: none, nothing to play, a plan");
  for (const script of ["scripts/capture-connected.ts", "scripts/review-capture.ts", "scripts/capture-looks.ts"]) {
    assert.match(readFileSync(script, "utf8"), /data-count-settled/, `${script} photographs a screen mid-count`);
  }
});
