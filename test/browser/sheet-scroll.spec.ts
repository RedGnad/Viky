import { expect, test, type Page } from "@playwright/test";

/**
 * A scroll that starts on a sheet stays on the sheet (D249, the founder, 25 Sep 2026): the page behind scrolls only
 * under a gesture on the part of it the sheet leaves exposed. Checked with the wheel and with a finger's swipe, which
 * Chromium synthesises (`Input.synthesizeScrollGesture`, touch as its source).
 */

async function openSheet(page: Page) {
  await page.goto("/", { waitUntil: "load" });
  await page.locator("main section").first().getByRole("button", { name: /What they will do/i }).click();
  const sheet = page.locator("dialog.sheet[open]");
  await expect(sheet).toBeVisible();
  // The four tiles: a sheet whose questions fit, which is where a gesture used to fall through to the page.
  await expect(sheet.locator("[data-family-art]")).toHaveCount(4);
  await page.waitForTimeout(400);
  return sheet;
}

const scrolled = (page: Page) => page.evaluate(() => window.scrollY);

async function swipe(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -300, gestureSourceType: "touch", speed: 1200 });
  await cdp.detach();
}

test("a wheel on the sheet leaves the page where it is, and a wheel on the page beside it moves the page", async ({ page }) => {
  const sheet = await openSheet(page);
  const before = await scrolled(page);
  const box = (await sheet.locator("[data-family-art]").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  expect(await scrolled(page)).toBe(before);
  // The exposed part: above the sheet.
  const top = (await sheet.boundingBox())!.y;
  await page.mouse.move(20, Math.max(4, top / 2));
  await page.mouse.wheel(0, 400);
  await expect.poll(() => scrolled(page)).toBeGreaterThan(before);
});

test("a finger on the sheet leaves the page where it is, and a finger on the page beside it moves the page", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the synthesised swipe is Chromium's");
  const sheet = await openSheet(page);
  const before = await scrolled(page);
  const box = (await sheet.locator("[data-family-art]").first().boundingBox())!;
  await swipe(page, box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  expect(await scrolled(page)).toBe(before);
  const done = (await sheet.getByRole("button", { name: /^Done$/ }).boundingBox())!;
  await swipe(page, done.x + done.width / 2, done.y + done.height / 2);
  await page.waitForTimeout(300);
  expect(await scrolled(page)).toBe(before);
  const top = (await sheet.boundingBox())!.y;
  await swipe(page, 20, Math.max(8, top / 2));
  await expect.poll(() => scrolled(page)).toBeGreaterThan(before);
});

test("a family's list opens at its top, even from a tile reached by scrolling the four (D251)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 560 });
  await page.goto("/", { waitUntil: "load" });
  await page.locator("main section").first().getByRole("button", { name: /What they will do/i }).click();
  const sheet = page.locator("dialog.sheet[open]");
  const body = sheet.locator(".sheet-body");
  await expect(sheet.locator("[data-family-art]")).toHaveCount(4);
  // Part way down the four, then a tile pressed where it stands (a click without the test's own scrolling into view).
  await body.evaluate((element) => element.scrollTo({ top: 40 }));
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await sheet.getByRole("button", { name: /^Learn/ }).dispatchEvent("click");
  await expect(sheet.locator('div[role="group"] > button').first()).toBeVisible();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
});
