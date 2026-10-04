import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character, type CharacterState } from "../app/kit/Character";
import { characterOf } from "../app/kit/DayStrip";
import { MOTION } from "../src/design-tokens";

// A day sleeps until it is done (the founder, 4 Oct 2026, in the place of "the days wake at the opening"). At the
// opening, the gift's own character answers, at the head of the page, and the days do not move. A day earned wakes in
// its jump, with one small turn, and the days done since the last visit play it on arrival, one after another, once.

const row = readFileSync("app/kit/DayRow.tsx", "utf8");
const motion = readFileSync("app/kit/Motion.tsx", "utf8");
const page = readFileSync("app/components/GiftPage.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("the row of a gift that has not started is asleep, opened or not, and nothing in it moves at the opening", () => {
  assert.equal("wake" in MOTION, false, "no movement of waking at the opening is left");
  assert.doesNotMatch(row, /awake|useLayoutEffect|\.animate\(|MOTION\./, "the row plays nothing of its own");
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
  assert.match(motion, /step\.moment === "earned" \? playEarned\(element, step\.delay, true\) : playReturned\(element, step\.delay\)/);
  assert.match(motion, /const jumping = playEarned\(element, 0\);/);
  // The drawing gives the turn its group, turning from its own middle, and the characters' file is made from it.
  assert.match(readFileSync("app/kit/Character.tsx", "utf8"), /\{\.\.\.\(withLimbs \|\| state === "earned" \? \{ "data-part": "whirl", style: FROM_MIDDLE \} : \{\}\)\}/);
});

test("a day done since the last visit is there from the first image, asleep, and its turn comes in the arrival's order", () => {
  // The first image: there, eyes shut and smile small, at the figures the movement starts from.
  assert.match(css, /\.arrival-pending svg\[data-character="earned"\] \{\n  opacity: 1;\n\}/);
  assert.match(css, new RegExp(`\\.arrival-pending svg\\[data-character="earned"\\] \\[data-part="eye"\\] \\{\\n  transform: scaleY\\(${MOTION.earned.eyesShut}\\);\\n\\}`));
  assert.match(css, new RegExp(`\\.arrival-pending svg\\[data-character="earned"\\] \\[data-part="mouth"\\] \\{\\n  transform: scale\\(${MOTION.earned.mouthShut}\\);\\n\\}`));
  // With less motion asked for: the final state, eyes open.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.arrival-pending svg\[data-character="earned"\] \[data-part="eye"\],\n  \.arrival-pending svg\[data-character="earned"\] \[data-part="mouth"\] \{\n    transform: none;\n  \}/);
  // Only a day gone back is held invisible until its turn; a day earned is held asleep by its own animation.
  assert.match(motion, /const held = drawing && step\.moment === "returned" \? \[drawing\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 1, delay: step\.delay, fill: "backwards" \}\)\] : \[\];/);
  // One after another, once: the arrival's own schedule, and what was seen is written down as it plays.
  assert.match(motion, /earned\.forEach\(\(id, index\) => days\.set\(id, \{ moment: "earned", delay: schedule\.earnedAt\[index\] \}\)\);/);
  assert.match(motion, /if \(!fromExample\) list\.forEach\(\(gift, index\) => writeSeen\(`\$\{storageKey\}\.\$\{gift\.id\}`, settledNow\[index\]\)\);/);
  assert.match(motion, /if \(reduced\(\) \|\| \(earned\.length \+ returned\.length === 0 && !amount\)\) \{/, "nothing plays under reduced motion");
});

test("the day of today sleeps too until it is done: it keeps its triangle, with its eyes closed, in a row of days alone", () => {
  // In a row of days, today is drawn asleep; the other states are what they were.
  assert.equal(characterOf("today"), "todayAsleep");
  assert.deepEqual((["earned", "returned", "catchable", "aboutToReturn", "toCome"] as const).map(characterOf), ["earned", "returned", "catchable", "catchable", "toCome"]);
  const draw = (state: CharacterState, variant = 0) => renderToStaticMarkup(createElement(Character, { state, variant, standing: false, drawn: "inline" }));
  const body = (markup: string) => /<g data-part="body">(.*?)<\/g>/.exec(markup)?.[1];
  const awake = draw("today");
  const asleep = draw("todayAsleep");
  // The same triangle, in the same colour: the shape is what says "today".
  assert.ok(body(asleep));
  assert.equal(body(asleep), body(awake));
  // Its eyes: two closed pills, as a day to come's, where the triangle awake has two round eyes.
  assert.equal(asleep.match(/<rect data-part="eye"/g)?.length, 2);
  assert.equal(asleep.match(/<circle data-part="eye"/g), null);
  assert.equal(awake.match(/<circle data-part="eye"/g)?.length, 2);
  assert.equal(draw("toCome").match(/<rect data-part="eye"/g)?.length, 2);
  // Three faces, as the triangle awake has, so a row never repeats one face twice in a row.
  assert.notEqual(draw("todayAsleep", 0), draw("todayAsleep", 1));
  // The triangle awake is still drawn wherever it is not a day: a goal waited for, a choice, the landing's crowd.
  assert.match(readFileSync("app/kit/HadOrNot.tsx", "utf8"), /asleep \? "toCome" : "today"/);
  assert.match(readFileSync("app/kit/MilestoneMeter.tsx", "utf8"), /return "today";/);
  assert.match(readFileSync("app/kit/YouDecide.tsx", "utf8"), /<Option character="today"/);
  // Named from the characters' file like every drawing that does not move.
  assert.match(readFileSync("public/characters.svg", "utf8"), /<symbol id="todayAsleep-0"/);
});
