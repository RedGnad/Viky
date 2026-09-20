import { expect, test, type Page } from "@playwright/test";

/**
 * Home without an account, as the founder specified it on 20 Sep 2026 (D127): the card first at every width, placed
 * on the page by an edge and a hard relief, the promise under it in the title voice, one column centred from 1024.
 * Six checks, each one readable on a capture, and the merge waits on all six.
 */
const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const NIGHT_RELIEF = "rgb(187, 163, 250)";
const DAY_RELIEF = "rgb(30, 22, 51)";

async function boxes(page: Page) {
  const card = page.locator("section.gift-card-placed");
  const cardBox = (await card.boundingBox())!;
  const promiseBox = (await page.getByRole("heading", { name: /Money that arrives as they earn it/i }).boundingBox())!;
  const sentenceBox = (await page.getByText(/what they miss comes back to you/i).first().boundingBox())!;
  return { card, cardBox, promiseBox, sentenceBox };
}

for (const scheme of ["dark", "light"] as const) {
  test(`at 1440x900 the whole card and the promise show without scrolling, the card centred, placed, the largest figure (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize(WIDE);
    await page.goto("/");
    const { card, cardBox, promiseBox, sentenceBox } = await boxes(page);

    // 1. The entire card, button included, and the promise, inside the first screen.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(cardBox.y).toBeGreaterThanOrEqual(0);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(WIDE.height);
    expect(promiseBox.y).toBeGreaterThan(cardBox.y + cardBox.height);
    expect(sentenceBox.y + sentenceBox.height).toBeLessThanOrEqual(WIDE.height);

    // 2. The card's centre within 10 px of the window's.
    expect(Math.abs(cardBox.x + cardBox.width / 2 - WIDE.width / 2)).toBeLessThan(10);

    // 3 and 4. A hard 10 px relief and no blur: the colour, then 10px 10px 0px 0px and nothing else.
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toBe(`${scheme === "dark" ? NIGHT_RELIEF : DAY_RELIEF} 10px 10px 0px 0px`);

    // 5. No text on the page larger than the card's figure.
    const amount = await page.getByLabel(/How much/i).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const largest = await page.evaluate(() =>
      Math.max(
        ...[...document.querySelectorAll("body *")]
          .filter((el) => el instanceof HTMLInputElement || [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== ""))
          .map((el) => parseFloat(getComputedStyle(el).fontSize)),
      ),
    );
    expect(largest).toBeLessThanOrEqual(amount);
  });

  test(`at 390 the order is the same and nothing is cut across (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize(PHONE);
    await page.goto("/");
    const { card, cardBox, promiseBox } = await boxes(page);
    // 6. The card, then the promise; the card and its relief inside the width; no sideways scroll at all.
    expect(promiseBox.y).toBeGreaterThan(cardBox.y + cardBox.height);
    expect(cardBox.x + cardBox.width + 10).toBeLessThanOrEqual(PHONE.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
    expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/ 10px 10px 0px 0px$/);
  });
}
