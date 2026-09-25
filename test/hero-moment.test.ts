import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { Figure } from "../app/kit/Figure";
import { HERO_PEEK, heroTimeline } from "../app/kit/HeroMoment";
import { CARD_FRAGMENT, dropStaleCardFragment, goToTheCard } from "../app/kit/WayToTheCard";
import { MOTION } from "../src/design-tokens";
import { HERO_COOKIE, heroCookieText, heroPlayedFromCookie } from "../src/hero-cookie";

/**
 * The hero moment of the landing (D214): the character with its limbs, the session's memory of the moment, the first
 * image drawn by the server, and the movement on the tokens.
 */

test("the diamond takes arms and legs only when asked: thin, bowed, on the sketch's measures, folding from the joint, in the limbs' own ink", () => {
  const plain = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun", standing: false }));
  assert.ok(!plain.includes('data-part="limbs"') && !plain.includes('data-part="whirl"'), "the head character everywhere else keeps its shape");
  assert.ok(plain.includes('viewBox="0 0 64 40"'));
  const limbed = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun", standing: false, limbs: true }));
  assert.equal((limbed.match(/data-part="arm"/g) ?? []).length, 2);
  assert.equal((limbed.match(/data-part="leg"/g) ?? []).length, 2);
  assert.ok(limbed.includes('viewBox="0 0 64 53"'), "the box grows down to the feet, and no further");
  assert.ok(limbed.indexOf('data-part="limbs"') < limbed.indexOf('data-part="body"'), "the joints stay under the body");
  assert.match(limbed, /data-part="arm" style="transform-box:fill-box;transform-origin:50% 0%"/, "a limb folds from its joint");
  assert.equal((limbed.match(/<path d="M[\d.]+ [\d.]+ Q[\d.]+ [\d.]+ [\d.]+ [\d.]+"/g) ?? []).length, 4, "each limb is one slight bow");
  assert.ok(limbed.includes("stroke-width:1.8") && !limbed.includes("stroke-width:3.2"), "thin: the sketch's 18 pixels on a body of 625");
  // The sketch's measures (D221): the arms straight down from the body's lower sides, close to it, the hands where
  // the body ends; the legs a little apart, leaning out, the feet turned out; one slight bow each.
  assert.ok(limbed.includes('d="M13 26 Q12 30.7 13 35.4"') && limbed.includes('d="M51 26 Q52 30.7 51 35.4"'), "the arms, 19 from the middle");
  assert.ok(limbed.includes('cx="13" cy="37.2" r="1.9"') && limbed.includes('cx="51" cy="37.2" r="1.9"'), "the hands, just under the body's lowest point");
  assert.ok(limbed.includes('d="M23.5 30 Q21.6 40.75 21.7 51.5"') && limbed.includes('d="M40.5 30 Q42.4 40.75 42.3 51.5"'), "the legs, 15.5 below the body");
  assert.ok(limbed.includes('d="M21.7 51.5 H18.5"') && limbed.includes('d="M42.3 51.5 H45.5"'), "the feet, 3.2 long, turned out (D242)");
  const rig = renderToStaticMarkup(createElement(Figure, { id: "feet" }));
  assert.ok(rig.includes('d="M21.7 51.5 H18.5"') && rig.includes('d="M42.3 51.5 H45.5"'), "and the rig's the same, on every page");
  assert.ok(limbed.includes("stroke-linecap:round") && !limbed.includes("stroke-linecap:square"), "round caps: nothing pointed");
  assert.ok(limbed.includes("stroke:var(--character-limb)") && !limbed.includes("stroke:var(--character-face)"), "the limbs' own ink, readable by night");
  assert.match(limbed, /data-part="whirl" style="transform-box:fill-box;transform-origin:50% 50%"/, "and a group that turns from its middle");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /--character-limb: #1E1633;/, "the ink by day");
  assert.equal((css.slice(css.indexOf("@media (prefers-color-scheme: dark)")).match(/--character-limb: var\(--character-hero-edge\);/g) ?? []).length, 2, "by night, the colour of the diamond's own edge, in both night blocks (D235)");
  const earned = renderToStaticMarkup(createElement(Character, { state: "earned", limbs: true, drawn: "inline" }));
  assert.ok(!earned.includes('data-part="limbs"'), "other states never take limbs");
});

test("the session remembers the moment: a cookie with no age, read by the server, so the first image is the right one", () => {
  assert.equal(HERO_COOKIE, "viky.hero");
  assert.equal(heroPlayedFromCookie("1"), true);
  assert.equal(heroPlayedFromCookie(undefined), false);
  assert.equal(heroPlayedFromCookie("yes"), false);
  assert.equal(heroCookieText(true), "viky.hero=1; Path=/; SameSite=Lax; Secure");
  assert.doesNotMatch(heroCookieText(false), /Max-Age|Expires/, "for the session only");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /heroPlayed=\{heroPlayedFromCookie\(\(await cookies\(\)\)\.get\(HERO_COOKIE\)\?\.value\)\}/, "the server reads it while it draws the landing");
});

test("the first image is the starting state, the choreography is on the tokens in its order, and reduced motion stands still", () => {
  const hero = readFileSync("app/kit/HeroMoment.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  assert.equal(HERO_PEEK, 53 - 18 - 4, "the box is 53 tall, the head's top at 4: 18 units of head stay over the card's edge");
  assert.match(hero, /data-hero=\{played \? undefined : "peeking"\}/, "drawn peeking by the server when the moment has not played");
  assert.match(css, /\[data-hero="peeking"\] \[data-part="figure"\] \{\n\s*transform: translateY\(31px\);/, "the stylesheet puts the figure down from the first image, in the drawing's units");
  assert.match(css, /\[data-hero="peeking"\] \[data-part="arm"\],\n\[data-hero="peeking"\] \[data-part="leg"\] \{\n\s*transform: scaleY\(0\);/, "and folds the limbs along their own axis");
  // The order the founder asked for: out from behind the card whirling, onto the floor, a bounce, still, then the limbs.
  const time = heroTimeline();
  assert.ok(time.top < time.floor && time.floor < time.hopTop && time.hopTop < time.floorAgain && time.floorAgain < time.still, "leap, floor, bounce, floor, still");
  // During the jump, not after it (D234): the arms as the leap slows to its top, the legs in the fall, out as it lands.
  assert.ok(time.armsAt < time.top && time.armsAt > time.top / 2, "the arms open in the last part of the leap");
  assert.ok(time.legsAt >= time.top && time.legsAt < time.floor, "the legs unfold during the fall");
  assert.ok(time.legsAt + MOTION.hero.limbPairStaggerMs + time.unfold.durationMs < time.floorAgain, "and are out before the bounce lands");
  assert.ok(time.armsAt < time.legsAt, "arms first, then legs");
  assert.ok(MOTION.hero.limbPairStaggerMs >= 30 && MOTION.hero.limbPairStaggerMs <= 80, "left then right, a turn a person can see");
  assert.equal(time.done, Math.max(time.still, time.armsAt + MOTION.hero.limbPairStaggerMs + time.settle.durationMs, time.legsAt + MOTION.hero.limbPairStaggerMs + time.unfold.durationMs));
  assert.ok(time.done < MOTION.arrival.budgetMs, `the whole moment inside the arrival's budget: ${time.done} ms`);
  assert.match(hero, /whirl\.animate\(\[\{ transform: `rotate\(\$\{-360 \* hero\.turns\}deg\)` \}, \{ transform: "rotate\(0deg\)" \}\], \{ duration: time\.floor, easing: EASING\.emphasizedDecelerate/, "one whirl on the way out, upright as it lands");
  assert.match(hero, /transform: body\(0, hero\.squash\), easing: EASING\.emphasizedDecelerate/, "it squashes on the floor");
  assert.match(hero, /transform: body\(-hero\.leapAbove, hero\.stretch\), easing: EASING\.emphasizedAccelerate/, "and stretches at the top of the leap, falling faster and faster");
  assert.match(hero, /easing: time\.settle\.easing \}/, "the landing settles on the spring");
  assert.match(hero, /transform: "scaleY\(0\)" \}, \{ transform: "scaleY\(1\)" \}\], \{ duration: spring\.durationMs, easing: spring\.easing, delay: at, fill: "backwards" \}/, "each limb lengthens along its own axis");
  assert.match(hero, /arms\.forEach\(\(arm, index\) => running\.push\(lengthen\(arm, time\.armsAt \+ index \* hero\.limbPairStaggerMs, time\.settle\)\)\)/, "the arms on the expressive spring");
  assert.match(hero, /legs\.forEach\(\(leg, index\) => running\.push\(lengthen\(leg, time\.legsAt \+ index \* hero\.limbPairStaggerMs, time\.unfold\)\)\)/, "the legs on the spring that never overshoots");
  assert.match(hero, /delay: time\.floor, fill: "backwards"/, "the mouth opens with the landing");
  assert.match(hero, /if \(!figure \|\| reduced\(\)\) \{\n\s*show\(\);\n\s*return;/, "reduced motion: standing, nothing moves");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s*\[data-hero="peeking"\] \[data-part="figure"\],[\s\S]*?transform: none;/, "and the first image is standing too");
  assert.doesNotMatch(hero, /setInterval|setTimeout|iterations: Infinity/, "nothing on a clock, nothing loops");
  // The landing's figure is the rig, in its resting pose, with the group that whirls (D241).
  assert.match(hero, /<Figure id="hero" whirl className="hero-character" \/>/);
  const rig = renderToStaticMarkup(createElement(Figure, { id: "hero", whirl: true }));
  for (const part of ["figure", "whirl", "arm", "leg", "mouth", "eye", "gloss"]) assert.ok(rig.includes(`data-part="${part}"`), part);
  assert.ok(rig.indexOf('data-part="figure"') < rig.indexOf('data-part="whirl"'), "the whirl inside what leaps");
  assert.deepEqual(MOTION.hero.settle, { damping: 0.6, stiffness: 800 });
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  const order = ["<h1 className={HERO}>", "{W.promiseUnder}", 'href="#offer"', "<HeroMoment played={heroPlayed} />", '<div id="offer"', "<OfferCard />"].map((mark) => home.indexOf(mark));
  assert.ok(order.every((at) => at > 0) && order.every((at, i) => i === 0 || at > order[i - 1]), "the promise, its sentence, the way to the card, the moment, the card");
  assert.match(home, /<a href="#offer" className=\{`\$\{PRIMARY_BUTTON\}/, "the way to the card carries the accent: the first screen's one action, the card's own a screen below");
});

/**
 * The way to the card writes nothing in the address (D240). A fragment link keeps "#offer" in the address, and every
 * later load of that address starts at the card: an installed app reopening on its last address, a reload, a restored
 * tab. That is the landing the founder saw open part way down at launch (25 Sep 2026).
 */
test("the way to the card scrolls to it and leaves no fragment behind, and a stale one is dropped on arrival", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.equal(CARD_FRAGMENT, "#offer");
  assert.match(home, /<a href="#offer" className=\{`\$\{PRIMARY_BUTTON\}[^>]*onClick=\{goToTheCard\}>/, "the link keeps its fragment for a browser without script, and the press does the rest");
  assert.match(home, /<div id="offer" tabIndex=\{-1\} className="[^"]*outline-none/, "the card can take the keyboard's starting point, as a fragment would give it, without a ring");
  assert.match(home, /useEffect\(\(\) => \{\n\s*dropStaleCardFragment\(\);\n\s*\}, \[\]\);/, "and a device that still holds the old address is cleaned on arrival");
  // The press: the card scrolled into view, the default stopped, nothing written; without the card, the browser's own way.
  const calls: string[] = [];
  const card = { scrollIntoView: (options: unknown) => calls.push(`scroll ${JSON.stringify(options)}`), focus: (options: unknown) => calls.push(`focus ${JSON.stringify(options)}`) };
  const realDocument = globalThis.document;
  const realWindow = globalThis.window;
  (globalThis as { document?: unknown }).document = { getElementById: (id: string) => (id === "offer" ? card : null) };
  try {
    goToTheCard({ preventDefault: () => calls.push("prevented") });
    assert.deepEqual(calls, ["prevented", 'scroll {"block":"start"}', 'focus {"preventScroll":true}']);
    (globalThis as { document?: unknown }).document = { getElementById: () => null };
    calls.length = 0;
    goToTheCard({ preventDefault: () => calls.push("prevented") });
    assert.deepEqual(calls, [], "no card on the page: the browser follows the fragment as usual");
    // Arrival: "#offer" in the address is replaced by the same address without it, and any other address is left alone.
    const written: unknown[][] = [];
    (globalThis as { window?: unknown }).window = { location: { hash: "#offer", pathname: "/", search: "" }, history: { replaceState: (...args: unknown[]) => written.push(args) } };
    dropStaleCardFragment();
    assert.equal(JSON.stringify(written), JSON.stringify([[null, "", "/"]]));
    (globalThis as { window?: unknown }).window = { location: { hash: "", pathname: "/gifts", search: "?x=1" }, history: { replaceState: (...args: unknown[]) => written.push(args) } };
    dropStaleCardFragment();
    assert.equal(written.length, 1, "nothing to drop, nothing written");
  } finally {
    (globalThis as { document?: unknown }).document = realDocument;
    (globalThis as { window?: unknown }).window = realWindow;
  }
  const way = readFileSync("app/kit/WayToTheCard.ts", "utf8");
  assert.doesNotMatch(way, /pushState|location\.hash =|scrollTo\(/, "nothing is pushed, no hash is written, and nobody is scrolled back at load");
});

test("the first screen is as tall as the viewport less the header and the card's peek, and the room left over is shared (D221)", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.match(css, /--hero-card-peek: 104px;/, "the card's name row whole, the next one cut");
  assert.match(css, /--hero-character-size: 272px;/, "the sketch's character on a phone");
  assert.match(css.slice(css.indexOf("@media (min-width: 1024px)")), /--hero-character-size: 360px;/, "and larger from 1024");
  assert.match(css, /\.hero-first-screen \{\n[^}]*min-height: calc\(100svh - var\(--space-lg\) - var\(--tap-target\) - var\(--space-xl\) - var\(--hero-card-peek\)\);/, "the first screen, on the small viewport so it does not move with the browser's bars");
  assert.match(css, /\.hero-stage \{\n[^}]*height: calc\(var\(--hero-character-size\) \* 53 \/ 64\);\n[^}]*margin-top: auto;/, "the stage is the drawing's height and takes its share of the room");
  assert.doesNotMatch(css, /\.hero-stage \{[^}]*margin-bottom/, "nothing taken back: the card follows the first screen directly");
  const firstScreen = home.indexOf('className="hero-first-screen');
  assert.ok(firstScreen > 0 && firstScreen < home.indexOf("<h1 className={HERO}>"), "the first screen holds the title");
  assert.ok(home.indexOf("<HeroMoment played={heroPlayed} />") < home.indexOf('<div id="offer"'), "and the character, and the card comes after it");
  assert.match(home, /style=\{\{ flexGrow: ROOM\.aboveWords \}\} \/>\n\s*<div className="w-full text-center">\n\s*<h1 className=\{HERO\}>/, "the title's share of the room, centred at every width");
  // The three shares, not rigidly equal (D250): the action's a little smaller, the character's a little larger.
  assert.match(home, /export const ROOM = \{ aboveWords: 1, beforeAction: 0\.9, beforeCharacter: 1\.1 \} as const;/);
  assert.ok(home.indexOf("ROOM.beforeAction") < home.indexOf('href="#offer"') && home.indexOf('href="#offer"') < home.indexOf("ROOM.beforeCharacter"));
  assert.match(home, /className=\{`\$\{LEAD\} mx-auto /, "the sentence centred at every width");
});

test("the landing opens at its top at a launch, and the installed app after a long absence (D250)", async () => {
  const { LAUNCH_TOP_SCRIPT, LONG_ABSENCE_MS, backAfterLongAbsence } = await import("../src/launch-top");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.ok(layout.indexOf("THEME_BOOT_SCRIPT }} />") < layout.indexOf("LAUNCH_TOP_SCRIPT }} />"), "in the head, before the browser restores a position");
  // The script itself, run against a stand-in of the browser's objects.
  const run = (pathname: string, hash: string) => {
    const history = { scrollRestoration: "auto" };
    new Function("location", "history", LAUNCH_TOP_SCRIPT)({ pathname, hash }, history);
    return history.scrollRestoration;
  };
  assert.equal(run("/", ""), "manual", "the landing: no old position restored");
  assert.equal(run("/gifts", ""), "auto", "every other page keeps the browser's memory");
  assert.equal(run("/", "#offer"), "auto", "an address that names a place keeps it");
  assert.equal(LONG_ABSENCE_MS, 30 * 60 * 1000);
  assert.equal(backAfterLongAbsence(0, LONG_ABSENCE_MS), true);
  assert.equal(backAfterLongAbsence(0, LONG_ABSENCE_MS - 1), false, "a glance at another app is not a launch");
  assert.equal(backAfterLongAbsence(null, LONG_ABSENCE_MS * 2), false);
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /useEffect\(\(\) => topAfterLongAbsence\(isStandalone\), \[\]\);/);
});
