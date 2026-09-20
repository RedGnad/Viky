import { expect, test, type Page } from "@playwright/test";

/**
 * Home as the founder specified it on the advisor's preview of 20 Sep 2026 (D128): no blur anywhere, the promise
 * "Money that cheers them on." at 76 in the left column beside the card from 1024 and at 39 in one column below,
 * nothing cut across on a phone. The checks that need an account (the column at the card's width) are read on the
 * connected captures, which sign in with a passkey this runner does not have.
 */
const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** Every box shadow on the page with a blur, and every filter with one: none is allowed (the niche). */
async function blurs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const before = getComputedStyle(document.body, "::before");
    if (before.content !== "none" && before.filter !== "none") found.push(`body::before ${before.filter}`);
    const after = getComputedStyle(document.body, "::after");
    if (after.content !== "none" && after.filter !== "none") found.push(`body::after ${after.filter}`);
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.filter !== "none" && cs.filter.includes("blur")) found.push(`${el.tagName} filter ${cs.filter}`);
      if (cs.boxShadow !== "none") {
        for (const shadow of cs.boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px (\d+(?:\.\d+)?)px/g)) {
          if (Number(shadow[3]) > 0) found.push(`${el.tagName}.${el.className} shadow ${cs.boxShadow}`);
        }
      }
    }
    return found;
  });
}

for (const scheme of ["dark", "light"] as const) {
  test(`no blur anywhere on Home, and the card stands by its edge alone (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize(WIDE);
    await page.goto("/");
    expect(await blurs(page)).toEqual([]);
    const card = page.locator("section.gift-card-placed");
    expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  });

  test(`at 1440x900 without an account the promise is 76 px on two lines at the left, and the whole card is on the right (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize(WIDE);
    await page.goto("/");
    const title = page.getByRole("heading", { name: "Money that cheers them on." });
    await expect(title).toBeVisible();
    // Measured in the title face itself: with the fallback font the line count is nobody's.
    await page.evaluate(() => document.fonts.ready);
    const size = await title.evaluate((el) => getComputedStyle(el).fontSize);
    expect(size).toBe("76px");
    const box = (await title.boundingBox())!;
    const lines = Math.round(box.height / (76 * 1.02));
    expect(lines).toBe(2);
    expect(await title.evaluate((el) => getComputedStyle(el).textAlign)).toBe("start");
    const leftEdge = await title.evaluate((el) => el.parentElement!.getBoundingClientRect().left);
    expect(Math.abs(box.x - leftEdge)).toBeLessThan(1);
    const cardBox = (await page.locator("section.gift-card-placed").boundingBox())!;
    expect(cardBox.x).toBeGreaterThan(box.x + box.width);
    expect(cardBox.y).toBeGreaterThanOrEqual(0);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(WIDE.height);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test(`at 390 without an account one column, the promise at 39 px under the card, nothing cut across (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize(PHONE);
    await page.goto("/");
    const title = page.getByRole("heading", { name: "Money that cheers them on." });
    await page.evaluate(() => document.fonts.ready);
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("39px");
    const titleBox = (await title.boundingBox())!;
    const cardBox = (await page.locator("section.gift-card-placed").boundingBox())!;
    expect(titleBox.y).toBeGreaterThan(cardBox.y + cardBox.height);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(PHONE.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
  });
}
