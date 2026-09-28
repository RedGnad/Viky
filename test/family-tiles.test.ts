import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FamilyArt } from "../app/kit/FamilyArt";
import { FAMILIES } from "../src/conditions";
import { OFFER } from "../src/sentences";

/**
 * The chooser's first face from six conditions (D224): four tiles, one per family, each a picture of the diamond in
 * that family's situation, opening that family's list; and the way back to the four above a family's list.
 */

test("each family has its picture: the rig doing the family's thing, the thing in the figure's own material (D268)", () => {
  const props: Record<string, string> = { learn: "book", exam: "cap", play: "rook", move: "speed" };
  for (const family of FAMILIES) {
    const art = renderToStaticMarkup(createElement(FamilyArt, { family: family.id }));
    assert.ok(art.includes('data-character="diamond"') && art.includes('data-part="halftone"'), `${family.id} is the rig, with its halftone`);
    assert.ok(art.includes(`data-prop="${props[family.id]}"`), `${family.id} has its thing`);
    assert.ok(art.includes(`id="family-${family.id}-body"`), "ids of its own, so four figures on one sheet keep their gradients");
    assert.ok(!/<polygon|<line |<polyline/.test(art), "round joins and caps only: nothing pointed");
    assert.ok(art.includes('aria-hidden="true"'), "a picture beside a word, never read aloud");
  }
  // Each family's figure does its thing.
  const reader = renderToStaticMarkup(createElement(FamilyArt, { family: "learn" }));
  // The arms leave from under the body and pass behind the book; only the hands close over it (D302).
  assert.ok(reader.includes('data-pose="read"') && reader.indexOf('data-pose="read"') < reader.indexOf('data-prop="book"'), "the arms behind the book");
  assert.ok(reader.lastIndexOf('data-part="hand"') > reader.indexOf('data-prop="book"'), "the hands close over the book held in front");
  assert.ok(renderToStaticMarkup(createElement(FamilyArt, { family: "exam" })).includes('data-pose="wave"'), "a wave under the cap");
  assert.ok(renderToStaticMarkup(createElement(FamilyArt, { family: "play" })).includes('data-pose="hold"'), "the rook at its hand");
  const runner = renderToStaticMarkup(createElement(FamilyArt, { family: "move" }));
  assert.ok(runner.includes('data-pose="run"') && runner.includes("transform:rotate(-8deg)"), "the runner in its stride, leaning into it");
  assert.ok(runner.indexOf('data-prop="speed"') < runner.indexOf('data-part="figure"'), "the speed lines outside the group that leans");
  // No CSS rotation on the tile's own elements: that made a layer of its own on Android (D249).
  assert.doesNotMatch(readFileSync("app/kit/FamilyArt.tsx", "utf8"), /rotate\(-?\d+deg\)/);
});

test("the chooser opens on the four tiles from six conditions, every time, and the way back leads to them", () => {
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.ok(sheet.indexOf("<FamilyArt family={section.family} />") > 0, "a picture on every tile");
  assert.match(sheet, /grid grid-cols-2 gap-\[var\(--space-md\)\]/, "two by two");
  assert.match(sheet, /const shownSection = sections\?\.find\(\(section\) => section\.family === family\);/, "a family's list only once a tile was pressed");
  assert.match(sheet, /setFamily\(null\);\n\s*setPressedDone\(false\);\n\s*\}\n\s*\}/, "every opening starts on the four (D233), with nothing said yet about Done");
  // The way back to the four is an arrow above a family's list, named for a reader (D304); each condition is a button
  // with the card's chevron, since pressing one goes on to its questions.
  assert.match(sheet, /<button type="button" aria-label=\{W\.families\} className=\{`\$\{INLINE_BUTTON\} self-start`\} onClick=\{\(\) => setFamily\(null\)\}>/, "the way back to the four above a family's list");
  assert.match(sheet, /onClick=\{\(\) => choose\(option\.id\)\}/);
  assert.match(sheet, /aria-current=\{chosen \? "true" : undefined\}/, "the one on the card is marked");
  // From a condition's questions, an arrow back to the list it was chosen in, the screen before (the founder, 28 Sep
  // 2026, over D233's way back to the four).
  assert.match(sheet, /aria-label=\{W\.change\(W\.slots\.will\.label\)\}[\s\S]{0,120}setFamily\(condition\.family\);\n\s*setAskedFor\("list"\);/);
  assert.doesNotMatch(sheet, /W\.choices/, "no count on a tile (the founder, 28 Sep 2026)");
  const tiles = sheet.slice(sheet.indexOf('<div className="grid grid-cols-2'), sheet.indexOf("</div>", sheet.indexOf('<div className="grid grid-cols-2')));
  assert.doesNotMatch(tiles, /aria-current|holds \?/, "nothing marks a tile: pressing it is the choice");
  assert.match(sheet, /onClick=\{\(\) => setFamily\(section\.family\)\} className=\{TILE\}>/, "a tile is the button it looks like");
  assert.ok(sheet.indexOf("sections ? (") < sheet.indexOf("<FamilyArt"), "only from six conditions: under that the flat list stays");
  assert.equal(OFFER.families, "All families");
  const ui = readFileSync("app/components/ui.ts", "utf8");
  assert.match(ui, /export const TILE = `\$\{FOCUS\} \$\{OUTLINE\} \$\{RELIEF\} flex min-h-\[var\(--tap-target\)\][^`]*bg-\[var\(--tonal\)\]/, "a tile is a tap target with the focus ring, the outline, the relief and the tonal fill of a key (D233)");
});

