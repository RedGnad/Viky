import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FAMILY_FIGURES } from "../app/kit/FamilyArt";
import { BOOK_LINES, Figure } from "../app/kit/Figure";
import { MOTION, SPRING } from "../src/design-tokens";

/**
 * Two retouches of the landing, validated by the founder on an animated mockup (10 Oct 2026), and one he asked for in
 * his own words. The one who reads its book blinks as the hero does, by one rule in one place. The app's icon arrives
 * once, as its card enters the screen. And the reader reads its book, by itself, line by line.
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

test("the one who reads its book reads it by itself: the three lines of the left page, the two of the right, then it looks up", () => {
  // The founder's mockup of 10 Oct 2026, figure for figure.
  assert.deepEqual(MOTION.reading, { left: [-3.6, -0.6], right: [0.6, 3.6], down: 1.5, perLine: 0.45, mouth: 0.35, downMs: 260, lineMs: 880, backMs: 150, pageMs: 200, upMs: 320, heldMs: 1700, fadeMs: 300, shortLine: { reach: 0.82, time: 0.86 }, lineEasing: "cubic-bezier(0.3, 0, 0.7, 1)", mark: { opacity: 0.78, width: 0.8 } });
  // It reads the book as it is drawn: the five lines are said once, and the drawing draws them from the same list.
  assert.deepEqual(BOOK_LINES.map((line) => line.page + (line.short ? " short" : "")), ["left", "left", "left short", "right", "right"]);
  const figure = readFileSync("app/kit/Figure.tsx", "utf8");
  assert.match(figure, /<path d=\{BOOK_LINES\.map\(\(line\) => line\.d\)\.join\(" "\)\} style=/);
  const drawn = renderToStaticMarkup(createElement(Figure, { id: "story-book", halftone: true, ...FAMILY_FIGURES.learn }));
  assert.ok(drawn.includes('d="M14 33.1 Q21 30.9 28.5 33.1 M14 35.8 Q21 33.6 28.5 35.8 M14 38.5 Q21 36.3 26 37.9 M35.5 33.1 Q43 30.9 50 33.1 M35.5 35.8 Q43 33.6 50 35.8"'), "the book is drawn as it was");
  // No act of the scroll any more: it plays by itself, with what lives on the landing outside the scroll.
  assert.equal("read" in MOTION.poster.acts, false);
  assert.match(story, /checked: \{ state: "book" \},/);
  assert.doesNotMatch(story.slice(story.indexOf("function usePosters"), story.indexOf("function iconArrives")), /act === "read"|data-part="gaze"/);
  assert.match(story, /for \(const drawing of story\.querySelectorAll\(`\[\$\{READS\}\]`\)\) stops\.push\(reads\(drawing\)\);/);
  // One turn written whole: each line darkens at the very moments the eyes are on it, and the mouth follows.
  assert.match(story, /steps\.push\(\{ ms: page === null \? R\.downMs : line\.page === page \? R\.backMs : R\.pageMs, to: \[start, down\], easing: page === null \? EASING\.emphasizedDecelerate : EASING\.standard \}\);/);
  assert.match(story, /steps\.push\(\{ ms: line\.short \? R\.lineMs \* R\.shortLine\.time : R\.lineMs, to: \[line\.short \? start \+ \(end - start\) \* R\.shortLine\.reach : end, down\], easing: R\.lineEasing, line: index \}\);/);
  assert.match(story, /steps\.push\(\{ ms: R\.upMs, to: \[0, 0\], easing: EASING\.emphasizedDecelerate \}, \{ ms: R\.heldMs, to: \[0, 0\], easing: "linear" \}\);/);
  assert.match(story, /following\.push\(\{ offset: time \/ turnMs, transform: at\(where\[0\] \* R\.mouth, where\[1\] \* R\.mouth\), easing: step\.easing \}\);/);
  assert.match(story, /\{ offset: read\[index\]\.from, strokeDashoffset: 1, opacity: 1, easing: R\.lineEasing \},\n\s+\{ offset: read\[index\]\.to, strokeDashoffset: 0, opacity: 1 \},\n\s+\{ offset: \(turnMs - R\.fadeMs\) \/ turnMs, strokeDashoffset: 0, opacity: 1, easing: "ease-out" \},\n\s+\{ offset: 1, strokeDashoffset: 0, opacity: 0 \},/);
  // Only in front of somebody, as the blink: on the screen, in the tab in front; nothing under reduced motion.
  assert.match(story, /const follow = \(\) => running\.forEach\(\(one\) => \(seen && !document\.hidden \? one\.play\(\) : one\.pause\(\)\)\);/);
  assert.match(story, /const story = root\.current;\n\s+if \(!story \|\| reduced\(\)\) return;/);
  assert.doesNotMatch(story.slice(story.indexOf("function reads"), story.indexOf("function useLandingAlive")), /setTimeout|setInterval/, "nothing here waits on a clock");
  // The turn, as the mockup plays it: 7.2 s, of which 1.7 s with the eyes up.
  const turn = MOTION.reading.downMs + 4 * MOTION.reading.lineMs + MOTION.reading.lineMs * MOTION.reading.shortLine.time + 3 * MOTION.reading.backMs + MOTION.reading.pageMs + MOTION.reading.upMs + MOTION.reading.heldMs;
  assert.equal(Math.round(turn), 7207);
});
