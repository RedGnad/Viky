import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { HERO_PEEK, heroTimeline } from "../app/kit/HeroMoment";
import { MOTION } from "../src/design-tokens";
import { HERO_COOKIE, heroCookieText, heroPlayedFromCookie } from "../src/hero-cookie";

/**
 * The hero moment of the landing (D214): the character with its limbs, the session's memory of the moment, the first
 * image drawn by the server, and the movement on the tokens.
 */

test("the diamond takes arms and legs only when asked: thin, bowed, hung from the body's sides, folding from the joint, in the limbs' own ink", () => {
  const plain = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun", standing: false }));
  assert.ok(!plain.includes('data-part="limbs"') && !plain.includes('data-part="whirl"'), "the head character everywhere else keeps its shape");
  assert.ok(plain.includes('viewBox="0 0 64 40"'));
  const limbed = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun", standing: false, limbs: true }));
  assert.equal((limbed.match(/data-part="arm"/g) ?? []).length, 2);
  assert.equal((limbed.match(/data-part="leg"/g) ?? []).length, 2);
  assert.ok(limbed.includes('viewBox="0 0 64 64"'), "the box grows down to the feet");
  assert.ok(limbed.indexOf('data-part="limbs"') < limbed.indexOf('data-part="body"'), "the joints stay under the body");
  assert.match(limbed, /data-part="arm" style="transform-box:fill-box;transform-origin:50% 0%"/, "a limb folds from its joint");
  assert.equal((limbed.match(/<path d="M[\d.]+ [\d.]+ Q[\d.]+ [\d.]+ [\d.]+ [\d.]+"/g) ?? []).length, 4, "each limb is one slight bow");
  assert.ok(limbed.includes("stroke-width:3.2") && !limbed.includes("stroke-width:5"), "thin, not thick");
  assert.ok(limbed.includes("stroke-linecap:round") && !limbed.includes("stroke-linecap:square"), "round caps: nothing pointed");
  assert.ok(limbed.includes("stroke:var(--character-limb)") && !limbed.includes("stroke:var(--character-face)"), "the limbs' own ink, readable by night");
  assert.match(limbed, /data-part="whirl" style="transform-box:fill-box;transform-origin:50% 50%"/, "and a group that turns from its middle");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /--character-limb: #1E1633;/, "the ink by day");
  assert.match(css.slice(css.indexOf("@media (prefers-color-scheme: dark)")), /--character-limb: #F3F0FA;/, "the text's light by night");
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
  assert.equal(HERO_PEEK, 0.66);
  assert.match(hero, /data-hero=\{played \? undefined : "peeking"\}/, "drawn peeking by the server when the moment has not played");
  assert.match(css, /\[data-hero="peeking"\] \[data-part="figure"\] \{\n\s*transform: translateY\(42px\);/, "the stylesheet puts the figure down from the first image, in the drawing's units: 66 % of 64");
  assert.equal(Math.round(HERO_PEEK * 64), 42);
  assert.match(css, /\[data-hero="peeking"\] \[data-part="arm"\],\n\[data-hero="peeking"\] \[data-part="leg"\] \{\n\s*transform: scale\(0\);/, "and folds the limbs");
  // The order the founder asked for: out from behind the card whirling, onto the floor, a bounce, still, then the limbs.
  const time = heroTimeline();
  assert.ok(time.top < time.floor && time.floor < time.hopTop && time.hopTop < time.floorAgain && time.floorAgain < time.still, "leap, floor, bounce, floor, still");
  assert.ok(time.limbsAt > time.floorAgain, "the limbs unfold only once the body is on the floor for good");
  assert.ok(time.done < MOTION.arrival.budgetMs, `the whole moment inside the arrival's budget: ${time.done} ms`);
  assert.match(hero, /whirl\.animate\(\[\{ transform: `rotate\(\$\{-360 \* hero\.turns\}deg\)` \}, \{ transform: "rotate\(0deg\)" \}\], \{ duration: time\.floor, easing: EASING\.emphasizedDecelerate/, "one whirl on the way out, upright as it lands");
  assert.match(hero, /transform: body\(0, hero\.squash\), easing: EASING\.emphasizedDecelerate/, "it squashes on the floor");
  assert.match(hero, /transform: body\(-hero\.leapAbove, hero\.stretch\), easing: EASING\.emphasizedAccelerate/, "and stretches at the top of the leap, falling faster and faster");
  assert.match(hero, /easing: time\.settle\.easing \}/, "the landing settles on the spring");
  assert.match(hero, /delay: time\.limbsAt, fill: "backwards"/, "the limbs wait their turn");
  assert.match(hero, /delay: time\.floor, fill: "backwards"/, "the mouth opens with the landing");
  assert.match(hero, /if \(!figure \|\| reduced\(\)\) \{\n\s*show\(\);\n\s*return;/, "reduced motion: standing, nothing moves");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s*\[data-hero="peeking"\] \[data-part="figure"\],[\s\S]*?transform: none;/, "and the first image is standing too");
  assert.doesNotMatch(hero, /setInterval|setTimeout|iterations: Infinity/, "nothing on a clock, nothing loops");
  assert.deepEqual(MOTION.hero.settle, { damping: 0.6, stiffness: 800 });
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  const order = ["<h1 className={HERO}>", "{W.promiseUnder}", 'href="#offer"', "<HeroMoment played={heroPlayed} />", '<div id="offer"', "<OfferCard />"].map((mark) => home.indexOf(mark));
  assert.ok(order.every((at) => at > 0) && order.every((at, i) => i === 0 || at > order[i - 1]), "the promise, its sentence, the way to the card, the moment, the card");
  assert.match(home, /<a href="#offer" className=\{`\$\{SECONDARY_BUTTON\}/, "the way to the card is tonal: the card's own action keeps the accent");
});
