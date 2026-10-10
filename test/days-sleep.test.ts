import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character, type CharacterState } from "../app/kit/Character";
import { characterOf } from "../app/kit/DayStrip";
import { MOTION, SPRING } from "../src/design-tokens";
import { springEasing } from "../src/motion";

// A day sleeps until it is done (the founder, 4 Oct 2026, in the place of "the days wake at the opening"). At the
// opening, the gift's own character answers, at the head of the page, and the days do not move. A day earned wakes in
// its jump, with one small turn, and the days done since the last visit play it on arrival, one after another, once.

const row = readFileSync("app/kit/DayRow.tsx", "utf8");
const motion = readFileSync("app/kit/Motion.tsx", "utf8");
const page = readFileSync("app/components/GiftPage.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("the row of a gift that has not started is asleep, opened or not, and nothing in it moves at the opening", () => {
  // The row plays nothing of its own: opening a gift's page wakes no day. The waking is a day's own, when it opens.
  assert.doesNotMatch(row, /useLayoutEffect|\.animate\(|MOTION\./, "the row plays nothing of its own");
  assert.match(row, /<ol className="day-row-days" data-days="asleep">/);
  // Every day of it is the sleeping character, named from the characters' file: its eyes are closed and cannot be moved.
  assert.match(row, /<Character state="toCome" variant=\{index\} standing=\{false\} className="h-auto w-full" \/>/);
  assert.doesNotMatch(page, /awake=/, "the page no longer says the gift is opened to its row");
});

test("at the opening, the gift's own character answers once, on the gift's spring, and never when the page is first drawn", () => {
  // The opening is counted only when it happens on a page already drawn.
  assert.match(page, /const \[sawOpened, setSawOpened\] = useState\(status\.opened\);\n\s*const \[openings, setOpenings\] = useState\(0\);\n\s*if \(status\.opened !== sawOpened\) \{\n\s*setSawOpened\(status\.opened\);\n\s*if \(status\.opened\) setOpenings\(openings \+ 1\);\n\s*\}/);
  assert.match(page, /<Reacts gesture=\{openings\}>\n\s*<HeadCharacter \/>\n\s*<\/Reacts>/);
  const reacts = motion.slice(motion.indexOf("export function Reacts"), motion.indexOf("/**\n * What an arrival plays"));
  assert.match(reacts, /const answered = useRef\(gesture\);\n\s*useLayoutEffect\(\(\) => \{\n\s*if \(answered\.current === gesture\) return;/, "not on the first image, and before the browser paints the answer");
  assert.match(reacts, /if \(!element \|\| reduced\(\)\) return;\n\s*const running = playGift\(element, false\);/, "the gift's movement, and nothing under reduced motion");
  assert.doesNotMatch(reacts, /setTimeout|setInterval|iterations/, "nothing loops and nothing waits on a clock");
  // A character already there does not fade in: the spring alone.
  assert.equal((motion.match(/if \(appears\) animations\.push\((figure|shadow)\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/g) ?? []).length, 2);
});

test("a day earned wakes in its jump: eyes shut until it lands, one small turn in the air, and only in an arrival", () => {
  assert.deepEqual({ turns: MOTION.earned.turns, eyesShut: MOTION.earned.eyesShut, mouthShut: MOTION.earned.mouthShut }, { turns: 1, eyesShut: 0.36, mouthShut: 0.4 });
  assert.equal(MOTION.earned.turns, MOTION.hero.turns, "the turn the landing's character makes");
  const earned = motion.slice(motion.indexOf("function playEarned"), motion.indexOf("/** A day gone back"));
  // Shut from the first frame, through its wait and through the air, and open on the landing spring.
  assert.match(earned, /\{ offset: 0, transform: shut \},\n\s*\{ offset: jumpMs \/ total, transform: shut, easing: land\.easing \},\n\s*\{ offset: 1, transform: "none" \},/);
  assert.match(earned, /eye\.animate\(opens\(`scaleY\(\$\{eyesShut\}\)`\), \{ duration: total, delay, fill: "backwards" \}\)/);
  assert.match(earned, /mouth\.animate\(opens\(`scale\(\$\{mouthShut\}\)`\), \{ duration: total, delay, fill: "backwards" \}\)/);
  // The turn is in the air only: it starts when the day leaves the floor and is over as it lands.
  assert.match(earned, /\{ offset: gatherMs \/ total, transform: `rotate\(\$\{-360 \* turns\}deg\)`, easing: EASING\.emphasizedDecelerate \},\n\s*\{ offset: jumpMs \/ total, transform: "rotate\(0deg\)" \},/);
  // The day in an arrival wakes; the head of a screen keeps the plain jump, eyes open.
  assert.match(motion, /step\.moment === "earned" \? playEarned\(element, step\.delay, from \? "becomes" : true\) : step\.moment === "woken" \? playWoken\(element, step\.delay\) : playReturned\(element, step\.delay\)/);
  assert.match(motion, /const jumping = playEarned\(element, 0\);/);
  // The drawing gives the turn its group, turning from its own middle, and the characters' file is made from it.
  assert.match(readFileSync("app/kit/Character.tsx", "utf8"), /\{\.\.\.\(withLimbs \|\| state === "earned" \? \{ "data-part": "whirl", style: FROM_MIDDLE \} : \{\}\)\}/);
});

test("a day done since the last visit is there from the first image, asleep, and its turn comes in the arrival's order", () => {
  // The first image: there, eyes shut and smile small, at the figures the movement starts from.
  assert.match(css, /\.arrival-pending svg\[data-character="earned"\] \{\n  opacity: 1;\n\}/);
  // (A day earned while this screen stood is the triangle it was instead: test/back-from-the-check.test.ts.)
  assert.match(css, new RegExp(`\\.arrival-pending svg\\[data-character="earned"\\]:not\\(\\[data-from\\]\\) \\[data-part="eye"\\] \\{\\n  transform: scaleY\\(${MOTION.earned.eyesShut}\\);\\n\\}`));
  assert.match(css, new RegExp(`\\.arrival-pending svg\\[data-character="earned"\\]:not\\(\\[data-from\\]\\) \\[data-part="mouth"\\] \\{\\n  transform: scale\\(${MOTION.earned.mouthShut}\\);\\n\\}`));
  // With less motion asked for: the final state, eyes open.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.arrival-pending svg\[data-character="earned"\] \[data-part="eye"\],\n  \.arrival-pending svg\[data-character="earned"\] \[data-part="mouth"\] \{\n    transform: none;\n  \}/);
  // Only a day gone back is held invisible until its turn; a day earned is held asleep by its own animation.
  assert.match(motion, /const held = drawing && step\.moment === "returned" \? \[drawing\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 1, delay: step\.delay, fill: "backwards" \}\)\] : \[\];/);
  // One after another, once: the arrival's own schedule, and what was seen is written down as it plays.
  assert.match(motion, /earned\.forEach\(\(id, index\) => days\.set\(id, \{ moment: "earned", delay: schedule\.earnedAt\[index\] \}\)\);/);
  assert.match(motion, /if \(!fromExample\) \{\n\s*list\.forEach\(\(gift, index\) => \{\n\s*writeSeen\(`\$\{storageKey\}\.\$\{gift\.id\}`, settledNow\[index\]\);/);
  assert.match(motion, /if \(reduced\(\) \|\| \(earned\.length \+ returned\.length \+ woken\.length === 0 && !amount\)\) \{/, "nothing plays under reduced motion");
});

test("what a row says: a capsule asleep is a day not open yet, the triangle awake is the day open now, and only that day is awake", () => {
  assert.equal(characterOf("today"), "today");
  assert.deepEqual((["earned", "returned", "catchable", "aboutToReturn", "toCome"] as const).map(characterOf), ["earned", "returned", "catchable", "catchable", "toCome"]);
  const draw = (state: CharacterState, wakes = false) => renderToStaticMarkup(createElement(Character, { state, standing: false, drawn: "inline", wakes }));
  // Today: two round eyes, open. A day to come: two closed pills. No sleeping triangle is drawn any more.
  assert.equal(draw("today").match(/<circle data-part="eye"/g)?.length, 2);
  assert.equal(draw("toCome").match(/<rect data-part="eye"/g)?.length, 2);
  assert.doesNotMatch(readFileSync("app/kit/Character.tsx", "utf8"), /todayAsleep/);
  assert.doesNotMatch(readFileSync("public/characters.svg", "utf8"), /todayAsleep/);
  // The day of today, written into the page, carries the capsule it was, behind the triangle, for its waking alone.
  const waking = draw("today", true);
  const was = /<g data-part="was">(.*?)<\/g><g data-part="figure"/.exec(waking)?.[1] ?? "";
  assert.ok(was.includes("<rect") && was.match(/<rect data-part="eye"/g)?.length === 2, "the capsule, with its eyes closed");
  assert.equal(draw("today").includes('data-part="was"'), false, "not without being asked");
  assert.equal(draw("earned", true).includes('data-part="was"'), false, "and only for the day of today");
  for (const file of ["app/kit/DayRow.tsx", "app/kit/DayStrip.tsx"]) {
    const row = readFileSync(file, "utf8");
    assert.match(row, /wakes=\{characterOf\((state|day)\) === "today"\}/, file);
    assert.match(row, /characterOf\((state|day)\) === "today"[^\n]*\? "inline" : "referenced"/, `${file}: written into the page, so its parts can move`);
  }
  // Out of sight outside the movement, and what is drawn while the day waits for its turn.
  assert.match(css, /\[data-character="today"\] \[data-part="was"\] \{\n  opacity: 0;\n\}/);
  assert.match(css, /\.arrival-pending svg\[data-character="today"\] \[data-part="was"\] \{\n  opacity: 1;\n\}\n\.arrival-pending svg\[data-character="today"\] \[data-part="figure"\] \{\n  opacity: 0;\n\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.arrival-pending svg\[data-character="today"\] \[data-part="was"\] \{\n    opacity: 0;\n  \}\n  \.arrival-pending svg\[data-character="today"\] \[data-part="figure"\] \{\n    opacity: 1;\n  \}/);
});

test("the waking: the capsule becomes the triangle, then the eyes open; small, with no jump and nothing that overshoots", () => {
  assert.deepEqual({ becomeMs: MOTION.wake.becomeMs, fromHeight: MOTION.wake.fromHeight }, { becomeMs: 200, fromHeight: 0.64 });
  assert.equal(MOTION.wake.eyes, SPRING.effects, "the spring that never overshoots");
  assert.notEqual(MOTION.wake.eyes, MOTION.earned.landing, "not the landing of a day earned");
  const woken = motion.slice(motion.indexOf("function playWoken"), motion.indexOf("/**\n * The gift arrives on the expressive spring"));
  assert.match(woken, /figure\.animate\(\[\{ transform: `scaleY\(\$\{fromHeight\}\)` \}, \{ transform: "scaleY\(1\)" \}\], \{ duration: becomeMs, delay, easing, fill: "backwards" \}\)/);
  assert.match(woken, /was\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{ duration: becomeMs, delay, easing: fade, fill: "backwards" \}\)/);
  assert.match(woken, /\{ offset: 0, transform: shut \},\n\s*\{ offset: becomeMs \/ total, transform: shut, easing: open\.easing \},\n\s*\{ offset: 1, transform: "none" \},/, "the eyes open once the triangle is there");
  assert.match(woken, /for \(const eye of figure\.querySelectorAll<SVGElement>\('\[data-part="eye"\]'\)\)/, "the triangle's eyes, not the capsule's");
  assert.doesNotMatch(woken, /translateY|rotate|expressive|setTimeout|setInterval|iterations/, "nothing leaves the floor, nothing turns, nothing loops");
  // Well under the jump of a day earned: shorter, and it is the day's own affair, the head of the screen does not answer it.
  const wakeMs = MOTION.wake.becomeMs + springEasing(MOTION.wake.eyes).durationMs;
  const jumpMs = MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs + springEasing(MOTION.earned.landing).durationMs;
  assert.ok(wakeMs < jumpMs, `${wakeMs} ms against ${jumpMs} ms`);
  assert.match(motion, /if \(step\.moment === "woken"\) return \(\) => running\.forEach\(\(animation\) => animation\.cancel\(\)\);/);
});

test("a day wakes when it opens: at the connection of a gift paid the same day, and on arrival when a new day opened since the last visit", () => {
  const arrival = motion.slice(motion.indexOf("export function Arrival"), motion.indexOf("/** One day of a gift inside an arrival"));
  // Which day is open, and what the last visit saw of it, kept beside the settled days.
  assert.match(motion, /const openDayOf = \(gift: ArrivalGift\) => gift\.days\.indexOf\("today"\);/);
  assert.match(arrival, /const seenOpen = useSeenMany\(gifts\.map\(\(gift\) => `\$\{storageKey\}\.open\.\$\{gift\.id\}`\)\);/);
  // Open now, and a later day than the one last seen open. A visit that kept nothing wakes nothing: a gift seen for
  // the first time simply has its day awake. A gift not started is written down as having none open, so its first
  // day wakes the moment it has one: at the connection when it is paid the same day, the next day otherwise.
  assert.match(arrival, /if \(open >= 0 && typeof sawOpen === "number" && open > sawOpen\) woken\.push\(`\$\{gift\.id\}:\$\{open\}`\);/);
  assert.match(arrival, /if \(gift\.days\.length > 0\) writeSeen\(`\$\{storageKey\}\.open\.\$\{gift\.id\}`, openNow\[index\]\);/);
  // Once, after the jumps of the days earned: when the last of them has landed.
  assert.match(arrival, /const wokenAt = earned\.length > 0 \? schedule\.earnedAt\[earned\.length - 1\] \+ ARRIVAL_TIMINGS\.earnedAirborneMs : 0;\n\s*woken\.forEach\(\(id\) => days\.set\(id, \{ moment: "woken", delay: wokenAt \}\)\);/);
  // Reduced motion: nothing plays, the day is simply awake.
  assert.match(arrival, /if \(reduced\(\) \|\| \(earned\.length \+ returned\.length \+ woken\.length === 0 && !amount\)\) \{/);
  // A gift that changes while the screen stands is decided again, and drawn in its starting state from the render
  // that brings the change: what this screen already showed is not pending again.
  assert.match(arrival, /list\.map\(\(gift, index\) => shown\[gift\.id\]\?\.settled \?\? settled\[index\]\),\n\s*list\.map\(\(gift, index\) => shown\[gift\.id\]\?\.open \?\? open\[index\]\),/);
  assert.match(arrival, /plan\.decided && plan\.about === giftsKey \? plan : \{ \.\.\.plan, decided: false, pending: changed\.pending, from: changed\.from \}/);
});
