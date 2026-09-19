import { chromium, devices } from "@playwright/test";
import { contrastRatio, NON_TEXT_CONTRAST_MINIMUM, TEXT_CONTRAST_MINIMUM } from "../src/contrast";

/**
 * Contrast as the browser paints it, not as the palette promises it (K, rules 9 and 10, 19 Sep 2026).
 *
 * The tokens are measured by `test/design-tokens.test.ts`, pair by pair, from the values in `src/design-tokens.ts`.
 * That is the right place for the palette, and it cannot see what a screen actually renders: a button whose fill
 * comes from a variable that never resolved, or an outline a rule overrode, would pass there and fail in front of a
 * person. This reads the computed colours off the live page, at both review sizes and in both appearances, and
 * computes the ratios from them.
 *
 * What it checks, for every control it finds: the words against the fill they sit on (WCAG 1.4.3, 4.5:1), and the
 * outline against the ground behind it, which is what identifies a control (WCAG 1.4.11, 3:1). It fails the run on a
 * ratio below the floor rather than printing it and carrying on.
 *
 * Usage: `pnpm measure:contrast http://localhost:3000`.
 */

const SIZES = [
  { name: "390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  { name: "1440x900", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
] as const;

const APPEARANCES = [
  { name: "day", colorScheme: "light" },
  { name: "night", colorScheme: "dark" },
] as const;

/** Screens a person meets without an account, which is where both kinds of button are drawn. */
const PAGES = ["/", "/fund", "/cash-out", "/legal"] as const;

/**
 * Reads every button and link that carries a fill, with the colours the browser resolved. A string, not a function:
 * a function sent into the page arrives calling a helper the page does not have.
 */
const CONTROLS = `(() => {
  // Transparent is not a colour. A control with no fill of its own is read against the ground behind it, and an
  // "rgba(0, 0, 0, 0)" parsed as black would invent a contrast nobody can see.
  function rgb(value) {
    var m = /rgba?\\((\\d+), ?(\\d+), ?(\\d+)(?:, ?([0-9.]+))?\\)/.exec(value || "");
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  function behind(node) {
    var at = node.parentElement;
    while (at) {
      var seen = rgb(getComputedStyle(at).backgroundColor);
      if (seen) return seen;
      at = at.parentElement;
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  }
  var out = [];
  var nodes = Array.prototype.slice.call(document.querySelectorAll("main button, main a"));
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.offsetParent === null) continue;
    // WCAG 1.4.11 exempts an inactive component, and the look says so out loud: a button that cannot be pressed
    // gives the accent back and wears a hairline.
    if (node.disabled || node.getAttribute("aria-disabled") === "true") continue;
    var style = getComputedStyle(node);
    var ground = behind(node);
    var fill = rgb(style.backgroundColor);
    var width = parseFloat(style.borderTopWidth) || 0;
    if (!fill && width === 0) continue;
    out.push({
      words: (node.textContent || "").trim().slice(0, 40),
      ink: rgb(style.color),
      fill: fill || ground,
      outline: width > 0 ? rgb(style.borderTopColor) : null,
      behind: ground,
    });
  }
  return out;
})()`;

type Control = {
  words: string;
  ink: { r: number; g: number; b: number } | null;
  fill: { r: number; g: number; b: number } | null;
  outline: { r: number; g: number; b: number } | null;
  behind: { r: number; g: number; b: number } | null;
};

const hex = (colour: { r: number; g: number; b: number }) =>
  `#${[colour.r, colour.g, colour.b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;

async function main() {
  const site = process.argv[2] ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const rows: string[] = [];
  const failures: string[] = [];
  for (const size of SIZES) {
    for (const appearance of APPEARANCES) {
      const context = await browser.newContext({ ...size.use, colorScheme: appearance.colorScheme });
      const page = await context.newPage();
      for (const path of PAGES) {
        const answer = await page.goto(`${site}${path}`, { waitUntil: "networkidle" });
        if ((answer?.status() ?? 0) >= 400) throw new Error(`${path} answered ${answer?.status()}`);
        await page.waitForTimeout(400);
        const controls = (await page.evaluate(CONTROLS)) as Control[];
        for (const control of controls) {
          const where = `${size.name} ${appearance.name} ${path} "${control.words}"`;
          if (control.ink && control.fill) {
            const ratio = contrastRatio(hex(control.ink), hex(control.fill));
            rows.push(`| ${where} | words on fill | ${hex(control.ink)} on ${hex(control.fill)} | ${ratio.toFixed(2)}:1 |`);
            if (ratio < TEXT_CONTRAST_MINIMUM) failures.push(`${where}: words ${ratio.toFixed(2)}:1`);
          }
          if (control.outline && control.behind) {
            const ratio = contrastRatio(hex(control.outline), hex(control.behind));
            rows.push(`| ${where} | outline on ground | ${hex(control.outline)} on ${hex(control.behind)} | ${ratio.toFixed(2)}:1 |`);
            if (ratio < NON_TEXT_CONTRAST_MINIMUM) failures.push(`${where}: outline ${ratio.toFixed(2)}:1`);
          }
        }
      }
      await context.close();
    }
  }
  await browser.close();
  console.log("| where | pair | colours | measured |");
  console.log("| --- | --- | --- | --- |");
  for (const row of rows) console.log(row);
  console.log(`\n${rows.length} pairs measured, ${failures.length} below their floor`);
  for (const failure of failures) console.log(`  ${failure}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("MEASURE_CONTRAST_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
