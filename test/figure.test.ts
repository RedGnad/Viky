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
  assert.ok(!("sparkle" in shine), "no spot inside the gloss: it read as a second, lighter circle (D243)");
  const face = renderToStaticMarkup(createElement(Figure, { id: "f" }));
  const gloss = face.slice(face.indexOf('data-part="gloss"'), face.indexOf("</g>", face.indexOf('data-part="gloss"')));
  assert.equal((gloss.match(/<ellipse/g) ?? []).length, 1, "the gloss");
  assert.equal((gloss.match(/<circle/g) ?? []).length, 1, "and one dot beside it, nothing inside it");
  for (const mouth of ["smile", "grin"] as const) {
    const drawn = renderToStaticMarkup(createElement(Figure, { id: "m", mouth }));
    const lips = drawn.slice(drawn.indexOf('data-part="mouth"'), drawn.indexOf("</g>", drawn.indexOf('data-part="mouth"')));
    assert.equal((lips.match(/<path/g) ?? []).length, 1, `${mouth}: one shape, no pale arc inside it (D243)`);
    assert.match(lips, /stroke-linejoin:round/, `${mouth}: the corners rounded, not pointed`);
    assert.doesNotMatch(lips, /rgba\(255/, `${mouth}: nothing shines inside the mouth`);
  }
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
  // The two hands of the crossed arms at one height (D244).
  const hands = [...shades.matchAll(/data-part="hand" cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => Number(m[2]));
  assert.equal(hands.length, 2);
  assert.equal(hands[0], hands[1], "no lopsided figure");
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
  assert.match(head, /strokeDashoffset: 1\.1 \}, \{ strokeDasharray: "1 2", strokeDashoffset: 0 \}/, "drawn out along the path");
  assert.doesNotMatch(head, /scaleY/, "never stretched on one axis");
  const gifts = renderToStaticMarkup(createElement(Scene, { which: "gifts" }));
  assert.match(gifts, /data-pose="shoulder"[^>]*><path data-part="reach" d="M51 26 C57 24\.5 65 19\.5 72 16\.5" pathLength="1"/, "the path starts at the joint");
  assert.match(head, /'\[data-prop="suit"\]'/, "the suit grows onto the body");
  assert.match(head, /duration: SUIT_MS, easing: EASING\.emphasizedDecelerate/, "slower, on the curve for what enters (D245)");
  assert.match(head, /const SUIT_MS = 350;/);
  assert.match(head, /'\[data-prop="case"\]'[\s\S]*?rotate\(-40deg\)[\s\S]*?rotate\(0deg\)/, "the case swings into the hand");
  assert.match(head, /'\[data-prop="shades"\]'/, "the sunglasses come down onto the eyes");
  // The blink of 25 Sep 2026 (D243): started after the paint, the first image was the scene complete. Before it, always.
  assert.match(head, /useLayoutEffect\(\(\) => \{\n\s*aHeadWasDrawn = true;/);
  assert.doesNotMatch(head, /useEffect\(/, "no arrival may start after the first paint");
  assert.doesNotMatch(head, /data-part="figure"/, "the figure rides the row's own entrance, and fades only once");
  assert.doesNotMatch(head, /setInterval|iterations: Infinity/, "nothing on a clock, nothing loops");
  for (const [file, scene] of [["app/kit/Home.tsx", "home"], ["app/kit/Gifts.tsx", "gifts"], ["app/kit/Me.tsx", "me"]] as const) {
    assert.ok(readFileSync(file, "utf8").includes(`<HeadCharacter scene="${scene}" />`), `${scene} carries its scene`);
  }
  for (const file of ["app/components/GiftPage.tsx", "app/cash-out/page.tsx", "app/kit/offer/PaySheet.tsx"]) {
    assert.ok(readFileSync(file, "utf8").includes("<HeadCharacter />"), `${file} keeps the plain diamond`);
  }
});

test("the app's icon is the rig's head, in the stylesheet's own night colours (D253)", () => {
  const head = renderToStaticMarkup(createElement(Figure, { id: "icon", limbs: false }));
  assert.ok(!head.includes('data-part="arm"') && !head.includes('data-part="leg"'), "no limbs on the head alone");
  assert.match(head, /viewBox="0 0 64 40"/, "its box stops at the diamond");
  const script = readFileSync("scripts/make-icon.ts", "utf8");
  assert.match(script, /figureInLook\("dark", \{ id: "icon", limbs: false \}\)/);
  assert.match(readFileSync("scripts/look-figure.ts", "utf8"), /':root\[data-theme="dark"\] \{'/, "the night values read from the stylesheet, never copied by hand");
  assert.doesNotMatch(script, /#3B3266/, "the night edge of D135 is not kept in the script");
});

test("the landing's figure wears a fine halftone in the body's own colour, drawn light (D260)", () => {
  const plain = renderToStaticMarkup(createElement(Figure, { id: "p" }));
  assert.ok(!plain.includes('data-part="halftone"'), "off unless asked");
  const screened = renderToStaticMarkup(createElement(Figure, { id: "s", halftone: true }));
  const part = screened.slice(screened.indexOf('data-part="halftone"'), screened.indexOf("</g>", screened.indexOf('data-part="halftone"')));
  // No blend mode and no group opacity (D263): on a phone an animated figure is its own layer, and a multiply there
  // blended against nothing. The colour a multiply gave is computed, and each dot carries its own 45 %.
  assert.doesNotMatch(screened, /mix-blend-mode|mixBlendMode/);
  assert.match(part, /stroke:var\(--character-halftone\);stroke-opacity:0\.45/, "the body's deeper colour, never the ink");
  const css = readFileSync("app/globals.css", "utf8");
  assert.equal((css.match(/--character-halftone: #/g) ?? []).length, 3, "day and both night blocks");
  const strokes = [...part.matchAll(/<path d="([^"]*)" style="fill:none;stroke:var\(--character-halftone\);stroke-opacity:0\.45;stroke-width:([\d.]+)/g)];
  assert.equal(strokes.length, 8, "eight paths, one per size");
  const widths = strokes.map((m) => Number(m[2]));
  assert.ok(widths.every((w, i) => i === 0 || w > widths[i - 1]), "growing away from the light");
  const dots = strokes.reduce((sum, m) => sum + (m[1].match(/h0/g) ?? []).length, 0);
  assert.ok(dots > 250 && dots < 700, `${dots} dots`);
  assert.ok(part.length < 20_000, `a few kilobytes: ${part.length}`);
  assert.ok(widths[0] < 0.25 && widths[7] > 1, "a little less fine since D261: from about 0.2 to 1.1 across");
});

test("the three destinations' figures wear the same halftone as the landing's (D262)", () => {
  for (const which of ["home", "gifts", "me"] as const) {
    const scene = renderToStaticMarkup(createElement(Scene, { which }));
    const figures = (scene.match(/data-part="figure"/g) ?? []).length;
    assert.equal((scene.match(/data-part="halftone"/g) ?? []).length, figures, `${which}: every figure`);
  }
  // No clip (D288): a phone painted the clipped screen apart inside a sheet's list. The dots stop at the diamond's edge
  // by where they are placed, and none is out beyond it or on a rounded tip.
  const gifts = renderToStaticMarkup(createElement(Scene, { which: "gifts" }));
  assert.doesNotMatch(gifts, /clipPath|clip-path/);
  const dots = [...renderToStaticMarkup(createElement(Figure, { id: "d", halftone: true })).matchAll(/M([\d.]+) ([\d.]+)h0/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(dots.length > 200);
  for (const [x, y] of dots) assert.ok(Math.abs(x - 32) / 29 + Math.abs(y - 20) / 16 <= 1 && Math.abs(x - 32) <= 25.5 && Math.abs(y - 20) <= 14, `${x} ${y}`);
});

test("every link to Viky carries the same picture, the day's figure on the paper card (D265)", async () => {
  const { figureInLook, lookValues, PREVIEW_FIGURE } = await import("../scripts/look-figure");
  // The file the routes draw is what the component draws, in the day look: run pnpm make:icon when either changes.
  assert.equal(readFileSync("app/kit/figure-day.svg", "utf8").trim(), figureInLook("light", PREVIEW_FIGURE), "run pnpm make:icon");
  assert.equal(PREVIEW_FIGURE.halftone, true, "the halftone every figure wears");
  // The picture's colours are the day look's own.
  const { PREVIEW_LOOK } = await import("../app/og/preview");
  const day = lookValues("light");
  assert.deepEqual(
    { ground: day["--background"], ink: day["--text"], paper: day["--paper"], onPaper: day["--on-surface"], quiet: day["--on-surface-muted"], edge: day["--card-placed-edge"] },
    { ...PREVIEW_LOOK },
  );
  // The gift's link and the site's draw with the same layout; the site's says the landing's promise.
  assert.match(readFileSync("app/api/gift/[id]/preview-image/route.tsx", "utf8"), /return previewImage\(\{ title: preview\.title, under: preview\.description/);
  assert.match(readFileSync("app/opengraph-image.tsx", "utf8"), /previewImage\(\{ title: HOME\.promise, under: HOME\.promiseUnder/);
  assert.match(readFileSync("app/layout.tsx", "utf8"), /const APP_DESCRIPTION = `\$\{HOME\.promise\} \$\{HOME\.promiseUnder\}`;/);
  const config = readFileSync("next.config.mjs", "utf8");
  assert.match(config, /"\/opengraph-image": \["\.\/app\/fonts\/\*\.ttf", "\.\/app\/kit\/figure-day\.svg"\]/, "the files travel with the route");
});

test("the preview's card grows with its words, the figure always on its edge (D266)", () => {
  const preview = readFileSync("app/og/preview.tsx", "utf8");
  assert.match(preview, /flexDirection: "column", justifyContent: "flex-end"/, "the figure and the card one column from the foot");
  assert.match(preview, /minHeight: 230,/, "the card at least its height, taller when the words need it");
  assert.doesNotMatch(preview, /bottom: 230/, "never a figure fixed above a card of a fixed height");
  assert.match(readFileSync("app/api/gift/[id]/preview-image/route.tsx", "utf8"), /description: LONGEST_LINE/, "the gallery draws the longest line there is");
});
