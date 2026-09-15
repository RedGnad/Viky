import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

/**
 * A picture of every screen at the three widths the design pass is judged at, in both appearances.
 *
 * They are the signed-out states, because a passkey cannot be replayed by a script: what a person meets on a
 * first visit is exactly what this captures, and the states behind an account are the catalogue's job
 * (/dev/states) rather than a screenshot's. Run against a built app: `pnpm start` then `pnpm design:shots`.
 */

/**
 * Four widths, each a decision rather than a device: the narrow phone, the wide phone, the width where a
 * destination has grown but not split, and the width where it is two panes.
 */
const WIDTHS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 900 },
] as const;

const PAGES = ["/", "/fund", "/cash-out", "/account", "/privacy", "/legal"] as const;

/**
 * The screens that matter, which live behind a passkey in the product and are rendered from example data at
 * /dev/screens so they can be photographed at all. Kept in step with the gallery by test/gallery.test.ts.
 */
const EXAMPLE_SLUGS = [
  "funder-who",
  "funder-amount",
  "funder-check",
  "funder-rail",
  "funder-ready",
  "recipient-card",
  "recipient-duolingo",
  "recipient-days",
  "recipient-earned",
  "recipient-returned",
  "recipient-money",
  "recipient-finished",
] as const;

async function main() {
  const base = process.env.VIKY_BROWSER_TEST_URL ?? "http://127.0.0.1:3000";
  const out = resolve("docs/design/screens");
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const size of WIDTHS) {
      for (const appearance of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 2,
        colorScheme: appearance,
      });
      const page = await context.newPage();
      const paths = [...PAGES, ...EXAMPLE_SLUGS.map((slug) => `/dev/screens/${slug}`)];
      // The example screens are the product; the six public pages are only its edges. Both, in day light,
      // and the public pages again at night.
      for (const path of paths) {
        if (appearance === "dark" && path.startsWith("/dev/")) continue;
        const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        if (!response || response.status() >= 400) throw new Error(`${path} answered ${response?.status()}`);
        const name = path === "/" ? "home" : path.slice(1).replace(/\//g, "-");
        const file = resolve(out, `${name}-${size.name}${appearance === "dark" ? "-night" : ""}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`wrote ${file}`);
      }
      await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("SHOTS_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
