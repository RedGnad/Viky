import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { figureInLook, ICON_FIGURE, iconModule, PREVIEW_FIGURE } from "./look-figure";
import { COLOURS } from "../src/design-tokens";

/**
 * The app's icon and the link previews' figure, written once into files (the art direction brief of 17 Sep 2026,
 * section 7 bis). The icon is the head character on the ink tile a phone rounds itself (D135), filling the whole width
 * of it (D141, after 0.74 and 0.92 both read as a small drawing in a large square). The link previews draw the standing
 * figure by day (D265), where they drew the gift until then. The icon is the first thing a person sees of Viky every
 * day on their home screen.
 *
 * Run it whenever the look or the character changes: `pnpm make:icon`. It writes the sizes the manifest and the phones
 * ask for, app/icon.png, which is the one a browser tab reads, and app/kit/figure-day.svg, which the link preview images
 * draw on the server. That file is written rather than rendered at request time because a route may not import
 * react-dom/server; test/figure.test.ts fails if it drifts from the component.
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
 * maskable icon may be cut to a circle whose diameter is 80 per cent of the square, and the two points of a diamond
 * are its farthest pixels: at 0.78 of the square they sit just inside that circle, which is as large as a shape this
 * wide can be drawn there. Everything else is drawn at 1, because nothing crops it.
 */
// Every icon at its largest (D307, the founder, 28 Sep 2026: "the biggest"), the maskable ones included; a launcher that
// crops to a circle may cut the diamond's two points, which was the price the founder chose.
const FILLS: Readonly<Record<string, number>> = {};
const FULL = 1;

/**
 * The icons a browser tab shows, app/icon.png and the 64 the .ico is made of, are the character alone on nothing (the
 * founder, 29 Sep 2026): a tab has its own ground. The ones a phone puts on a home screen keep their tile, because iOS
 * fills what is transparent with black and a maskable icon must cover its square.
 */
const SIZES: readonly Readonly<{ file: string; size: number; transparent?: boolean }>[] = [
  { file: "public/icons/icon-512x512.png", size: 512 },
  { file: "public/icons/android-chrome-192x192.png", size: 192 },
  { file: "public/icons/apple-touch-icon.png", size: 180 },
  { file: "app/icon.png", size: 512, transparent: true },
  { file: "app/apple-icon.png", size: 180 },
  { file: "public/icons/icon-64x64.png", size: 64, transparent: true },
  // The one a launcher crops, at the size it wants: Android prefers the largest maskable icon, and upscaling the
  // 192 for a 512 slot is what made the icon on the founder's home screen look small and soft (D142).
  { file: "public/icons/icon-512-maskable.png", size: 512 },
];

async function main() {
  // The rig's head (D236, D253), in the day look on the day's lavender (D307, the founder, 28 Sep 2026: the day version
  // rather than the night one), its colours read from the stylesheet's own day block so the icon can never keep a
  // colour the screens have left behind.
  // The landing's own figure (D307): its soft smile and its halftone, as HeroMoment draws it, the head alone.
  const svg = figureInLook("light", ICON_FIGURE);
  // The figure of the link previews, by day, standing (D265): the preview route may not import react-dom/server.
  writeFileSync(resolve("app/kit/figure-day.svg"), `${figureInLook("light", PREVIEW_FIGURE)}\n`);
  console.log("app/kit/figure-day.svg");
  // The icon's own drawing for the installed app's first opening (src/launch-intro.ts): painted in the page's first
  // image, so it is written in rather than fetched.
  writeFileSync(resolve("app/kit/figure-icon.ts"), iconModule());
  console.log("app/kit/figure-icon.ts");
  const browser = await chromium.launch();
  try {
    for (const { file, size, transparent } of SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><body style="margin:0;width:${size}px;height:${size}px;background:${transparent ? "transparent" : COLOURS.light.background};display:flex;align-items:center;justify-content:center">` +
          `<div style="width:${Math.round(size * (FILLS[file] ?? FULL))}px">${svg}</div></body>`,
      );
      const picture = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: Boolean(transparent) });
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
