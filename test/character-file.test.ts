import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "../app/kit/Character";
import { CHARACTERS_FILE } from "../app/kit/character-file";
import { characterKey, faceOf, REFERENCED_DRAWINGS } from "../app/kit/character-key";
import { charactersFile, charactersVersion } from "../app/kit/character-sprite";
import { characterSvg } from "../app/kit/character-svg";

/**
 * The named characters (D206): the file is what the drawings make today, the address carries its version, a character
 * that does not move is named rather than written, and every character whose parts move is written into the page.
 */

test("the file is what the drawings make today, and the address the screens use names its version", () => {
  const file = charactersFile();
  assert.equal(readFileSync("public/characters.svg", "utf8"), file, "run pnpm make:characters after changing a drawing");
  assert.equal(CHARACTERS_FILE, `/characters.svg?v=${charactersVersion(file)}`);
  const ids = [...file.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "each drawing once");
  for (const { state, variant, tone } of REFERENCED_DRAWINGS) assert.ok(ids.includes(characterKey(state, false, variant, tone)), `${state} ${variant} ${tone}`);
  assert.ok(!file.includes("viewBox"), "a symbol has no box of its own: the page's svg places it");
  assert.ok(!file.includes("diamond"), "the diamond's blend reads the look's colours in its own gradient, so it is always written");
});

test("a character that does not move names its drawing, and names one the file holds", () => {
  const ids = new Set([...charactersFile().matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));
  for (const state of ["toCome", "today", "catchable", "earned", "returned", "gift"] as const) {
    for (const variant of [0, 1, 2, 3, 4, 5, 7, -1]) {
      for (const [size, standing] of [["small", false], ["large", false], ["large", true]] as const) {
        const html = renderToStaticMarkup(createElement(Character, { state, variant, size, standing }));
        const named = /<use href="([^"]+)"/.exec(html)?.[1];
        assert.ok(named, `${state} is named`);
        assert.ok(named.startsWith(`${CHARACTERS_FILE}#`));
        assert.ok(ids.has(named.slice(named.indexOf("#") + 1)), `${named} is in the file`);
        assert.ok(!html.includes("data-part"), "a named drawing carries no part of its own");
      }
    }
  }
  assert.equal(faceOf("earned", 7), 1);
  assert.equal(faceOf("today", -1), 2);
  const diamond = renderToStaticMarkup(createElement(Character, { state: "diamond", tone: "sun" }));
  assert.ok(!diamond.includes("<use") && diamond.includes('data-part="figure"'), "the diamond is always written");
});

test("written into the page and named, the same character is the same drawing", () => {
  for (const { state, variant, tone } of REFERENCED_DRAWINGS) {
    const inline = renderToStaticMarkup(createElement(Character, { state, variant, tone, size: "small", standing: false, drawn: "inline" }));
    const symbol = new RegExp(`<symbol id="${characterKey(state, false, variant, tone)}" style="overflow:visible">(.*?)</symbol>`).exec(charactersFile())?.[1];
    assert.equal(symbol, inline.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, ""), `${state} ${variant} ${tone}`);
  }
});

test("every character whose parts move is written into the page", () => {
  const row = readFileSync("app/kit/DayRow.tsx", "utf8");
  assert.match(row, /drawn=\{characterOf\(state\) === "earned" \|\| characterOf\(state\) === "returned" \? "inline" : "referenced"\}/, "the row of a gift's page writes only the days that move (D216)");
  assert.match(readFileSync("app/kit/DayStrip.tsx", "utf8"), /drawn=\{characterOf\(day\) === "earned" \|\| characterOf\(day\) === "returned" \? "inline" : "referenced"\}/, "the days that jump or leave in an arrival");
  assert.match(readFileSync("app/components/PayGift.tsx", "utf8"), /<Success>\s*<Character state="gift" drawn="inline"/, "the gift answering a payment");
  assert.match(characterSvg("gift"), /data-part="figure"/, "the picture drawn on the server writes the drawing, since it has no page to read a file from");
  assert.match(readFileSync("app/layout.tsx", "utf8"), /preload\(CHARACTERS_FILE, \{ as: "image"/, "the file is asked for in the head");
  assert.match(readFileSync("next.config.mjs", "utf8"), /source: "\/characters\.svg", headers: \[\{ key: "Cache-Control", value: "public, max-age=31536000, immutable" \}\]/);
});
