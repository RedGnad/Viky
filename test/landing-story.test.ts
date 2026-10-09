import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { FAMILY_FIGURES } from "../app/kit/FamilyArt";
import { FaceIcon, Figure } from "../app/kit/Figure";
import { CONDITION_ICONS } from "../src/condition-icons";
import { CHOICE_GROUPS, liveConditions } from "../src/conditions";
import { MOTION } from "../src/design-tokens";
import { inRows, readByName } from "../src/landing-read";
import { MOVES, MOVES_BOOT_SCRIPT, POSTERS, POSTERS_READY, POSTERS_STILL } from "../src/moves";
import { HOME, LANDING_STORY, TRADEMARKS } from "../src/sentences";

/**
 * Under the card on the landing: five posters, the phone, and one last way to the card (the founder, 5 Oct 2026,
 * validated on a living mockup, over D282's four blocks with a drawing each; a second pass the same day, on a second
 * mockup). Each promise must stay true of the code that makes it, and the movement must leave everything there for
 * whoever cannot or will not have it.
 */
const story = readFileSync("app/kit/LandingStory.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

/** Every source file under a folder. */
function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx|mts)$/.test(name) ? [path] : [];
  });
}

test("the landing lays five posters under its column, then the phone, then the way back to the card", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  // Under the column, from one edge of the window to the other: the shell's own place for it, outside what enters and
  // what is revealed block by block.
  assert.match(home, /under=\{\n\s*<>\n\s*<LandingStory \/>\n\s*<LandingFoot \/>\n\s*<\/>\n\s*\}/);
  assert.match(readFileSync("app/kit/Shell.tsx", "utf8"), /<\/main>\n\s*\{props\.kind === "destination" && props\.under \? <div data-under-the-column="">\{props\.under\}<\/div> : null\}/);
  // The five, with the founder's sentences of the second pass under each title.
  assert.deepEqual(
    LANDING_STORY.blocks.map((block) => [block.key, block.title, ...block.lines]),
    [
      ["theirs", "Theirs from day one.", "The money is in their name the moment you pay.", "It becomes theirs to spend as they make progress."],
      ["checked", "Checked, not claimed.", "Viky reads the result where it happens.", "No screenshots. Nobody's word to take."],
      ["back", "A missed day comes back to you.", "By itself. You never have to ask.", "Nobody profits from a missed day, not even Viky."],
      // "Nothing is counted", where the mockup said "read": the card reads a public profile while a gift is prepared.
      ["yes", "They say yes first.", "Nothing is counted until they agree.", "You see the result, never the rest of their account.", "They can stop anytime and keep what they earned."],
      ["key", "You are the key.", "Your fingerprint, your face or your phone's code opens your account.", "It stays on your phone. Viky never sees it.", "No password to invent. Nothing to download."],
    ],
  );
  // Each line is one fact: a sentence of eleven words at most, three lines at most under a title.
  for (const block of LANDING_STORY.blocks) {
    assert.ok(block.lines.length >= 2 && block.lines.length <= 3, block.key);
    for (const line of block.lines) assert.ok(line.split(/\s+/).length <= 11, `${line}: ${line.split(/\s+/).length} words`);
  }
  // A character is held in each title, after a word of it: it never starts a line.
  assert.deepEqual(LANDING_STORY.blocks.map((block) => block.characterAfter), ["day", "Checked,", "day", "yes", "You"]);
  for (const block of LANDING_STORY.blocks) assert.ok(block.title.split(" ").includes(block.characterAfter), `${block.key}: after a word of its own title`);
  assert.match(
    story,
    /theirs: \{ state: "earned", act: "roll" \},\n\s*checked: \{ state: "book" \},\n\s*back: \{ state: "toCome", act: "back" \},\n\s*yes: \{ state: "today", act: "hop" \},\n\s*key: \{ state: "shades", act: "shades" \},/,
  );
  assert.match(story, /<span className="whitespace-nowrap">\n\s*\{said\} \{character\}\n\s*<\/span>/, "tied to the word before it");
  // The days' own character, with no floor under it; the one that rolls is written into the page, since a part of it turns.
  assert.match(story, /<Character state=\{state\} standing=\{false\} drawn=\{act === "roll" \? "inline" : "referenced"\} className="block h-full w-full" \/>/);
  // What is checked holds the hero with its book (the founder, 9 Oct 2026): the figure of the family that learns, whole,
  // the chooser's own, taller than a shape in its title. It lands in its word like the others and has no act.
  assert.match(story, /<Figure id="story-book" halftone \{\.\.\.FAMILY_FIGURES\.learn\} \/>/);
  assert.deepEqual(FAMILY_FIGURES.learn, { arms: "read", props: ["book"], mouth: "soft", gaze: { x: 0, y: 0.7 } });
  assert.match(story, /<span data-ch=\{act === "back" \? "back" : "lands"\} \{\.\.\.\(act \? \{ "data-act": act \} : \{\}\)\}/, "no act, no act named");
  assert.match(css, /\.poster-character-book \{\n  width: 2\.25em;\n  height: 1\.86em;\n  margin: 0 0\.1em;\n  vertical-align: -0\.5em;\n\}/);
  assert.match(story, /const BOX: Readonly<Record<string, string>> = \{ book: " poster-character-book", shades: " poster-character-wide" \};/);
  // The one in sunglasses is the head of Me's figure: the same eyes, the same mouth, the same material.
  assert.match(story, /<Figure id="story-key" limbs=\{false\} eyes="shades" mouth="grin" halftone \/>/);
  assert.match(readFileSync("app/kit/Figure.tsx", "utf8"), /return <Figure className=\{className\} id="me" eyes="shades" mouth="grin" arms="crossed" halftone \/>;/);
  // Bigger in the second pass: 1.3em tall, 2.05em wide for the diamond, 0.16em of air on each side.
  assert.match(css, /\.poster-character \{\n  display: inline-block;\n  width: 1\.3em;\n  height: 1\.3em;\n  margin: 0 0\.16em;\n  vertical-align: -0\.3em;\n\}\n\.poster-character-wide \{\n  width: 2\.05em;\n\}/);
  // A title in the hero's own size, lines under it, and nothing of the card drawn again: it appears once, at the top.
  assert.match(story, /<h2 data-poster="" className=\{`\$\{HERO\} poster-title`\}/);
  assert.doesNotMatch(story, /GiftCard|OfferCard|DayStrip/, "nothing of the card is drawn again");
  // The figures: the head in a title, the one with its book, and at the foot the two of Gifts, one with an arm on the
  // other's shoulder, where a runner and its speed lines stood (the founder, 5 Oct 2026). On the phone's card, the
  // app's icon stands where a figure waved (the founder, 9 Oct 2026), at the same place and the same width.
  assert.deepEqual(story.match(/<Figure id="[a-z-]+"/g), ['<Figure id="story-key"', '<Figure id="story-book"']);
  assert.match(story, /<FaceIcon id="story-phone" className="face-icon h-auto w-\[110px\] flex-none" \/>/);
  assert.match(story, /<div data-figure=""[^>]*>\n\s*<Scene which="gifts" className="h-auto w-full" \/>/);
  assert.doesNotMatch(story, /props=\{\["speed"\]\}|arms="run"/);
  // The phone keeps its card and its button, and the last block its way to the card.
  assert.match(story, /<Install \/>/);
  assert.match(story, /standalone \? null/);
  assert.match(story, /<a data-offer="" href="#offer"[^>]*onClick=\{goToTheCard\}/);
  assert.match(story, /<Poster title=\{W\.last\.title\} \/>/);
  assert.doesNotMatch(home, /<Install quiet \/>/);
});

test("the lines under a title: in ink, one fact each, in a block of its own", () => {
  // In the text's own colour, not the grey one; on the band that wears the other appearance, that appearance's text.
  const rule = css.slice(css.indexOf(".poster-line {"), css.indexOf("}", css.indexOf(".poster-line {")));
  assert.match(rule, /color: var\(--text\);/);
  assert.doesNotMatch(rule, /--muted/);
  assert.match(css, /\.poster-band-other \{\n  background: var\(--other-ground\);\n  color: var\(--other-text\);\n  --text: var\(--other-text\);/);
  // 18 px on 1.42 on a phone, 26 px on 1.36 from 600, weight 500, thirty em at most, balanced.
  assert.match(css, /--poster-line: 18px;\n  --poster-line-leading: 1\.42;/);
  assert.match(css, /--poster-line: 26px;\n    --poster-line-leading: 1\.36;/);
  assert.match(rule, /max-width: 30em;/);
  assert.match(rule, /font-size: var\(--poster-line\);\n  font-weight: 500;\n  line-height: var\(--poster-line-leading\);\n  text-wrap: balance;/);
  // One paragraph a line, never one paragraph for all of them.
  assert.match(story, /\{block\.lines\.map\(\(line, at\) => \(\n\s*<p key=\{line\} data-line="" className=\{`poster-line\$\{at === 0 \? " poster-line-first" : ""\}`\}>/);
  assert.doesNotMatch(story, /\bLEAD\b/);
});

test("the grounds alternate, and a band that changes ground rises with round shoulders", () => {
  assert.match(
    story,
    /theirs: \{ band: "poster-band-ground", under: "" \},\n\s*checked: \{ band: "on-paper poster-band-rises", under: "" \},\n\s*back: \{ band: "poster-band-other poster-band-rises", under: "poster-under-paper" \},\n\s*yes: \{ band: "on-paper poster-band-rises", under: "poster-under-other" \},\n\s*key: \{ band: "poster-band-ground poster-band-rises", under: "poster-under-paper" \},/,
  );
  assert.match(css, /\.poster-band-rises \{\n  border-radius: var\(--poster-round\) var\(--poster-round\) 0 0;\n\}/);
  // The mockup's room and shoulders: 84 and 40 pixels on a phone, 132 and 72 from 600.
  assert.match(css, /--poster-pad: 84px;\n  --poster-round: 40px;/);
  assert.match(css, /--poster-pad: 132px;\n    --poster-round: 72px;/);
  // The third band wears the other appearance: the night's ground and its two voices by day, the day's by night, in
  // the two places night is written. Every value is one the look already has.
  assert.match(css, /--other-ground: #151026;\n  --other-text: #FFF6E2;\n  --other-muted: #C7C4DA;/);
  assert.equal(css.match(/--other-ground: #DDD6EB;\n\s+--other-text: #1E1633;\n\s+--other-muted: #5B5470;/g)?.length, 2);
  assert.match(css, /--background: #151026;[\s\S]*?--text: #FFF6E2;\n\s+--muted: #C7C4DA;/, "the night's own ground and voices");
  assert.match(css, /--background: #DDD6EB;\n  --surface: #FFFFFF;\n  --text: #1E1633;\n  --muted: #5B5470;/, "the day's own");
});

test("what Viky reads goes by, by name: the chooser's own lines from the register, as pills with a control's outline and relief", () => {
  // The names are the register's, never a list written with the posters: one for each line of the chooser.
  const live = liveConditions();
  const lines = readByName();
  const expected = live.flatMap((option) => {
    if (!option.group) return [option.name];
    return live.find((other) => other.group?.id === option.group!.id) === option ? [CHOICE_GROUPS[option.group.id].name] : [];
  });
  assert.deepEqual(lines.map((line) => line.name), expected);
  assert.ok(lines.length >= 11, `${lines.length} names`);
  assert.doesNotMatch(story, /"A (language lesson|chess rating|year at university|race finished|test score|puzzle record)"/, "no name is written with the posters");
  assert.match(story, /const all = readByName\(\)\.map\(/);
  // A pictogram has a name here only while an open condition carries it, and every pictogram of the chooser has one.
  for (const line of lines) assert.ok(live.some((option) => option.icon === line.icon), line.name);
  assert.deepEqual([...new Set(lines.map((line) => line.icon))].sort(), Object.keys(CONDITION_ICONS).sort(), "each of the eleven pictograms");
  assert.deepEqual(readByName([]), [], "nothing open, nothing named");
  assert.match(story, /<ConditionIcon icon=\{pill\.icon\} \/>\n\s*\{pill\.name\}/, "the chooser's own drawing, then the name");
  // A pill: the outline and the relief of a control, the title's face, and a lean of three degrees at most.
  const rule = css.slice(css.indexOf(".read-pill {"), css.indexOf("}", css.indexOf(".read-pill {")));
  assert.match(rule, /border: var\(--control-border-width\) solid var\(--control-border\);/);
  assert.match(rule, /border-radius: 999px;/);
  assert.match(rule, /box-shadow: var\(--control-relief\);/);
  assert.match(rule, /font-family: var\(--font-title\);/);
  assert.match(css, /--control-border-width: 2px;/);
  const tilts = [...story.matchAll(/export const PILL_TILTS: readonly number\[\] = \[([^\]]+)\];/g)][0][1].split(",").map(Number);
  assert.ok(tilts.length > 0 && tilts.every((tilt) => Math.abs(tilt) <= 3), "three degrees at most");
  // Four tones, none of them the action's.
  const tones = [...css.matchAll(/--round-tone-[1-4]: (#[0-9A-Fa-f]{6});/g)].map((match) => match[1].toUpperCase());
  assert.equal(tones.length, 12, "four by day, and four in each of the two places night is written");
  assert.ok(!tones.includes("#FFC531"), "never the sun");
  assert.doesNotMatch(css.slice(css.indexOf(".pill-strip {"), css.indexOf("html[data-moves] [data-landing-story]")), /--accent|--sun/);
  // Two rows where the window is wide, three on a phone, and the stylesheet shows one of the two.
  assert.match(story, /\{ window: "wide", rows: 2 \},\n\s*\{ window: "narrow", rows: 3 \},/);
  assert.deepEqual(inRows(lines, 2).map((row) => row.length).reduce((sum, count) => sum + count, 0), lines.length);
  assert.equal(inRows(lines, 3).length, 3);
  assert.match(css, /\.pill-rows \{\n  display: none;/);
  assert.match(css, /\.pill-rows-narrow \{\n  display: flex;\n\}\n@media \(min-width: 600px\) \{\n  \.pill-rows-narrow \{\n    display: none;\n  \}\n  \.pill-rows-wide \{\n    display: flex;\n  \}\n\}/);
  // A row with no first name and no last: wider than any screen, and centred on its own middle.
  assert.match(css, /\.pill-row \{\n  display: flex;\n  justify-content: center;\n\}\n\.pills \{\n  display: flex;\n  flex: none;/);
  assert.match(css, /\.pill-strip \{\n  overflow: hidden;/);
  assert.match(story, /const SETS = \[0, 1, 2, 3\];/);
  // One set is read by a screen reader, as a list; the copies that make the row endless are hidden from it.
  assert.match(story, /\{\.\.\.\(set === 0 \? \{ role: "listitem" \} : \{ "aria-hidden": true \}\)\}/);
  assert.match(story, /role="list" aria-label=\{W\.read\}/);
  assert.equal(LANDING_STORY.read, "What Viky reads");
});

test("the movement: the first image is the starting state, and without it everything is there", () => {
  const P = MOTION.poster;
  // The founder's values, in the tokens and nowhere else.
  assert.equal(P.startAt, 0.8);
  assert.deepEqual({ stagger: P.word.staggerMs, rise: P.word.riseMs, ease: P.word.ease, fade: P.word.fadeMs }, { stagger: 70, rise: 650, ease: "back.out(1.8)", fade: 200 });
  assert.deepEqual({ land: P.character.landMs, ease: P.character.ease }, { land: 800, ease: "elastic.out(1, 0.5)" });
  // The lines arrive one after the other, 160 ms apart, after the title.
  assert.deepEqual({ ms: P.line.ms, stagger: P.line.staggerMs, rise: P.line.rise }, { ms: 400, stagger: 160, rise: 14 });
  assert.deepEqual(P.drift, { px: 160, catchUpS: 0.5 });
  const moving = story.slice(story.indexOf("function usePosters("), story.indexOf("export function LandingStory()"));
  assert.doesNotMatch(moving, /duration: \d|stagger: \d|scrub: \d|ease: "(?!none")|transformOrigin: "/, "no value written in the component");
  assert.match(moving, /start: `clamp\(top \$\{P\.startAt \* 100\}%\)`, once: true/);
  assert.match(moving, /scale: 0, rotate: P\.character\.fromTurn \}, \{ scale: 1, rotate: 0, duration: seconds\(P\.character\.landMs\), ease: P\.character\.ease \}/);
  assert.match(moving, /play\.fromTo\(lines, \{ opacity: 0, y: P\.line\.rise \}, \{ opacity: 1, y: 0, duration: seconds\(P\.line\.ms\), stagger: seconds\(P\.line\.staggerMs\), ease: P\.line\.ease \}/);
  // Tied to the scroll, never to a clock, and the scroll itself is never touched: the rows drift opposite ways.
  assert.match(moving, /const from = pills\.dataset\.pills === "one-way" \? P\.drift\.px : -P\.drift\.px;\n\s*gsap\.fromTo\(pills, \{ x: from \}, \{ x: -from, ease: "none", scrollTrigger: \{[^}]*scrub: P\.drift\.catchUpS \} \}\)/);
  assert.match(story, /data-pills=\{at % 2 === 0 \? "one-way" : "the-other"\}/);
  assert.doesNotMatch(story, /ScrollSmoother|normalizeScroll|snap:|pin:|scrollTo|setInterval|requestAnimationFrame/);
  // The library is never told to measure again at once: only the way that waits for a scroll under way to end.
  assert.doesNotMatch(story, /ScrollTrigger\.refresh\(\)/);
  assert.match(story, /ScrollTrigger\.refresh\(true\)/);
  // The starting state is drawn by the stylesheet, where the document says movement is welcome and a script runs.
  assert.equal(MOVES, "data-moves");
  assert.match(css, /html\[data-moves\] \[data-landing-story\]:not\(\[data-still\]\) \[data-band\] :is\(\[data-w\], \[data-ch\], \[data-line\], \[data-strip\], \[data-figure\], \[data-offer\]\) \{\n  opacity: 0;\n\}/);
  assert.equal([POSTERS, POSTERS_READY, POSTERS_STILL].join(" "), "data-landing-story data-posters data-still");
  // Said in the document's head, before anything is drawn; not at all on a device that asks for less movement; and
  // posters whose script never came are shown, still.
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.ok(layout.indexOf("MOVES_BOOT_SCRIPT }} />") > layout.indexOf("<head>") && layout.indexOf("MOVES_BOOT_SCRIPT }} />") < layout.indexOf("</head>"));
  assert.match(MOVES_BOOT_SCRIPT, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\)\)\{d\.setAttribute\("data-moves",""\)/);
  assert.match(MOVES_BOOT_SCRIPT, new RegExp(`if\\(s&&!s\\.hasAttribute\\("data-posters"\\)\\)s\\.setAttribute\\("data-still",""\\)\\},${P.giveUpMs}\\)`));
  assert.match(moving, /if \(!story \|\| reduced\(\) \|\| !document\.documentElement\.hasAttribute\(MOVES\) \|\| story\.hasAttribute\(POSTERS_STILL\)\) return;/);
  assert.match(moving, /\}, still\);/, "a library that does not load leaves the posters shown, still");
  assert.match(moving, /const giveUp = window\.setTimeout\(still, P\.giveUpMs\);/);
});

test("each character's act is tied to the scroll, with the mockup's values, and plays backwards when the page is scrolled back", () => {
  const A = MOTION.poster.acts;
  // The values of the living mockup, in the tokens.
  assert.equal(A.catchUpS, 0.35);
  assert.deepEqual({ turn: A.roll.turn, shift: A.roll.shift }, { turn: 270, shift: "0.3em" }, "the day earned rolls a turn and a half");
  assert.deepEqual({ times: A.hop.times, height: A.hop.height, squash: A.hop.squash }, { times: 3, height: "-0.5em", squash: { x: 1.12, y: 0.82 } }, "today hops three times and squashes where it lands");
  assert.deepEqual({ from: A.back.from, homeAt: A.back.homeAt }, { from: "4.4em", homeAt: 0.48 }, "the day missed comes back from the right, and is home by mid screen");
  assert.equal("nod" in A, false, "the yes hops since 9 Oct 2026: no character nods, and no act is kept that none plays");
  assert.deepEqual({ drop: A.shades.drop, onAt: A.shades.onAt }, { drop: -15, onAt: 0.46 }, "the sunglasses come down as the title reaches mid screen");
  const moving = story.slice(story.indexOf("function usePosters("), story.indexOf("export function LandingStory()"));
  // Tied to the scroll: every act is scrubbed, none has a clock, and none is played once.
  const acts = moving.slice(moving.indexOf("const A = P.acts;"), moving.indexOf("story.setAttribute(POSTERS_READY, \"playing\")"));
  assert.match(acts, /const whole = \(held: Element\) => \(\{ trigger: held, start: "top bottom", end: "bottom top", scrub: A\.catchUpS \}\);/);
  assert.equal(acts.match(/scrub: A\.catchUpS/g)?.length, 3, "the whole pass, the way back and the sunglasses");
  assert.doesNotMatch(acts, /once: true|delay:/);
  for (const act of ["roll", "hop", "back", "shades"]) assert.match(acts, new RegExp(`act === "${act}"`), act);
  assert.doesNotMatch(acts, /act === "nod"/);
  // The day earned rolls, and its highlight does not turn with it (the founder, 9 Oct 2026): the scroll moves the drawing
  // and says how far it has turned, the stylesheet turns the group that holds its body and its face, and the highlight
  // is drawn outside that group.
  assert.match(acts, /gsap\.fromTo\(drawn, \{ x: `-\$\{A\.roll\.shift\}`, \[TURN\]: `\$\{-A\.roll\.turn\}deg` \}, \{ x: A\.roll\.shift, \[TURN\]: `\$\{A\.roll\.turn\}deg`, ease: "none", scrollTrigger: whole\(held\) \}\);/);
  assert.match(story, /const TURN = "--poster-turn";/);
  assert.match(css, /\.poster-character \[data-part="whirl"\] \{\n  transform: rotate\(var\(--poster-turn, 0deg\)\);\n\}/);
  const ball = renderToStaticMarkup(createElement(Character, { state: "earned", standing: false, drawn: "inline" }));
  const turns = ball.slice(ball.indexOf('<g data-part="whirl"'), ball.indexOf('<g data-part="gloss"'));
  assert.ok(turns.includes('data-part="body"') && turns.includes('data-part="face"'), "the body and the face turn");
  assert.ok(turns.endsWith("</g></g></g>"), "and the group that turns is closed before the highlight is drawn");
  assert.match(ball, /<g data-part="gloss"[^>]*><circle[^>]*><\/circle><circle[^>]*><\/circle><\/g><\/g><\/svg>$/, "the highlight, last in what jumps, outside what turns");
  // Every other shape keeps its highlight under its face: none of them turns on itself.
  for (const state of ["toCome", "today", "catchable", "returned"] as const) {
    const other = renderToStaticMarkup(createElement(Character, { state, standing: false, drawn: "inline" }));
    assert.ok(other.indexOf('data-part="gloss"') < other.indexOf('data-part="face"'), state);
  }
  assert.match(acts, /\{ x: A\.back\.from, rotate: A\.back\.fromTurn, opacity: 0 \},\n\s*\{ x: 0, rotate: 0, opacity: 1, ease: A\.back\.ease/);
  assert.match(acts, /const shades = drawn\.querySelector\('\[data-prop="shades"\]'\);/);
  assert.match(readFileSync("app/kit/Figure.tsx", "utf8"), /<g data-part="eyes" data-prop="shades"/);
  // The face has its eyes under the sunglasses: while they are not down yet it is not a face with none (the founder,
  // 5 Oct 2026). Each eye is at the centre of its lens and smaller than it, so the sunglasses cover both whole.
  const figure = readFileSync("app/kit/Figure.tsx", "utf8");
  assert.match(figure, /if \(eyes === "shades"\) \{[\s\S]{0,700}<g data-part="under-shades">\n\s*\{at\.map\(\(\[x, y\]\) => \(\n\s*<circle key=\{x\} cx=\{x\} cy=\{y\} r=\{EYE_R\} style=\{\{ fill: INK \}\} \/>\n\s*\)\)\}\n\s*<\/g>\n\s*<Shades id=\{id\} \/>/);
  assert.match(figure, /const EYES_AT: readonly \(readonly \[number, number\]\)\[\] = \[\n  \[26, 18\],\n  \[38, 18\],\n\];\nconst EYE_R = 2\.8;/);
  assert.match(figure, /\{\[26, 38\]\.map\(\(x\) => \(\n\s*<rect key=\{x\} x=\{x - 5\.2\} y=\{14\.1\} width=\{10\.4\} height=\{7\.8\} rx=\{3\.2\}/, "a lens centred on each eye, wider and taller than it");
  // The day that was missed does not land with the others: the scroll brings it.
  assert.match(moving, /if \(one\.dataset\.ch === "back"\) \{\n[^\n]*\n\s*play\.set\(one, \{ opacity: 1 \}, 0\);/);
  // None of it where less movement is asked for: the posters' script does not run at all there.
  assert.match(moving, /if \(!story \|\| reduced\(\)/);
  // And on paper everything is at rest, what an act had moved included.
  assert.match(css, /:is\(\[data-w\], \[data-ch\], \[data-ch\] svg, \[data-ch\] \[data-prop\], \[data-ch\] \[data-part="whirl"\], \[data-line\], \[data-strip\], \[data-pills\], \[data-figure\], \[data-offer\]\) \{\n    opacity: 1 !important;\n    transform: none !important;/);
});

test("the phone's card shows the app's icon, made of the figure's own pieces, one image by day and by night", () => {
  const icon = renderToStaticMarkup(createElement(FaceIcon, { id: "story-phone" }));
  const figure = renderToStaticMarkup(createElement(Figure, { id: "story-phone", limbs: false, mouth: "soft", halftone: true }));
  const part = (html: string, from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)) + to.length);
  // A square of forty units around the face, rounded as a phone rounds an icon: 22.4 % of its side.
  assert.match(icon, /^<svg aria-hidden="true" focusable="false" viewBox="12 1\.5 40 40" data-character="icon">/);
  assert.match(icon, /<clipPath id="story-phone-clip"><rect x="12" y="1\.5" width="40" height="40" rx="8\.96"><\/rect><\/clipPath>/);
  assert.equal(Math.round(40 * 0.224 * 100) / 100, 8.96);
  assert.match(icon, /<g clip-path="url\(#story-phone-clip\)"><rect x="12" y="1\.5" width="40" height="40" style="fill:url\(#story-phone-body\)"><\/rect>/);
  // The hero's blend, its gloss and its face are the figure's own, letter for letter.
  assert.equal(part(icon, "<linearGradient", "</linearGradient>"), part(figure, "<linearGradient", "</linearGradient>"), "the blend");
  assert.equal(part(icon, '<g data-part="gloss">', "</g>"), part(figure, '<g data-part="gloss">', "</g>"), "the gloss");
  assert.match(icon, /<g data-part="face" transform="translate\(32 21\.23\) scale\(1\.25\) translate\(-32 -21\.23\)">/, "a quarter larger");
  assert.ok(icon.includes(part(figure, '<g data-part="eyes"', "</g></g></g>")), "the eyes");
  assert.ok(icon.includes(part(figure, '<g data-part="mouth"', "</g>")), "the soft mouth");
  // The dots: the body's rule, its eight sizes, its colour and its grid, laid over the whole square.
  const dots = (html: string) => [...part(html, '<g data-part="halftone">', "</g>").matchAll(/<path d="([^"]*)" style="([^"]*)"/g)].map((match) => ({ at: [...match[1].matchAll(/M(-?[\d.]+) (-?[\d.]+)h0/g)].map((dot) => [Number(dot[1]), Number(dot[2])]), style: match[2] }));
  const [onIcon, onBody] = [dots(icon), dots(figure)];
  assert.deepEqual(onIcon.map((size) => size.style), onBody.map((size) => size.style), "eight sizes, the same strokes");
  assert.equal(onIcon.length, 8);
  const all = onIcon.flatMap((size) => size.at);
  for (const [x, y] of [[13, 2.5], [51, 2.5], [13, 40.5], [51, 40.5], [32, 21.5]]) {
    assert.ok(all.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 1.2), `a dot by (${x}, ${y})`);
  }
  // Where the body has a dot inside the square, the icon has the same one, of the same size: one grid, one rule.
  onBody.forEach((size, index) => {
    for (const [x, y] of size.at.filter(([dx]) => dx >= 12 && dx <= 52)) assert.ok(onIcon[index].at.some(([dx, dy]) => dx === x && dy === y), `size ${index}: (${x}, ${y})`);
  });
  // One image whatever the hour: the five colours it is drawn in are the day's own, said again on the icon.
  const day = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const rule = css.slice(css.indexOf(".face-icon {"), css.indexOf("}", css.indexOf(".face-icon {")));
  for (const name of ["--character-hero-from", "--character-hero-to", "--character-halftone", "--character-gloss", "--character-face"]) {
    const said = new RegExp(`${name}: ([^;]+);`);
    assert.ok(said.exec(rule)?.[1], name);
    assert.equal(said.exec(rule)?.[1], said.exec(day)?.[1], `${name} is the day's`);
  }
  for (const name of [...icon.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1])) assert.ok(rule.includes(`${name}:`), `${name} is said on the icon`);
  assert.equal(css.match(/\.face-icon \{/g)?.length, 1, "said once, for day and night alike");
});

test("no shape carries a shade under its face any more", () => {
  // The founder, 9 Oct 2026, on the five shapes drawn with and without it: the small pill of ink at each one's foot goes,
  // from the drawings, from the file every named character is read from, and from the look.
  assert.doesNotMatch(readFileSync("app/kit/Character.tsx", "utf8"), /data-part="shade"|<Shade|shade:/);
  const file = readFileSync("public/characters.svg", "utf8");
  assert.equal((file.match(/<symbol /g) ?? []).length, 32);
  assert.doesNotMatch(file, /shade/);
  assert.doesNotMatch(css, /--character-shade/);
  for (const state of ["toCome", "today", "catchable", "earned", "returned", "gift"] as const) {
    assert.doesNotMatch(renderToStaticMarkup(createElement(Character, { state, drawn: "inline" })), /shade/, state);
  }
});

test("gsap is loaded by the landing alone, and its licence is said for what it is", () => {
  const importers = [...sources("app"), ...sources("src")].filter((path) => /from "gsap|import\("gsap/.test(readFileSync(path, "utf8")));
  assert.deepEqual(importers, ["app/kit/LandingStory.tsx"]);
  assert.match(story, /Promise\.all\(\[import\("gsap"\), import\("gsap\/ScrollTrigger"\)\]\)/, "loaded when the posters are, never with the rest of the app");
  assert.ok((JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> }).dependencies.gsap);
  const readme = readFileSync("README.md", "utf8");
  const fold = readme.indexOf("<summary><b>Third-party licences</b></summary>");
  assert.ok(fold >= 0, "the licences are a fold at the README's foot");
  const licences = readme.slice(fold, readme.indexOf("</details>", fold));
  assert.match(licences, /`gsap` and its `ScrollTrigger` are not under a free licence/);
  assert.match(licences, /Standard 'No Charge' GSAP\s+License/);
  assert.match(licences, /forbids using GSAP in a tool\s+that lets its users build visual animations without code in competition with Webflow's own/);
});

test("the foot of the landing: the one way to what Viky can check, who it is not affiliated with, and what ETS asks", () => {
  // The button in the middle of the story is gone: the foot's link is the one way there.
  assert.equal(story.match(/href="\/what-viky-can-check"/g)?.length, 1);
  const foot = story.slice(story.indexOf("export function LandingFoot()"));
  assert.ok(foot.includes('href="/what-viky-can-check"'));
  assert.equal(LANDING_STORY.notAffiliated, "Not affiliated with the schools, races or services named.");
  assert.ok(foot.indexOf("{W.notAffiliated}") < foot.indexOf("<MarkNotice"), "and the mark's notice under it");
  // The sentence that goes by lost its small print: its first sentence said the poster again.
  assert.equal("read" in HOME.waitsFor, false);
  assert.doesNotMatch(readFileSync("app/kit/GoalsGoingBy.tsx", "utf8"), /data-card-note|waitsFor\.read/);
  // What the way to the card keeps under the screen is now the first poster.
  assert.match(story, /firstUnderTheCard \? \{ \[CARD_NOTE\]: "" \} : \{\}/);
  // ETS's notice, word for word, at the bottom of every page that names the TOEFL.
  assert.equal(TRADEMARKS.ets.notice, "TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS.");
  for (const page of ["app/legal/page.tsx", "app/judges/page.tsx", "app/what-viky-can-check/page.tsx"]) assert.match(readFileSync(page, "utf8"), /<MarkNotice \/>\n\s*<\/Shell>/, page);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /<MarkNotice naming=\{\[condition\?\.name\]\} \/>\n\s*<\/Shell>/);
  assert.match(readFileSync("app/kit/Gifts.tsx", "utf8"), /<MarkNotice naming=\{\[\.\.\.given, \.\.\.received\]\.map\(conditionNameOf\)\} \/>/);
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /<MarkNotice naming=\{moving\.map\(conditionNameOf\)\} \/>/);
  assert.match(readFileSync("app/kit/offer/WillSheet.tsx", "utf8"), /<MarkNotice naming=\{lines\(shownSection\.conditions\)\.map\(\(line\) => line\.name\)\} \/>/);
  // Every page whose own source names it carries the notice.
  for (const path of sources("app").filter((one) => /page\.tsx$/.test(one))) {
    const page = readFileSync(path, "utf8");
    if (/TOEFL/.test(page)) assert.match(page, /<MarkNotice/, `${path} names the TOEFL`);
  }
});

test("a block under the screen waits at its starting state and enters once a quarter of it is in", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  const waits = motion.slice(motion.indexOf("function waitUnderTheScreen("), motion.indexOf("export function useRevealOnScroll("));
  // Made to wait before the browser paints, and only where it will be played: movement welcome, an observer to say when.
  assert.match(waits, /if \(reduced\(\) \|\| typeof IntersectionObserver === "undefined"\) return \(\) => \{\};/);
  assert.match(waits, /blocks\.filter\(\(block\) => !block\.hasAttribute\(WAITS\) && block\.getBoundingClientRect\(\)\.top >= screen\)/, "only a block wholly under the screen");
  assert.match(motion, /useLayoutEffect\(\(\) => \(root\.current \? waitUnderTheScreen\(\[root\.current\]\) : undefined\), \[\]\);/);
  assert.match(motion, /export function useRevealOnScroll\(main: RefObject<HTMLElement \| null>\): void \{\n  useLayoutEffect\(\(\) => \{/);
  // A quarter of it, or of the screen for a block taller than the screen.
  assert.match(waits, /const quarter = Math\.floor\(Math\.min\(block\.getBoundingClientRect\(\)\.height, screen\) \/ 4\);/);
  assert.match(waits, /\{ rootMargin: `0px 0px -\$\{quarter\}px 0px` \}/);
  // The entrance starts from the state the stylesheet drew just before it, and plays once.
  assert.match(waits, /block\.animate\(\[\{ opacity: 0, transform: `translateY\(\$\{rise\}px\)` \}, \{ opacity: 1, transform: "translateY\(0\)" \}\], \{ duration: durationMs, easing \}\);\n\s*block\.removeAttribute\(WAITS\);/);
  assert.match(waits, /observer\.disconnect\(\);\n\s*const \{ durationMs, easing, rise \} = MOTION\.reveal;/);
  assert.match(css, /\[data-waits\] \{\n  opacity: 0;\n  transform: translateY\(var\(--page-enter-rise\)\);\n\}/);
  assert.match(css, new RegExp(`--page-enter-rise: ${MOTION.reveal.rise}px;`));
  assert.match(css, /@media \(prefers-reduced-motion: reduce\), print \{\n  \[data-waits\] \{\n    opacity: 1;\n    transform: none;\n  \}\n\}/);
  // The old form is gone: a block drawn finished, then put back to nothing as its first pixel came in.
  assert.doesNotMatch(motion, /entry\.isIntersecting\) observer\.unobserve\(block\);\n\s*continue;/);
});

test("a missed day goes back to the funder: the create routes send the refund to the account that pays, and nowhere else", () => {
  for (const route of ["app/api/gift/milestone/create/route.ts", "app/api/gift/certificate/create/route.ts"]) {
    assert.match(readFileSync(route, "utf8"), /const refundTo = refundDestination\(body\.refundTo, auth\.account\);/);
  }
  const screens = ["app/kit/offer/PaySheet.tsx", "app/kit/offer/OfferCard.tsx"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(screens, /refundTo/);
});

test("no promise uses a word the person must never see, and none claims what Viky must not say", () => {
  const all = JSON.stringify(LANDING_STORY).toLowerCase();
  for (const word of ["wallet", "gas", "chain", "seed", "token", "transaction", "address", "cheaper", "nobody does", "licence"]) {
    assert.ok(!all.includes(word), word);
  }
});
