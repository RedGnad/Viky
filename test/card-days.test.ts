import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { MOTION } from "../src/design-tokens";
import { OFFER } from "../src/sentences";

/**
 * The card in the founder's direction A (D226): the days larger in the middle of the card with what one is worth
 * under them, the money on one line, the action in its own group, and two movements on a change of state: the days
 * arrive in turn when the length changes, and the first one opens its eyes when the card is ready.
 */

const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
const strip = readFileSync("app/kit/DayStrip.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("the card is three groups: who and what, the days and the money, the action, told apart by air", () => {
  const marks = ['title={', "under={", "shape={", 'width={72}', "wake={ready && filled.for}", "{W.aDay}", "bottom={", "<MoneyKey", "{quick.map(", "onClick={() => setPaying(true)}", "{W.missedBack}"];
  const at = marks.map((mark) => card.indexOf(mark));
  assert.ok(at.every((i) => i > 0) && at.every((i, n) => n === 0 || i > at[n - 1]), "who, what, the days and their worth, the money, the lengths, the action, the promise");
  assert.match(card, /shape=\{\n\s*<div className="my-\[var\(--space-md\)\] flex flex-col items-center gap-\[var\(--space-sm\)\]">/, "the days' own group, 24 pixels from the others");
  assert.match(card, /<span className="flex flex-wrap items-center gap-x-\[var\(--space-md\)\] gap-y-\[var\(--space-md\)\]">\n(\s*\{\/\*[^*]*\*\/\}\n)?\s*<span\n?\s*className=\{`\$\{CARD_AMOUNT\}/, "the amount and the lengths in one row that wraps");
  assert.match(card, /className=\{`\$\{PRIMARY_BUTTON\} mt-\[var\(--space-xl\)\]`\}/, "the action in its own group");
  assert.doesNotMatch(card, /W\.eachDay|mt-\[var\(--space-lg\)\]`\} disabled/, "the old sentence and the old spacing are gone");
  assert.match(card, /<span className=\{CHOICE\}>\{inTheirCurrency\(units \/ BigInt\(days\)\)\}<\/span> <span className=\{HELP\}>\{W\.aDay\}<\/span>/, "what one mark is worth, the figure in the title face");
  // A certificate or a climb: one character at 96 and nothing under it (D258): no sentence stretches the card.
  const single = card.slice(card.indexOf('shape === "climb" || shape === "stamp" ? ('), card.indexOf("<DayStrip"));
  assert.match(single, /<Character state="toCome" className="h-auto w-\[96px\]" standing=\{false\} \/>/);
  assert.doesNotMatch(single, /<span/, "no line under the single character");
  assert.doesNotMatch(card, /whenReached/);
  assert.equal(OFFER.aDay, "a day");
  assert.equal(OFFER.missedBack, "What's missed comes back to you.");
});

test("the days on the card are 72 wide, and the strip keeps 60 everywhere else", () => {
  assert.match(strip, /const WIDTHS = \{ 60: "w-\[60px\]", 72: "w-\[72px\]" \} as const;/);
  assert.match(strip, /width = 60,/, "60 unless asked");
  assert.match(strip, /className=\{`flex \$\{WIDTHS\[width\]\} flex-none items-end`\}/);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8") + readFileSync("app/kit/GiftCard.tsx", "utf8");
  assert.doesNotMatch(page, /width=\{72\}/, "a gift read keeps its row at 60");
});

test("the first day opens its eyes when the card is ready: the state in the markup, the change played from it, once", () => {
  // A closed eye is a part that turns from its middle, so the drawing written into the page can open it.
  const sleeping = renderToStaticMarkup(createElement(Character, { state: "toCome", standing: false, drawn: "inline" }));
  assert.equal((sleeping.match(/<rect data-part="eye"/g) ?? []).length, 2, "two closed eyes, named");
  assert.match(sleeping, /<rect data-part="eye"[^>]*rx="3.4" ry="1.2"[^>]*style="fill:var\(--character-face\);transform-box:fill-box;transform-origin:50% 50%"/, "a pill whose corners are its half width: stretched open it is a circle");
  assert.match(strip, /data-awake=\{wake && index === 0 \? "" : undefined\}/, "the first day says it is awake in the markup");
  assert.match(strip, /\|\| \(wake !== undefined && index === 0\) \? "inline" : "referenced"/, "and is written into the page, so its eyes can be reached");
  assert.match(css, /\.day-row-days \[data-awake\] \[data-part="eye"\] \{\n\s*transform: scaleY\(2\.8\);/, "the stylesheet holds the open state from the first image");
  assert.match(strip, /const wasAwake = useRef\(wake\);/, "nothing plays on the first image");
  assert.match(strip, /if \(wake === undefined \|\| wasAwake\.current === wake\) return;/);
  assert.match(strip, /springEasing\(SPRING\.effects\)/, "on the spring that never overshoots");
  assert.match(strip, /if \(reduced\(\)\) return;/, "and not at all on a device that asked for less");
});

test("a strip that changes length shows its days again in turn, as a screen arrives, and not on the first image", () => {
  assert.match(strip, /const about = `\$\{days\.length\}:\$\{changedOn \?\? ""\}`;/, "the length, and what the strip is about");
  assert.match(strip, /if \(wasAbout\.current === about\) return;/, "only on a change");
  assert.match(card, /changedOn=\{draft\.conditionId\}/, "a new condition on the card is such a change (D230)");
  assert.match(strip, /const \{ durationMs, easing, rise, staggerMs, mostStaggeredMs, fromOpacity \} = MOTION\.reveal;/, "the page's own turns, to the token");
  assert.match(strip, /delay: Math\.min\(index \* staggerMs, mostStaggeredMs\), fill: "backwards"/, "the fourth and every day after arrive together");
  assert.match(strip, /\.slice\(0, ARRIVING\)/, "the days a card shows, not a year of them");
  assert.equal(MOTION.reveal.staggerMs, 80);
  assert.equal(MOTION.reveal.mostStaggeredMs, 240);
  assert.doesNotMatch(strip, /setTimeout\(|iterations: Infinity/, "nothing on a clock, nothing loops");
});
