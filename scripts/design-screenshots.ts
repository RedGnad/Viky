import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

/**
 * A picture of every screen at the three widths the design pass is judged at.
 *
 * They are the signed-out states, because a passkey cannot be replayed by a script: what a person meets on a
 * first visit is exactly what this captures, and the states behind an account are the catalogue's job
 * (/dev/states) rather than a screenshot's. Run against a built app: `pnpm start` then `pnpm design:shots`.
 */

const WIDTHS = [
  { name: "375", width: 375, height: 812 },
  { name: "430", width: 430, height: 932 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

const PAGES = ["/", "/fund", "/cash-out", "/account", "/privacy", "/legal"] as const;

async function main() {
  const base = process.env.VIKY_BROWSER_TEST_URL ?? "http://127.0.0.1:3000";
  const out = resolve("docs/design/screens");
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const size of WIDTHS) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      for (const path of PAGES) {
        const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        if (!response || response.status() >= 400) throw new Error(`${path} answered ${response?.status()}`);
        const file = resolve(out, `${path === "/" ? "home" : path.slice(1).replace(/\//g, "-")}-${size.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`wrote ${file}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("SHOTS_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
