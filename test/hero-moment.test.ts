import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { HERO_PEEK } from "../app/kit/HeroMoment";
import { MOTION } from "../src/design-tokens";
import { HERO_COOKIE, heroCookieText, heroPlayedFromCookie } from "../src/hero-cookie";

/**
 * The hero moment of the landing (D214): the character with its limbs, the session's memory of the moment, the first
 * image drawn by the server, and the movement on the tokens.
 */

test("the diamond takes arms and legs only when asked, each folding from its joint, drawn in the face's ink behind the body", () => {
  const plain = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun", standing: false }));
  assert.ok(!plain.includes('data-part="limbs"'), "the head character everywhere else keeps its shape");
  assert.ok(plain.includes('viewBox="0 0 64 40"'));
  const limbed = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun", standing: false, limbs: true }));
  assert.equal((limbed.match(/data-part="arm"/g) ?? []).length, 2);
  assert.equal((limbed.match(/data-part="leg"/g) ?? []).length, 2);
  assert.ok(limbed.includes('viewBox="0 0 64 64"'), "the box grows down to the feet");
  assert.ok(limbed.indexOf('data-part="limbs"') < limbed.indexOf('data-part="body"'), "the joints stay under the body");
  assert.match(limbed, /data-part="arm" style="transform-box:fill-box;transform-origin:50% 0%"/, "a limb folds from its joint");
  assert.ok(!limbed.includes("stroke-linecap:square") && limbed.includes("stroke-linecap:round"), "round caps: nothing pointed");
  assert.ok(!/stroke:var\(--character-[123]\)/.test(limbed), "a limb is never a fourth colour: it wears the face's ink");
  // Other states never take limbs, asked or not.
  const earned = renderToStaticMarkup(createElement(Character, { state: "earned", limbs: true, drawn: "inline" }));
  assert.ok(!earned.includes('data-part="limbs"'));
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

test("the first image is the starting state, the movement is on the tokens, and reduced motion stands still", () => {
  const hero = readFileSync("app/kit/HeroMoment.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  assert.equal(HERO_PEEK, 0.66);
  assert.match(hero, /data-hero=\{played \? undefined : "peeking"\}/, "drawn peeking by the server when the moment has not played");
  assert.match(css, /\[data-hero="peeking"\] \[data-part="figure"\] \{\n\s*transform: translateY\(42px\);/, "the stylesheet puts the figure down from the first image, in the drawing's units: 66 % of 64");
  assert.match(hero, /translateY\(\$\{Math\.round\(HERO_PEEK \* CHARACTER_BOX\)\}px\)/, "and the animation starts from the same place");
  assert.equal(Math.round(HERO_PEEK * 64), 42);
  assert.match(css, /\[data-hero="peeking"\] \[data-part="arm"\],\n\[data-hero="peeking"\] \[data-part="leg"\] \{\n\s*transform: scale\(0\);/, "and folds the limbs");
  assert.match(hero, /springEasing\(MOTION\.gift\.spatial\)/, "the rise is the expressive spatial spring of the gift's arrival");
  assert.match(hero, /springEasing\(MOTION\.gift\.effects\)/, "the mouth opens on the effects spring");
  assert.match(hero, /fill: "backwards"/, "the animation holds the starting state until it plays");
  assert.match(hero, /if \(!figure \|\| reduced\(\)\) \{\n\s*show\(\);\n\s*return;/, "reduced motion: standing, nothing moves");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s*\[data-hero="peeking"\] \[data-part="figure"\],[\s\S]*?transform: none;/, "and the first image is standing too");
  assert.doesNotMatch(hero, /setInterval|iterations: Infinity/, "nothing on a clock, nothing loops");
  assert.equal(MOTION.gift.spatial.damping, 0.6);
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  const order = ["<h1 className={HERO}>", "{W.promiseUnder}", 'href="#offer"', "<HeroMoment played={heroPlayed} />", '<div id="offer"', "<OfferCard />"].map((mark) => home.indexOf(mark));
  assert.ok(order.every((at) => at > 0) && order.every((at, i) => i === 0 || at > order[i - 1]), "the promise, its sentence, the way to the card, the moment, the card");
  assert.match(home, /<a href="#offer" className=\{`\$\{SECONDARY_BUTTON\}/, "the way to the card is tonal: the card's own action keeps the accent");
});
