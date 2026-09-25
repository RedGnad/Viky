import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character, type CharacterState } from "../app/kit/Character.js";

/**
 * The rules of the characters (art direction brief, section 5), read off what the component actually draws: round
 * eyes, no outline, no text, three secondary colours at most, and a face that changes with the state. The shapes were
 * three until the founder asked for a fourth on 20 Sep 2026, the diamond at the head of the page (D131); it obeys the
 * same rule as the triangle, its corners are rounded, so nothing the product draws is pointed.
 */

const STATES: CharacterState[] = ["toCome", "today", "catchable", "earned", "returned", "gift", "diamond"];

const draw = (state: CharacterState, size: "large" | "small" = "large", variant = 0) =>
  renderToStaticMarkup(createElement(Character, { state, size, variant, drawn: "inline" }));

test("every state is drawn from circles, rounded rectangles and rounded triangles, and nothing else", () => {
  for (const state of STATES) {
    for (const size of ["large", "small"] as const) {
      const svg = draw(state, size);
      const elements = [...svg.matchAll(/<([a-zA-Z]+)[\s>/]/g)].map((match) => match[1]);
      // The head of the page is the one character drawn from a blend of its own two colours, so it carries the three
      // elements a gradient needs and nothing else does (D132).
      const allowed = state === "diamond" ? ["svg", "g", "circle", "rect", "path", "defs", "linearGradient", "stop"] : ["svg", "g", "circle", "rect", "path"];
      assert.deepEqual([...new Set(elements)].filter((name) => !allowed.includes(name)), [], `${state} ${size}`);
      // No ovals: an eye is a circle, never an ellipse.
      assert.doesNotMatch(svg, /<ellipse/);
      // A rectangle is always rounded.
      for (const rect of svg.match(/<rect[^>]*>/g) ?? []) assert.match(rect, /rx="[1-9]/, `${state} draws a square corner`);
      // A path is a rounded triangle (Q corners), a half circle mouth (A), and never a sharp polygon.
      for (const path of svg.match(/ d="[^"]*"/g) ?? []) assert.match(path, /[QA]/, `${state} draws a pointed path`);
    }
  }
});

test("flat, with no outline and no text, and hidden from a screen reader because the words beside it say the state", () => {
  for (const state of STATES) {
    const svg = draw(state);
    // One outline in the whole product, on the head of the page, because the founder asked for it there (D132).
    if (state === "diamond") assert.match(svg, /stroke="var\(--character-hero-edge\)"|stroke:var\(--character-hero-edge\)/);
    else assert.doesNotMatch(svg, /stroke/);
    assert.doesNotMatch(svg, /<text|<tspan|<title|<foreignObject/);
    assert.match(svg, /^<svg aria-hidden="true"/);
  }
});

test("at most three secondary colours in any one character, and only from the look's range", () => {
  for (const state of STATES) {
    const svg = draw(state);
    const colours = new Set(svg.match(/var\(--character-[123]\)/g) ?? []);
    // The head of the page is filled from its own two variables, one pair by day and another by night (D134), so it
    // is the one character that names no colour of the range.
    if (state === "diamond") assert.match(svg, /style="stop-color:var\(--character-hero-from\)"[\s\S]*style="stop-color:var\(--character-hero-to\)"/);
    else assert.ok(colours.size >= 1 && colours.size <= 3, `${state} uses ${colours.size} secondary colours`);
    assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}\b|rgb\(|gray|grey/, `${state} paints a colour outside the range`);
  }
  // A whole strip of every day state is one image, and still three colours.
  const strip = (["toCome", "today", "catchable", "earned", "returned"] as const).map((state) => draw(state)).join("");
  assert.equal(new Set(strip.match(/var\(--character-[123]\)/g)).size, 3);
});

test("both sizes carry a face, and only the large one casts a shadow", () => {
  // The brief kept the face for the large size and the founder amended it on the rendered mockups of 19 Sep 2026
  // (D113): a row of faceless shapes reads as a chart, and the faces are what hold a screen together. A small one
  // still has no floor under it, because a strip of them is a row and not a scene.
  for (const state of STATES) {
    const large = draw(state, "large");
    const small = draw(state, "small");
    assert.match(large, /data-part="face"/);
    assert.match(large, /data-part="shadow"/);
    assert.match(small, /data-part="face"/);
    assert.doesNotMatch(small, /data-part="shadow"/);
    assert.match(large, /var\(--character-face\)/);
  }
});

test("the state changes the face, so no two states wear the same one, and neighbours of one state look a little different", () => {
  const faces = STATES.map((state) => draw(state).match(/<g data-part="face"[^]*?<\/g>/)?.[0]);
  assert.equal(new Set(faces).size, STATES.length);
  assert.notEqual(draw("earned", "large", 0), draw("earned", "large", 1));
  assert.notEqual(draw("today", "large", 0), draw("today", "large", 1));
});

test("the small states are told apart by shape and colour alone", () => {
  const silhouettes = (["toCome", "today", "catchable", "earned", "returned"] as const).map((state) => draw(state, "small"));
  assert.equal(new Set(silhouettes).size, 5);
});

test("the face turns as one piece under a pointer, inside the face the motion opens", () => {
  for (const state of STATES) assert.match(draw(state), /<g data-part="face"[^>]*><g data-part="gaze">/);
});

test("the hero tone belongs to the gift on the link preview, and nowhere else does a character take the accent", () => {
  const hero = renderToStaticMarkup(createElement(Character, { state: "gift", tone: "hero", drawn: "inline" }));
  // A third tone since the rendered mockups of 19 Sep 2026: the gift at the head of Home is a sun box with a pink
  // ribbon. The icon keeps the tone it was drawn in, which is why this is a tone of its own and not a change.
  const sun = renderToStaticMarkup(createElement(Character, { state: "gift", tone: "sun", drawn: "inline" }));
  assert.match(sun, /var\(--accent\)/);
  assert.doesNotMatch(sun, /var\(--on-accent\)/);
  assert.match(hero, /var\(--on-accent\)/);
  assert.match(hero, /var\(--accent\)/);
  assert.doesNotMatch(hero, /data-part="shadow"/, "a tile has no floor to cast a shadow on");
  // Since D135 the icon is the head character on the ink tile, the rig's head since D253; the link previews draw the
  // standing figure since D265, and no longer the gift.
  const script = readFileSync("scripts/make-icon.ts", "utf8");
  assert.match(script, /const svg = figureInLook\("dark", \{ id: "icon", limbs: false \}\);/);
  assert.match(script, /background:\$\{COLOURS\.dark\.background\}/);
  assert.doesNotMatch(script, /characterSvg|gift-hero/);
  for (const state of STATES) assert.doesNotMatch(draw(state), /var\(--accent\)|var\(--on-accent\)/);
  // The tone is for the gift only: a day asked for it keeps its range.
  assert.equal(renderToStaticMarkup(createElement(Character, { state: "earned", tone: "hero", drawn: "inline" })).includes("--accent"), false);
});

