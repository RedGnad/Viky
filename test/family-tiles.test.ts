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

test("each family has its picture: the diamond in its situation, the props in the paper's ink, the runner's limbs in a stride", () => {
  const props: Record<string, string> = { learn: "book", exam: "cap", play: "rook", move: "dash" };
  for (const family of FAMILIES) {
    const art = renderToStaticMarkup(createElement(FamilyArt, { family: family.id }));
    assert.ok(art.includes('data-character="diamond"'), `${family.id} has the diamond`);
    assert.ok(art.includes(`data-prop="${props[family.id]}"`), `${family.id} has its prop`);
    const prop = art.match(/<svg data-prop="[^"]+"[\s\S]*?<\/svg>/)?.[0] ?? "";
    assert.ok(prop.length > 0 && !prop.includes("var(--character-"), "the prop paints with the paper's ink, never the character's palette");
    assert.ok(!/<polygon|<line |<polyline/.test(art), "round joins and caps only: nothing pointed");
    assert.ok(art.includes('aria-hidden="true"'), "a picture beside a word, never read aloud");
  }
  const runner = renderToStaticMarkup(createElement(FamilyArt, { family: "move" }));
  assert.ok(runner.includes('data-part="arm"') && /transform:rotate\(75deg\)/.test(runner) && /transform:rotate\(-15deg\)/.test(runner), "the runner has its limbs out, turned from their joints");
  assert.ok(runner.includes("transform:rotate(-8deg)"), "and leans into the stride");
  const reader = renderToStaticMarkup(createElement(FamilyArt, { family: "learn" }));
  assert.ok(!reader.includes('data-part="arm"'), "the others keep the head alone");
});

test("the chooser opens on the four tiles from six conditions, or on the family of the condition the card carries", () => {
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.ok(sheet.indexOf("<FamilyArt family={section.family} />") > 0, "a picture on every tile");
  assert.match(sheet, /grid grid-cols-2 gap-\[var\(--space-md\)\]/, "two by two");
  assert.match(sheet, /const shownFamily = family === "all" \? null : \(family \?\? condition\?\.family \?\? null\);/, "the chosen condition's family, or the four");
  assert.match(sheet, /setFamily\(null\);\n\s*\}\n\s*\}/, "every opening starts undecided");
  assert.match(sheet, /<button type="button" className=\{INLINE_BUTTON\} onClick=\{\(\) => setFamily\("all"\)\}>\n\s*\{W\.families\}/, "the way back to the four above a family's list");
  assert.match(sheet, /\{W\.choices\(section\.conditions\.length\)\}/, "what each tile holds, counted");
  assert.match(sheet, /aria-current=\{holds \? "true" : undefined\}/, "the tile holding the card's condition is marked");
  assert.ok(sheet.indexOf("sections ? (") < sheet.indexOf("<FamilyArt"), "only from six conditions: under that the flat list stays");
  assert.equal(OFFER.families, "All families");
  assert.equal(OFFER.choices(1), "1 choice");
  assert.equal(OFFER.choices(6), "6 choices");
  const ui = readFileSync("app/components/ui.ts", "utf8");
  assert.match(ui, /export const TILE = `\$\{FOCUS\} flex min-h-\[var\(--tap-target\)\]/, "a tile is a tap target with the focus ring");
});
