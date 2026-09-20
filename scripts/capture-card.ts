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
      const sheet = page.locator("dialog.sheet[open]");
      await shot("01-card-as-it-opens");

      // The name, the amount and the length are typed on the card itself (the founder, 20 Sep 2026).
      await card.getByLabel("Their first name").fill("Léa");
      await shot("02-card-named");

      await card.getByRole("button").filter({ hasText: /what they will do/i }).click();
      await shot("03-sheet-will-list");
      // The list is longer than the sheet on a phone, and the state the fade is for is the one further down it.
      await sheet.locator(".sheet-body").evaluate((body) => body.scrollTo({ top: body.scrollHeight }));
      await shot("03b-sheet-will-list-scrolled");
      await sheet.locator(".sheet-body").evaluate((body) => body.scrollTo({ top: 0 }));
      // Pressing the one already chosen opens its own questions and keeps what it has been told.
      await sheet.getByRole("radio", { name: /Duolingo lesson each day/ }).click();
      await page.waitForTimeout(200);
      await shot("04-sheet-will-questions");
      // The list as somebody returning to it sees it: one line each, and the sentence under the one already chosen.
      await sheet.getByRole("button", { name: /change/i }).click();
      await shot("04b-sheet-will-list-chosen");
      await sheet.getByRole("button", { name: "Done" }).click();

      await card.getByLabel("How much").fill("45");
      await card.getByRole("button", { name: "90 days", exact: true }).click();
      await shot("05-card-amount-and-length");
      await card.getByRole("button", { name: "Other" }).click();
      await card.getByLabel("Days", { exact: true }).fill("45");
      await shot("06-card-other-length");
      await card.getByRole("button", { name: "30 days", exact: true }).click();
      await shot("07-card-filled");

      await page.getByRole("button", { name: /^Pay / }).click();
      await page.waitForTimeout(1500);
      await shot("08-pay-sheet");
      await context.close();
    }
  }
  // The two facts a reviewer needs are the two this script is given: which site was walked, and when. Written from
  // the values themselves, because a fixed sentence here said localhost and 19 September whatever was really read.
  const day = new Date().toISOString().slice(0, 10);
  writeFileSync(
    `${OUT}/captures.md`,
    [`# The card on Home, ${day}`, "", `Taken from ${SITE}, nothing signed in.`, "", "| file | size | appearance | state |", "|---|---|---|---|", ...rows, ""].join("\n"),
  );
  await browser.close();
  console.log(`captures for review: ${process.cwd()}/${OUT}`);
}

void main();
