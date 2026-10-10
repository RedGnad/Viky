import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOTION, SPRING } from "../src/design-tokens";

/**
 * Two retouches of the landing, validated by the founder on an animated mockup (10 Oct 2026), and one he asked for in
 * his own words. The one who reads its book blinks as the hero does, by one rule in one place. The app's icon arrives
 * once, as its card enters the screen. And the reader's eyes go along the lines of its book as the page is scrolled.
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
  assert.match(story, /\{\.\.\.\(state === "book" \? \{ \[BLINKS\]: "" \} : \{\}\)\}/, "the reader names itself");
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

test("the one who reads its book reads it: along a line, back to the start of the next, as the page is scrolled", () => {
  assert.deepEqual(MOTION.poster.acts.read, { lines: 4, sweep: 0.9, down: 0.22, lineS: 1, backS: 0.2, backEase: "power1.inOut" });
  assert.match(story, /checked: \{ state: "book", act: "read" \},/);
  // The group that holds the two eyes is moved; the lids inside it stay the blink's.
  assert.match(story, /\} else if \(act === "read"\) \{[\s\S]{0,420}?const eyes = drawn\.querySelector\('\[data-part="gaze"\]'\);/);
  assert.match(story, /reading\.fromTo\(eyes, \{ x: -A\.read\.sweep, y: 0 \}, \{ x: A\.read\.sweep, y: 0, ease: "none", duration: A\.read\.lineS \}\);/);
  assert.match(story, /reading\.to\(eyes, \{ x: -A\.read\.sweep, y: line \* A\.read\.down, ease: A\.read\.backEase, duration: A\.read\.backS \}\)\.to\(eyes, \{ x: A\.read\.sweep, ease: "none", duration: A\.read\.lineS \}\);/);
  // Tied to the scroll like every act of a poster, and to nothing else: no reading where the posters do not move.
  assert.match(story, /const reading = gsap\.timeline\(\{ scrollTrigger: whole\(held\) \}\);/);
});
