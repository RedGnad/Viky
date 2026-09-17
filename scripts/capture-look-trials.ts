import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chromium, devices, type Browser } from "@playwright/test";
import { LOOKS, NIGHT_SUN_TRIALS } from "../src/design-tokens";
import { board, claimFolder, pngSize, settle } from "./capture-looks";

/**
 * The two trials on look 2, chosen by the founder on 17 Sep 2026, before it is finished across the product:
 * 1. the sun at night: the three candidates of NIGHT_SUN_TRIALS side by side, with the day beside them for the hue, on
 *    the page without an account, Home and a gift's page, at 390x844 and 1440x900;
 * 2. the link preview image in two versions, on the ground and on the sun.
 *
 * Run against a built app with the design gallery switched on:
 *   pnpm build && VIKY_DESIGN_GALLERY=1 pnpm start --port 3107
 *   pnpm looks:trials http://127.0.0.1:3107
 *
 * The run fails if a screen does not answer, does not see the appearance asked for, or does not wear the sun it was
 * asked to try: the accent is read back from the page itself.
 */

const LOOK = "ink-sun";
const SCREENS = [
  { id: "welcome", name: "Without an account" },
  { id: "home", name: "Home, with two gifts" },
  { id: "gift", name: "A gift's page" },
] as const;
const SIZES = [
  { name: "390", viewport: { width: 390, height: 844 }, device: devices["Pixel 7"], scale: 1 },
  { name: "1440", viewport: { width: 1440, height: 900 }, device: devices["Desktop Chrome"], scale: 0.5 },
] as const;

type Column = { key: string; caption: string; colorScheme: "light" | "dark"; sun?: string; expected: string };

const sun = LOOKS.find((look) => look.id === LOOK);
if (!sun) throw new Error("look 2 is missing from the tokens");

const COLUMNS: Column[] = [
  { key: "day", caption: `Day, for the hue: ${sun.colours.light.accent}`, colorScheme: "light", expected: sun.colours.light.accent },
  ...NIGHT_SUN_TRIALS.map((trial) => ({ key: `night-${trial.id}`, caption: `Night: ${trial.hex}, ${trial.name.toLowerCase()} (${trial.ratios["accent/background"].toFixed(2)}:1)`, colorScheme: "dark" as const, sun: trial.id, expected: trial.hex })),
];

async function captureColumn(browser: Browser, base: string, folder: string, screen: (typeof SCREENS)[number], size: (typeof SIZES)[number], column: Column): Promise<{ file: string; height: number }> {
  const context = await browser.newContext({ ...size.device, viewport: size.viewport, deviceScaleFactor: 1, colorScheme: column.colorScheme, reducedMotion: "reduce" });
  const page = await context.newPage();
  const where = `${screen.id} ${size.name} ${column.key}`;
  const response = await page.goto(`${base}/dev/looks/${LOOK}/${screen.id}${column.sun ? `?sun=${column.sun}` : ""}`);
  await settle(page);
  if ((response?.status() ?? 0) !== 200) throw new Error(`${where}: the server answered ${response?.status()}`);
  const seen = await page.evaluate(() => ({
    night: window.matchMedia("(prefers-color-scheme: dark)").matches,
    accent: getComputedStyle(document.querySelector(".viky-lab") as Element).getPropertyValue("--accent").trim(),
  }));
  if (seen.night !== (column.colorScheme === "dark")) throw new Error(`${where}: the page saw ${seen.night ? "night" : "day"}`);
  if (seen.accent.toUpperCase() !== column.expected.toUpperCase()) throw new Error(`${where}: the page wears ${seen.accent}, not ${column.expected}`);
  await page.addStyleTag({ content: "[data-lab-tool] { display: none !important; }" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.viewport.width, height: Math.max(height, size.viewport.height) });
  await settle(page);
  const file = resolve(folder, "screens", `${screen.id}-${size.name}-${column.key}.png`);
  await page.screenshot({ path: file });
  await context.close();
  console.log(`${basename(file)}  accent ${seen.accent}`);
  return { file, height: pngSize(file).height };
}

async function main() {
  const base = (process.argv[2] ?? "http://127.0.0.1:3107").replace(/\/+$/, "");
  const folder = claimFolder("look-2-trials");
  mkdirSync(resolve(folder, "screens"), { recursive: true });
  const browser = await chromium.launch();
  try {
    const boards: string[] = [];
    for (const size of SIZES) {
      const rows: string[] = [];
      for (const screen of SCREENS) {
        const cells: string[] = [];
        for (const column of COLUMNS) {
          const shot = await captureColumn(browser, base, folder, screen, size, column);
          const width = Math.round(size.viewport.width * size.scale);
          const fold = Math.round(size.viewport.height * size.scale);
          cells.push(
            `<figure><figcaption>${column.caption}</figcaption><div class="shot" style="width:${width}px"><img src="screens/${basename(shot.file)}" width="${width}"><div class="fold" style="top:${fold}px"></div></div></figure>`,
          );
        }
        rows.push(`<h2>${screen.name}</h2><div class="row">${cells.join("")}</div>`);
      }
      boards.push(
        await board(
          browser,
          folder,
          `night-sun-${size.name}`,
          `Look 2, the sun at night, at ${size.name}${size.scale === 1 ? "" : ", at half size"}`,
          `<p>The same screens by night with each candidate sun, and the day on the left for the hue. Example data. The dashed line is where the first screen ends.</p>${rows.join("")}`,
        ),
      );
    }

    const previews: string[] = [];
    for (const version of [
      { key: "ground", query: "", caption: "Now: on the ground, the gift in its colours" },
      { key: "sun", query: "?ground=sun", caption: "On the sun: the words and the gift in ink, as the icon" },
    ]) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
      const response = await page.goto(`${base}/dev/looks/${LOOK}/preview${version.query}`);
      if ((response?.status() ?? 0) !== 200) throw new Error(`preview ${version.key}: the server answered ${response?.status()}`);
      await settle(page);
      const file = resolve(folder, `link-preview-${version.key}-1200x630.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1200, height: 630 } });
      await page.close();
      const image = pngSize(file);
      if (image.width !== 1200 || image.height !== 630) throw new Error(`preview ${version.key} came out ${image.width}x${image.height}`);
      console.log(`${basename(file)}  1200x630`);
      previews.push(`<figure><figcaption>${version.caption}</figcaption><div class="shot" style="width:1200px"><img src="${basename(file)}" width="1200" height="630"></div></figure>`);
    }
    boards.push(await board(browser, folder, "link-preview-two-versions", "Look 2, the link preview in two versions", `<p>1200 x 630, as a messaging app shows it under a gift's link. Example data.</p><div style="display:flex;flex-direction:column;gap:32px">${previews.join("")}</div>`));

    writeFileSync(
      resolve(folder, "captures.md"),
      [
        "# Look 2, two trials",
        "",
        `- Taken ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")} from ${base}, in Chromium ${browser.version()}, on example data, with reduced motion so each picture is at rest.`,
        "- Every night picture read its accent back from the page and matched the candidate asked for.",
        ...NIGHT_SUN_TRIALS.map((trial) => `- ${trial.hex} (${trial.name}): ${trial.ratios["accent/background"].toFixed(2)}:1 on the night ground, ${trial.ratios["accent/surface"].toFixed(2)}:1 on the night surface, words on it ${trial.ratios["onAccent/accent"].toFixed(2)}:1.`),
        "",
        ...boards.map((file) => `- ${basename(file)}`),
        "",
      ].join("\n"),
    );
    console.log(`\ntrials: ${folder}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("LOOK_TRIALS_CAPTURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
