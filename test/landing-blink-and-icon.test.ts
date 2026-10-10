import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FAMILY_FIGURES } from "../app/kit/FamilyArt";
import { Figure } from "../app/kit/Figure";
import { MOTION, SPRING } from "../src/design-tokens";

/**
 * Two retouches of the landing, validated by the founder on an animated mockup (10 Oct 2026), and one he asked for in
 * his own words. The one who reads its book blinks as the hero does, by one rule in one place. The app's icon arrives
 * once, as its card enters the screen. And the reader reads its book, by itself, calmly: his word on the page, later
 * that day, after a first turn that was too fast and too wide.
 */
const clock = readFileSync("app/kit/blink-clock.ts", "utf8");
const story = readFileSync("app/kit/LandingStory.tsx", "utf8");
const hero = readFileSync("app/kit/HeroMoment.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("one clock for every blink now and then: the drawings in view blink together, never sooner than 2.8 s", () => {
  assert.deepEqual(MOTION.blink, { durationMs: 150, themeDurationMs: 250, easing: MOTION.blink.easing, closedTo: 0.1, fromMs: 2800, toMs: 6500 });
  // One timer, in the file that already keeps when the last blink was.
  assert.equal(clock.split("window.setTimeout(").length - 1, 1, "one clock");
  assert.match(clock, /const inView = \[\.\.\.blinking\]\.filter\(\(one\) => one\.seen && now >= one\.standsAt\);/, "only what is on the screen and standing");
  assert.match(clock, /noteBlink\(now\);\n\s+for \(const one of inView\) blinkOnce\(one\.drawing\);/, "together");
  assert.match(clock, /if \(typeof window === "undefined" \|\| window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return \(\) => \{\};/, "nothing under reduced motion");
  assert.match(clock, /if \(blinking\.size === 0 && clock !== undefined\) \{\n\s+window\.clearTimeout\(clock\);/, "and no clock left running with nobody to blink");
  // The three drawings: the hero, the one who reads, the icon. No other file keeps a blink of its own.
  assert.match(hero, /blinksNowAndThen\(stage, /);
  assert.match(story, /\{\.\.\.\(state === "book" \? \{ \[BLINKS\]: "", \[READS\]: "" \} : \{\}\)\}/, "the reader names itself");
  assert.match(story, /const stops = \[\.\.\.story\.querySelectorAll\(`\[\$\{BLINKS\}\]`\)\]\.map\(\(drawing\) => blinksNowAndThen\(drawing\)\);/);
  assert.match(story, /stops\.push\(blinksNowAndThen\(icon, MOTION\.icon\.restMs\)\);/, "the icon, once it has arrived");
  assert.doesNotMatch(hero + story, /setTimeout\([^)]*[bB]link/);
});

test("the icon arrives once as its card enters the screen, by the mockup's own figures", () => {
  assert.deepEqual(MOTION.icon, { fromScale: 0.82, spring: SPRING.expressiveFastSpatial, fadeMs: 120, faceAfterMs: 90, faceDrop: 1.2, blinkAtMs: 480, glanceAtMs: 760, glance: { by: 1.1, durationMs: 1000, thereAt: 0.22, backFrom: 0.74 }, restMs: 1800, inView: 0.6 });
  // It lands: size on the spring, opacity without overshoot.
  assert.match(story, /icon\.animate\(\[\{ transform: `scale\(\$\{I\.fromScale\}\)` \}, \{ transform: "scale\(1\)" \}\], \{ duration: pop\.durationMs, easing: pop\.easing, fill: "backwards" \}\),/);
  assert.match(story, /icon\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: I\.fadeMs, easing: EASING\.standard, fill: "backwards" \}\),/);
  // The face after the body: the eyes and the mouth, never the group that carries the face's own size.
  assert.match(story, /for \(const name of \["eyes", "mouth"\]\) \{/);
  assert.match(story, /delay: I\.faceAfterMs, easing: pop\.easing, fill: "backwards" \}\)\);/);
  assert.doesNotMatch(story, /querySelector\('\[data-part="face"\]'\)/);
  // One blink, and a glance at its button wherever the button stands.
  assert.match(story, /noteBlink\(performance\.now\(\) \+ I\.blinkAtMs\);\n\s+blinkOnce\(icon, I\.blinkAtMs\);/);
  assert.match(story, /const far = Math\.hypot\(dx, dy\) \|\| 1;/);
  assert.match(story, /\{ duration: I\.glance\.durationMs, delay: I\.glanceAtMs \},/);
  // Tied to no position of the scroll: started once by the card coming in, never by the posters' script.
  assert.match(story, /watch\?\.disconnect\(\);\n\s+running = iconArrives\(icon\);\n\s+icon\.removeAttribute\(ARRIVES\);/);
  assert.match(story, /\{ threshold: MOTION\.icon\.inView \},/);
  const posters = story.slice(story.indexOf("function usePosters"), story.indexOf("function iconArrives"));
  assert.doesNotMatch(posters, /data-character="icon"|ICON\b/);
  // Under the screen it waits at its starting state, set before the first image; in view, or with less motion, it is simply there.
  assert.match(story, /useLayoutEffect\(\(\) => \{\n\s+const icon = root\.current\?\.querySelector<SVGSVGElement>\(ICON\);\n\s+if \(!icon \|\| reduced\(\) \|\| icon\.getBoundingClientRect\(\)\.top < window\.innerHeight\) return;\n\s+icon\.setAttribute\(ARRIVES, ""\);/);
  assert.match(css, /\.face-icon\[data-arrives\] \{\n  opacity: 0;\n\}/);
  assert.doesNotMatch(readFileSync("app/kit/Figure.tsx", "utf8"), /Nothing moves it/, "the drawing's own note says what moves it now");
});

test("the one who reads its book reads it calmly: its eyes go down, drift along three lines, and come up, and the book is not touched", () => {
  // The founder, 10 Oct 2026, on the page itself: the first turn was too fast and too wide, reading the left page then
  // the right was odd, and the lines darkening looked cheap. The figures are set to his word.
  const R = MOTION.reading;
  assert.deepEqual(R, { across: [-1, 1], down: 1.1, perLine: 0.25, lines: 3, mouth: 0.25, downMs: 600, lineMs: 1900, backMs: 600, upMs: 700, heldMs: 2600, easing: "cubic-bezier(0.3, 0, 0.7, 1)" });
  // Small: to either side the eyes go no further than the icon's glance, and as far to the left as to the right, so
  // no page is read before the other. The first turn went 3.6 units to either side.
  assert.ok(Math.max(...R.across.map(Math.abs)) <= MOTION.icon.glance.by);
  assert.equal(R.across[0], -R.across[1]);
  // Slow: a line takes about two seconds where it took 880 ms, and the way back four times the 150 ms it took.
  assert.ok(R.lineMs >= 2 * 880 && R.backMs >= 4 * 150);
  const turn = R.downMs + R.lines * R.lineMs + (R.lines - 1) * R.backMs + R.upMs + R.heldMs;
  assert.equal(turn, 10_800);
  // The book is drawn as it was, in one stroke, and nothing of the reading is in the drawing's file.
  const figure = readFileSync("app/kit/Figure.tsx", "utf8");
  assert.doesNotMatch(figure, /BOOK_LINES|READ_INK/);
  const drawn = renderToStaticMarkup(createElement(Figure, { id: "story-book", halftone: true, ...FAMILY_FIGURES.learn }));
  assert.ok(drawn.includes('d="M14 33.1 Q21 30.9 28.5 33.1 M14 35.8 Q21 33.6 28.5 35.8 M14 38.5 Q21 36.3 26 37.9 M35.5 33.1 Q43 30.9 50 33.1 M35.5 35.8 Q43 33.6 50 35.8"'), "the book is drawn as it was");
  // No act of the scroll: it plays by itself, with what lives on the landing outside the scroll.
  assert.equal("read" in MOTION.poster.acts, false);
  assert.match(story, /checked: \{ state: "book" \},/);
  assert.doesNotMatch(story.slice(story.indexOf("function usePosters"), story.indexOf("function iconArrives")), /act === "read"|data-part="gaze"/);
  assert.match(story, /for \(const drawing of story\.querySelectorAll\(`\[\$\{READS\}\]`\)\) stops\.push\(reads\(drawing\)\);/);
  // One turn written whole: down to a line, along it, back to the start of the next, then up, and held.
  const reading = story.slice(story.indexOf("function reads"), story.indexOf("function useLandingAlive"));
  assert.match(reading, /steps\.push\(\{ ms: line === 0 \? R\.downMs : R\.backMs, to: \[left, down\] \}, \{ ms: R\.lineMs, to: \[right, down\] \}\);/);
  assert.match(reading, /steps\.push\(\{ ms: R\.upMs, to: \[0, 0\] \}, \{ ms: R\.heldMs, to: \[0, 0\] \}\);/);
  assert.match(reading, /following\.push\(\{ offset: time \/ turnMs, transform: at\(where\[0\] \* R\.mouth, where\[1\] \* R\.mouth\), easing: R\.easing \}\);/);
  // Two animations and no more: the eyes and the mouth. Nothing is added to the book, and nothing is drawn over it.
  assert.match(reading, /running = \[eyes\.animate\(looking, turning\), \.\.\.\(mouth \? \[mouth\.animate\(following, turning\)\] : \[\]\)\];/);
  assert.doesNotMatch(reading, /createElementNS|appendChild|strokeDash|data-prop="book"|data-part", "read"/);
  // Only in front of somebody, as the blink: on the screen, in the tab in front; nothing under reduced motion. Off
  // the screen no animation of it is left on the page: a screen that waits for every movement to end
  // (test/browser/arrival.spec.ts) must find none. Behind another tab it is held where it is.
  assert.match(reading, /const follow = \(\) => \{\n\s+if \(!seen\) return end\(\);\n\s+begin\(\);\n\s+running\.forEach\(\(one\) => \(document\.hidden \? one\.pause\(\) : one\.play\(\)\)\);/);
  assert.match(reading, /const end = \(\) => \{\n\s+running\.forEach\(\(one\) => one\.cancel\(\)\);\n\s+running = \[\];\n\s+\};/);
  assert.doesNotMatch(story, /var\(--character-/);
  assert.match(story, /const story = root\.current;\n\s+if \(!story \|\| reduced\(\)\) return;/);
  assert.doesNotMatch(reading, /setTimeout|setInterval/, "nothing here waits on a clock");
});
