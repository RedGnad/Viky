import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CONDITION_ICONS } from "../src/condition-icons";
import { MOTION } from "../src/design-tokens";
import { MOVES, MOVES_BOOT_SCRIPT, POSTERS, POSTERS_READY, POSTERS_STILL } from "../src/moves";
import { HOME, LANDING_STORY, TRADEMARKS } from "../src/sentences";

/**
 * Under the card on the landing: four posters, the phone, and one last way to the card (the founder, 5 Oct 2026,
 * validated on a living mockup, over D282's four blocks with a drawing each). Each promise must stay true of the code
 * that makes it, and the movement must leave everything there for whoever cannot or will not have it.
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

test("the landing lays four posters under its column, then the phone, then the way back to the card", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  // Under the column, from one edge of the window to the other: the shell's own place for it, outside what enters and
  // what is revealed block by block.
  assert.match(home, /under=\{\n\s*<>\n\s*<LandingStory \/>\n\s*<LandingFoot \/>\n\s*<\/>\n\s*\}/);
  assert.match(readFileSync("app/kit/Shell.tsx", "utf8"), /<\/main>\n\s*\{props\.kind === "destination" && props\.under \? <div data-under-the-column="">\{props\.under\}<\/div> : null\}/);
  // The four, with the founder's sentences, one under each title.
  assert.deepEqual(
    LANDING_STORY.blocks.map((block) => [block.key, block.title, block.body]),
    [
      ["theirs", "Theirs from day one.", "The money is in their name the moment you pay."],
      ["checked", "Checked, not claimed.", "Viky reads it where it happens. Nobody's word to take."],
      ["back", "A missed day comes back to you.", "By itself. Viky keeps none of it."],
      ["face", "Your face is the key.", "No password to invent. Nothing to download."],
    ],
  );
  // A character is held in each title, after a word of it that is not its first: it never starts a line.
  assert.deepEqual(LANDING_STORY.blocks.map((block) => block.characterAfter), ["day", "Checked,", "day", "face"]);
  for (const block of LANDING_STORY.blocks) assert.ok(block.title.split(" ").includes(block.characterAfter), `${block.key}: after a word of its own title`);
  assert.match(story, /theirs: \{ state: "earned" \},\n\s*checked: \{ state: "today" \},\n\s*back: \{ state: "toCome", returns: true \},\n\s*face: \{ state: "diamond" \},/);
  assert.match(story, /<span className="whitespace-nowrap">\n\s*\{said\} \{character\}\n\s*<\/span>/, "tied to the word before it");
  assert.match(story, /<Character state=\{state\} standing=\{false\} className="block h-full w-full" \/>/, "the days' own character, with no floor under it");
  // A title in the hero's own size, one sentence, and nothing drawn beside: the card appears once, at the top.
  assert.match(story, /<h2 data-poster="" className=\{`\$\{HERO\} poster-title`\}/);
  assert.doesNotMatch(story, /\bScene\b|GiftCard|OfferCard|DayStrip/, "nothing of the card is drawn again");
  assert.deepEqual(story.match(/<Figure id="[a-z-]+"/g), ['<Figure id="story-phone"', '<Figure id="story-last"'], "the phone's figure and the runner, two different ones, and no other");
  // The phone keeps its card and its button, and the last block its way to the card.
  assert.match(story, /<Install \/>/);
  assert.match(story, /standalone \? null/);
  assert.match(story, /<a data-offer="" href="#offer"[^>]*onClick=\{goToTheCard\}/);
  assert.match(story, /<Poster title=\{W\.last\.title\} \/>/);
  assert.doesNotMatch(home, /<Install quiet \/>/);
});

test("the grounds alternate, and a band that changes ground rises with round shoulders", () => {
  assert.match(story, /theirs: \{ band: "poster-band-ground", under: "" \},\n\s*checked: \{ band: "on-paper poster-band-rises", under: "" \},\n\s*back: \{ band: "poster-band-other poster-band-rises", under: "poster-under-paper" \},\n\s*face: \{ band: "poster-band-ground poster-band-rises", under: "poster-under-other" \},/);
  assert.match(css, /\.poster-band-rises \{\n  border-radius: var\(--poster-round\) var\(--poster-round\) 0 0;\n\}/);
  // 40 pixels on a phone, 72 from 600.
  assert.match(css, /--poster-pad: 76px;\n  --poster-round: 40px;/);
  assert.match(css, /--poster-pad: 150px;\n    --poster-round: 72px;/);
  // The third band wears the other appearance: the night's ground and its two voices by day, the day's by night, in
  // the two places night is written. Every value is one the look already has.
  assert.match(css, /--other-ground: #151026;\n  --other-text: #FFF6E2;\n  --other-muted: #C7C4DA;/);
  assert.equal(css.match(/--other-ground: #DDD6EB;\n\s+--other-text: #1E1633;\n\s+--other-muted: #5B5470;/g)?.length, 2);
  assert.match(css, /--background: #151026;[\s\S]*?--text: #FFF6E2;\n\s+--muted: #C7C4DA;/, "the night's own ground and voices");
  assert.match(css, /--background: #DDD6EB;\n  --surface: #FFFFFF;\n  --text: #1E1633;\n  --muted: #5B5470;/, "the day's own");
});

test("what Viky reads goes by as stickers: the chooser's eleven pictograms, with a control's outline and relief, never the sun", () => {
  const stickers = [...story.matchAll(/\{ icon: "([a-z]+)", tone: ([1-4]), tilt: (-?\d+) \}/g)].map((match) => match[1]);
  assert.deepEqual([...stickers].sort(), Object.keys(CONDITION_ICONS).sort(), "each of the eleven, once");
  assert.match(story, /<ConditionIcon icon=\{sticker\.icon\} \/>/, "the chooser's own drawings");
  const rule = css.slice(css.indexOf(".sticker {"), css.indexOf("}", css.indexOf(".sticker {")));
  assert.match(rule, /border: var\(--control-border-width\) solid var\(--control-border\);/);
  assert.match(rule, /border-radius: 50%;/);
  assert.match(rule, /box-shadow: var\(--control-relief\);/);
  assert.match(css, /--control-border-width: 2px;/);
  // Four tones, none of them the action's.
  const tones = [...css.matchAll(/--round-tone-[1-4]: (#[0-9A-Fa-f]{6});/g)].map((match) => match[1].toUpperCase());
  assert.equal(tones.length, 12, "four by day, and four in each of the two places night is written");
  assert.ok(!tones.includes("#FFC531"), "never the sun");
  assert.doesNotMatch(css.slice(css.indexOf(".sticker-strip {"), css.indexOf("html[data-moves] [data-landing-story]")), /--accent|--sun/);
  // A band with no first sticker and no last: the row is wider than any screen and centred on its own middle.
  assert.match(css, /\.sticker-strip \{\n  display: flex;\n  justify-content: center;\n  overflow: hidden;/);
  assert.match(story, /const SETS = \[0, 1, 2, 3, 4, 5\];/);
});

test("the movement: the first image is the starting state, and without it everything is there", () => {
  const P = MOTION.poster;
  // The founder's values, in the tokens and nowhere else.
  assert.equal(P.startAt, 0.8);
  assert.deepEqual({ stagger: P.word.staggerMs, rise: P.word.riseMs, ease: P.word.ease, fade: P.word.fadeMs }, { stagger: 70, rise: 650, ease: "back.out(1.8)", fade: 200 });
  assert.deepEqual({ land: P.character.landMs, ease: P.character.ease }, { land: 800, ease: "elastic.out(1, 0.5)" });
  assert.deepEqual({ ms: P.back.ms, ease: P.back.ease }, { ms: 900, ease: "back.out(1.3)" });
  assert.equal(P.line.ms, 350);
  assert.deepEqual({ drift: P.drift.px, lean: P.lean.deg }, { drift: 160, lean: 7 });
  const moving = story.slice(story.indexOf("function usePosters("), story.indexOf("export function LandingStory()"));
  assert.doesNotMatch(moving, /duration: \d|stagger: \d|scrub: \d|ease: "(?!none")/, "no value written in the component");
  assert.match(moving, /start: `clamp\(top \$\{P\.startAt \* 100\}%\)`, once: true/);
  assert.match(moving, /scale: 0, rotate: P\.character\.fromTurn \}, \{ scale: 1, rotate: 0, duration: seconds\(P\.character\.landMs\), ease: P\.character\.ease \}/);
  assert.match(moving, /if \(one\.dataset\.ch === "back"\) \{\n[^\n]*\n\s*play\.fromTo\(one, \{ opacity: 0, x: P\.back\.from/, "the day that was missed comes back from the far side");
  // Tied to the scroll, never to a clock, and the scroll itself is never touched.
  assert.match(moving, /gsap\.fromTo\(stickers, \{ x: P\.drift\.px \}, \{ x: -P\.drift\.px, ease: "none", scrollTrigger: \{[^}]*scrub: P\.drift\.catchUpS \} \}\)/);
  assert.match(moving, /gsap\.fromTo\(drawn, \{ rotate: -P\.lean\.deg \}, \{ rotate: P\.lean\.deg, ease: "none"/);
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
