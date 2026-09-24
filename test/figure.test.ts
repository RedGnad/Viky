import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Figure, LIGHT, Scene, lit } from "../app/kit/Figure";

/**
 * The rig of the figure (D236): one light that everything shining obeys, a face and limbs in named sets, props in
 * the figure's own material and palette, and the three destinations' scenes.
 */

test("one light, and the reflections follow it rather than the body", () => {
  const shine = lit(LIGHT);
  assert.ok(shine.gloss.cx < 32 && shine.gloss.cy < 20, "the gloss sits toward the light, top left");
  assert.ok(shine.gradient.x1 < shine.gradient.x2 && shine.gradient.y1 < shine.gradient.y2, "the gradient runs from the lit corner");
  assert.equal(shine.rims.length, 2, "a rim on the two edges that face away from the light");
  const [strong, weak] = [...shine.rims].sort((a, b) => b.opacity - a.opacity);
  assert.ok(strong.opacity > 0.5 && weak.opacity < 0.2, `strongest on the edge facing straight away: ${strong.opacity}, ${weak.opacity}`);
  assert.ok(strong.y1 > 20 && strong.x1 > 32, "and that edge is the bottom right one");
  const fromRight = lit({ x: 1, y: -1 });
  assert.ok(fromRight.gloss.cx > 32, "light from the right, gloss on the right");
  assert.ok(fromRight.gradient.x1 > fromRight.gradient.x2, "and the gradient turns with it");
  // A lean turns the light the other way in the drawing's coordinates, so on screen it stays where the light is.
  const leaning = lit(LIGHT, 45);
  assert.ok(Math.abs(leaning.light.x) > Math.abs(leaning.light.y) && leaning.light.x < 0, "leaning 45 to the right, the top-left light comes from straight left in the body's own frame");
  assert.notEqual(leaning.gloss.cx, shine.gloss.cx, "so the gloss moves on the body");
});

test("the figure is drawn from named parts, in the character's palette and nothing else", () => {
  const plain = renderToStaticMarkup(createElement(Figure, { id: "t" }));
  for (const part of ["figure", "limbs", "body", "rim", "gloss", "face", "eyes", "mouth", "arm", "leg"]) assert.ok(plain.includes(`data-part="${part}"`), part);
  assert.match(plain, /stroke:url\(#t-edge\)/, "the edge is a gradient of its own colour");
  assert.ok(plain.includes("var(--character-hero-edge-light)") && plain.includes("var(--character-hero-edge-deep)"));
  assert.match(plain, /<ellipse[^>]*transform="rotate\(-28\.?\d* /, "the gloss slants along the lit edge");
  const colours = new Set(plain.match(/#[0-9A-Fa-f]{6}\b/g) ?? []);
  assert.deepEqual([...colours], ["#FFFFFF"], "white for what shines, and every other colour a token of the character's");
  assert.doesNotMatch(plain, /--accent/, "never the sun");
  // Faces and poses are sets, each named on the drawing.
  const shades = renderToStaticMarkup(createElement(Figure, { id: "s", eyes: "shades", mouth: "grin", arms: "crossed", legs: "apart" }));
  assert.ok(shades.includes('data-prop="shades"') && !shades.includes('data-part="eye"'), "shades replace the eyes");
  assert.ok(shades.includes('data-pose="crossed"') && shades.includes('data-pose="apart"'));
  const closed = renderToStaticMarkup(createElement(Figure, { id: "c", eyes: "closed", mouth: "o" }));
  assert.equal((closed.match(/<rect data-part="eye"/g) ?? []).length, 2, "closed eyes are the pills an open eye can grow from");
  assert.ok(closed.includes('data-part="mouth"'));
  const home = renderToStaticMarkup(createElement(Figure, { id: "h", arms: "hold", props: ["suit", "case"] }));
  assert.ok(home.includes('data-prop="suit"') && home.includes('data-prop="case"') && home.includes('data-pose="hold"'));
  assert.deepEqual([...new Set(home.match(/#[0-9A-Fa-f]{6}\b/g) ?? [])], ["#FFFFFF"], "props too paint with the palette and white");
  assert.ok(home.includes("var(--character-1)") && home.includes("var(--character-2)") && home.includes("var(--character-3)"), "the tie, the case and its latches in the three");
});

test("the three destinations have their scenes, and the sheet is served only in the laboratory", () => {
  const gifts = renderToStaticMarkup(createElement(Scene, { which: "gifts" }));
  assert.equal((gifts.match(/data-part="figure"/g) ?? []).length, 2, "two figures on Gifts");
  assert.ok(gifts.includes('data-pose="shoulder"'), "one with an arm on the other's shoulder");
  assert.ok(renderToStaticMarkup(createElement(Scene, { which: "home" })).includes('data-prop="case"'));
  assert.ok(renderToStaticMarkup(createElement(Scene, { which: "me" })).includes('data-prop="shades"'));
  const page = readFileSync("app/dev/looks/character/page.tsx", "utf8");
  assert.match(page, /await requireLab\(\);/, "the laboratory's door");
  for (const section of ["Turnaround", "Expressions", "Poses", "The three destinations"]) assert.ok(page.includes(section), section);
  const css = readFileSync("app/globals.css", "utf8");
  assert.equal((css.match(/--character-hero-edge-light: #/g) ?? []).length, 3, "the edge's light, by day and in both night blocks");
  assert.equal((css.match(/--character-hero-edge-deep: #/g) ?? []).length, 3);
});
