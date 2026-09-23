import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "./Character";
import { characterKey, REFERENCED_DRAWINGS } from "./character-key";

/**
 * The file every named character is drawn from (D206): each drawing once, as a `<symbol>` with no box of its own, so
 * the page's `<svg>` places it exactly where the drawing written into the page would stand. Its colours are the look's
 * variables, which a named drawing inherits from the page: day and night, measured identical pixel for pixel to the
 * drawing written into the page, in Chromium and in WebKit (23 Sep 2026).
 *
 * Written by `pnpm make:characters`, which also writes its version; `test/character-file.test.ts` refuses a file that
 * is not what the drawings make today, so a drawing changed in `Character.tsx` cannot be shipped without its file.
 */
function symbolOf(state: Parameters<typeof characterKey>[0], shadow: boolean, variant: number, tone: Parameters<typeof characterKey>[3]): string {
  const markup = renderToStaticMarkup(createElement(Character, { state, variant, tone, size: shadow ? "large" : "small", standing: shadow, drawn: "inline" }));
  const inside = markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<symbol id="${characterKey(state, shadow, variant, tone)}" style="overflow:visible">${inside}</symbol>`;
}

export function charactersFile(): string {
  const symbols: string[] = [];
  for (const { state, variant, tone } of REFERENCED_DRAWINGS) {
    // Standing on its shadow is only ever the large character of the range; the gift of the hero and sun tones never is.
    const shadows = tone === "range" ? [false, true] : [false];
    for (const shadow of shadows) symbols.push(symbolOf(state, shadow, variant, tone));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${symbols.join("")}</svg>\n`;
}

export function charactersVersion(file: string): string {
  return createHash("sha256").update(file).digest("hex").slice(0, 12);
}
