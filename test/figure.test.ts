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
  assert.ok(!("rims" in shine), "no rim along the far edges: it read as a stray line (D237)");
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
  for (const part of ["figure", "limbs", "body", "gloss", "face", "eyes", "gaze", "mouth", "arm", "leg"]) assert.ok(plain.includes(`data-part="${part}"`), part);
  assert.ok(!plain.includes('data-part="rim"'), "no rim (D237)");
  assert.match(plain, /stroke:url\(#t-edge\)/, "the edge is a gradient of its own colour");
  assert.ok(plain.includes("var(--character-hero-edge-light)") && plain.includes("var(--character-hero-edge-deep)"));
  assert.match(plain, /<ellipse[^>]*transform="rotate\(-28\.?\d* /, "the gloss slants along the lit edge");
  const colours = new Set(plain.match(/#[0-9A-Fa-f]{6}\b/g) ?? []);
  assert.deepEqual([...colours], [], "every colour a token of the character's, and white only as rgba for what shines");
  assert.doesNotMatch(plain, /--accent/, "never the sun");
  // Faces and poses are sets, each named on the drawing.
  const shades = renderToStaticMarkup(createElement(Figure, { id: "s", eyes: "shades", mouth: "grin", arms: "crossed", legs: "apart" }));
  assert.ok(shades.includes('data-prop="shades"') && !shades.includes('data-part="eye"'), "shades replace the eyes");
  const glasses = shades.slice(shades.indexOf('data-prop="shades"'), shades.indexOf("</g>", shades.indexOf('data-prop="shades"')));
  assert.equal((glasses.match(/<rect/g) ?? []).length, 3, "two lenses and a bridge, no temples, no streak (D237)");
  assert.doesNotMatch(glasses, /rgba\(255, 255, 255/, "nothing shines on the lenses");
  assert.ok(shades.includes('data-pose="crossed"') && shades.includes('data-pose="apart"'));
  const closed = renderToStaticMarkup(createElement(Figure, { id: "c", eyes: "closed", mouth: "o" }));
  assert.equal((closed.match(/<rect data-part="eye"/g) ?? []).length, 2, "closed eyes are the pills an open eye can grow from");
  assert.ok(closed.includes('data-part="mouth"'));
  const home = renderToStaticMarkup(createElement(Figure, { id: "h", arms: "hold", props: ["suit", "case"] }));
  assert.ok(home.includes('data-prop="suit"') && home.includes('data-prop="case"') && home.includes('data-pose="hold"'));
  // The arm that holds the case ends in its handle: one hand drawn, the left one, and no ball on the handle (D237).
  const holding = home.slice(home.indexOf('data-part="limbs"'), home.indexOf('data-part="body"'));
  assert.equal((holding.match(/<circle/g) ?? []).length, 1, "one hand");
  const half = renderToStaticMarkup(createElement(Figure, { id: "z", eyes: "half", mouth: "o" }));
  assert.match(half, /a2\.8 1\.4 0 0 1 -5\.6 0 Z/, "a lid that droops in a curve, not a straight line that frowns (D237)");
  assert.deepEqual([...new Set(home.match(/#[0-9A-Fa-f]{6}\b/g) ?? [])], [], "props too paint with the palette, and white only as rgba");
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

test("the three destinations carry their scenes at the head, larger, and a change of page is a movement, once", () => {
  const head = readFileSync("app/kit/HeadCharacter.tsx", "utf8");
  assert.match(head, /scene \? <Scene which=\{scene\} className=\{`h-auto shrink-0 \$\{scene === "gifts" \? "w-\[192px\]" : "w-\[104px\]"\}`\} \/> : <Character state="diamond"/, "the scene on a destination, the plain diamond elsewhere");
  assert.match(head, /let aHeadWasDrawn = false;/, "whether a head stood on a screen before this one in this tab");
  assert.match(head, /if \(!scene \|\| !arrives \|\| !stage \|\| reduced\(\)\) return;/, "a cold load and a device asking for less show the final state from the first image");
  assert.match(head, /'\[data-part="arm"\]:not\(\[data-pose="rest"\]\)'/, "the raised arms come out");
  // Along their own curve from the joint, whatever direction it runs (D241): the arm on the shoulder lies sideways.
  assert.match(head, /strokeDashoffset: 1 \}, \{ strokeDasharray: "1 1", strokeDashoffset: 0 \}/, "drawn out along the path");
  assert.doesNotMatch(head, /scaleY/, "never stretched on one axis");
  const gifts = renderToStaticMarkup(createElement(Scene, { which: "gifts" }));
  assert.match(gifts, /data-pose="shoulder"[^>]*><path data-part="reach" d="M51 26 C57 24\.5 65 19\.5 72 16\.5" pathLength="1"/, "the path starts at the joint");
  assert.match(head, /"\[data-prop\]"/, "and the props grow from their middle");
  assert.doesNotMatch(head, /setInterval|iterations: Infinity/, "nothing on a clock, nothing loops");
  for (const [file, scene] of [["app/kit/Home.tsx", "home"], ["app/kit/Gifts.tsx", "gifts"], ["app/kit/Me.tsx", "me"]] as const) {
    assert.ok(readFileSync(file, "utf8").includes(`<HeadCharacter scene="${scene}" />`), `${scene} carries its scene`);
  }
  for (const file of ["app/components/GiftPage.tsx", "app/cash-out/page.tsx", "app/kit/offer/PaySheet.tsx"]) {
    assert.ok(readFileSync(file, "utf8").includes("<HeadCharacter />"), `${file} keeps the plain diamond`);
  }
});
