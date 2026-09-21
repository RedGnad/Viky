import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { characterSvg } from "../app/kit/character-svg";
import { COLOURS } from "../src/design-tokens";

/**
 * The app's icon and the gift's drawing, written once into files (the art direction brief of 17 Sep 2026, section 7
 * bis). The icon is the head character, the diamond, on the ink tile a phone rounds itself (D135), filling the whole
 * width of it (D141, after 0.74 and 0.92 both read as a small drawing in a large square); the gift's own drawing stays the gift, because what
 * it is used for is the picture under a gift's link. It is the third place a person meets Viky, after the link
 * preview and the morning message, and the first they see every day on their home screen.
 *
 * Run it whenever the look or the character changes: `pnpm make:icon`. It writes the sizes the manifest and the phones
 * ask for, app/icon.png, which is the one a browser tab reads, and app/kit/gift-hero.svg, which the link preview image
 * draws on the server. That file is written rather than rendered at request time because a route may not import
 * react-dom/server; test/character.test.ts fails if it drifts from the component.
 */

/** A .ico file around a PNG, which is what a browser asking for /favicon.ico still accepts. */
function icoAround(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

/**
 * How much of the tile the drawing takes (D141). All of it, except on the icon a phone is allowed to crop: a
 * maskable icon may be cut to a circle, and the meaning has to sit inside that circle: a shape this wide at 0.8 of
 * the square would have its two points on the circle's edge, so that one is drawn at 0.7 and every other at 1.
 */
const FILLS: Readonly<Record<string, number>> = { "public/icons/android-chrome-192x192.png": 0.7 };
const FULL = 1;

const SIZES = [
  { file: "public/icons/icon-512x512.png", size: 512 },
  { file: "public/icons/android-chrome-192x192.png", size: 192 },
  { file: "public/icons/apple-touch-icon.png", size: 180 },
  { file: "app/icon.png", size: 512 },
  { file: "app/apple-icon.png", size: 180 },
  { file: "public/icons/icon-64x64.png", size: 64 },
];

async function main() {
  // The link preview keeps the gift, because what it previews is a gift. The icon is the head of the page, which is
  // the diamond since D131, and a phone's home screen shows what the product looks like at night (D135).
  const gift = characterSvg("gift", { tone: "hero" });
  writeFileSync(resolve("app/kit/gift-hero.svg"), `${gift}\n`);
  console.log("app/kit/gift-hero.svg");
  const svg = characterSvg("diamond", { tone: "sun", appearance: "dark" });
  const browser = await chromium.launch();
  try {
    for (const { file, size } of SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><body style="margin:0;width:${size}px;height:${size}px;background:${COLOURS.dark.background};display:flex;align-items:center;justify-content:center">` +
          `<div style="width:${Math.round(size * (FILLS[file] ?? FULL))}px">${svg}</div></body>`,
      );
      const picture = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
      await page.close();
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(resolve(file), picture);
      console.log(`${file}  ${size}x${size}`);
      if (size === 64) {
        writeFileSync(resolve("public/favicon.ico"), icoAround(picture, size));
        console.log("public/favicon.ico  64x64");
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("MAKE_ICON_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
