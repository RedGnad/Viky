import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * The card and its sheets, at the two sizes a review is judged at, in day and in night (the vision of 19 Sep 2026).
 *
 * Why a script of its own: `review:capture` walks a site by following links, and a sheet is not a link. This fills
 * the card the way a person does, pressing each case and answering it, and photographs what the screen shows at
 * every step. It is also how the "after" of the measure in docs/reports/2026-09-19-the-card.md was taken.
 *
 * Usage: `pnpm review:capture-card` against a built site served on http://localhost:3210, with nothing signed
 * in; `VIKY_CARD_URL=https://viky.cash pnpm review:capture-card` to walk the real site instead.
 */

const SITE = process.env.VIKY_CARD_URL ?? "http://localhost:3210";
const OUT = `review-captures/card-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}Z`;
const SIZES = [
  { name: "390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  { name: "1440x900", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
] as const;
const APPEARANCES = [
  { name: "day", colorScheme: "light" as const },
  { name: "night", colorScheme: "dark" as const },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows: string[] = [];
  for (const size of SIZES) {
    for (const appearance of APPEARANCES) {
      const context = await browser.newContext({ ...size.use, colorScheme: appearance.colorScheme });
      const page = await context.newPage();
      const shot = async (state: string) => {
        // The sheet rises in 300ms, and a picture taken during it shows a half faded surface with the page behind
        // it: wait past the animation, whatever is on screen, before every shot.
        await page.waitForTimeout(450);
        const file = `${state}--${size.name}--${appearance.name}.png`;
        await page.screenshot({ path: `${OUT}/${file}` });
        rows.push(`| ${file} | ${size.name} | ${appearance.name} | ${state} |`);
      };
      await page.goto(SITE, { waitUntil: "networkidle" });
      const card = page.locator("section").first();
      const slot = (index: number) => card.getByRole("button").nth(index);
      const sheet = page.locator("dialog.sheet[open]");
      await shot("01-card-empty");

      await slot(0).click();
      await shot("02-sheet-for");
      await sheet.getByLabel("Their first name").fill("Léa");
      await sheet.getByLabel("Your name, as they know you").fill("Mum");
      await sheet.getByRole("button", { name: "Done" }).click();

      await slot(1).click();
      await shot("03-sheet-will-list");
      await sheet.getByRole("radio", { name: /Duolingo lesson each day/ }).click();
      await page.waitForTimeout(200);
      await shot("04-sheet-will-questions");
      await sheet.getByRole("button", { name: "Done" }).click();

      await slot(2).click();
      for (const key of ["3", "0"]) await sheet.getByRole("button", { name: key, exact: true }).click();
      await shot("05-sheet-amount");
      await sheet.getByRole("button", { name: "Done" }).click();

      await slot(3).click();
      await shot("06-sheet-how-long");
      await sheet.getByRole("button", { name: "30 days" }).click();
      await sheet.getByRole("button", { name: "Done" }).click();
      await shot("07-card-filled");

      await page.getByRole("button", { name: /^Pay / }).click();
      await page.waitForTimeout(1500);
      await shot("08-pay-sheet");
      await context.close();
    }
  }
  writeFileSync(
    `${OUT}/captures.md`,
    ["# The card on Home, 19 Sep 2026", "", "Taken from the built site at http://localhost:3210, nothing signed in.", "", "| file | size | appearance | state |", "|---|---|---|---|", ...rows, ""].join("\n"),
  );
  await browser.close();
  console.log(`captures for review: ${process.cwd()}/${OUT}`);
}

void main();
