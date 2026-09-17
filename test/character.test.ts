import { strict as assert } from "node:assert";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character, type CharacterState } from "../app/kit/Character.js";

/**
 * The rules of the characters (art direction brief, section 5), read off what the component actually draws: three
 * shapes, round eyes, no outline, no text, three secondary colours at most, a face only at the large size, and a face
 * that changes with the state.
 */

const STATES: CharacterState[] = ["toCome", "today", "catchable", "earned", "returned", "gift"];

const draw = (state: CharacterState, size: "large" | "small" = "large", variant = 0) =>
  renderToStaticMarkup(createElement(Character, { state, size, variant }));

test("every state is drawn from circles, rounded rectangles and rounded triangles, and nothing else", () => {
  for (const state of STATES) {
    for (const size of ["large", "small"] as const) {
      const svg = draw(state, size);
      const elements = [...svg.matchAll(/<([a-zA-Z]+)[\s>/]/g)].map((match) => match[1]);
      assert.deepEqual([...new Set(elements)].filter((name) => !["svg", "g", "circle", "rect", "path"].includes(name)), [], `${state} ${size}`);
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
    assert.doesNotMatch(svg, /stroke/);
    assert.doesNotMatch(svg, /<text|<tspan|<title|<foreignObject/);
    assert.match(svg, /^<svg aria-hidden="true"/);
  }
});

test("at most three secondary colours in any one character, and only from the look's range", () => {
  for (const state of STATES) {
    const svg = draw(state);
    const colours = new Set(svg.match(/var\(--character-[123]\)/g) ?? []);
    assert.ok(colours.size >= 1 && colours.size <= 3, `${state} uses ${colours.size} secondary colours`);
    assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}\b|rgb\(|gray|grey/, `${state} paints a colour outside the range`);
  }
  // A whole strip of every day state is one image, and still three colours.
  const strip = (["toCome", "today", "catchable", "earned", "returned"] as const).map((state) => draw(state)).join("");
  assert.equal(new Set(strip.match(/var\(--character-[123]\)/g)).size, 3);
});

test("a large character has a face and a shadow; a small one is only its shape and colour", () => {
  for (const state of STATES) {
    const large = draw(state, "large");
    const small = draw(state, "small");
    assert.match(large, /data-part="face"/);
    assert.match(large, /data-part="shadow"/);
    assert.doesNotMatch(small, /data-part="face"|data-part="shadow"|--character-face/);
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

test("on the app's icon the gift is drawn in the hero colour, and nowhere else does a character take the accent", () => {
  const hero = renderToStaticMarkup(createElement(Character, { state: "gift", tone: "hero" }));
  assert.match(hero, /var\(--on-accent\)/);
  assert.match(hero, /var\(--accent\)/);
  assert.doesNotMatch(hero, /data-part="shadow"/, "a tile has no floor to cast a shadow on");
  for (const state of STATES) assert.doesNotMatch(draw(state), /var\(--accent\)|var\(--on-accent\)/);
  // The tone is for the gift only: a day asked for it keeps its range.
  assert.equal(renderToStaticMarkup(createElement(Character, { state: "earned", tone: "hero" })).includes("--accent"), false);
});
