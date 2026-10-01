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

/** A finger that starts at (x, y) and travels up the glass by `travel` pixels, which scrolls what is under it down. */
async function swipe(page: Page, x: number, y: number, travel = 300) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -travel, gestureSourceType: "touch", speed: 1200 });
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

test("a finger on the sheet leaves the page where it is, where the same finger moves a page with no sheet on it", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the synthesised swipe is Chromium's");
  // The instrument first: the same finger on the page with no sheet over it. A machine whose synthesised finger moves
  // no page can say nothing about a sheet, and says so instead of passing on a finger that does nothing.
  await page.goto("/", { waitUntil: "load" });
  const height = page.viewportSize()!.height;
  await swipe(page, 20, Math.round(height * 0.7), Math.round(height * 0.4));
  const moves = await expect
    .poll(() => scrolled(page), { timeout: 3_000 })
    .toBeGreaterThan(0)
    .then(
      () => true,
      () => false,
    );
  test.skip(!moves, "this machine's synthesised finger moves no page, so it cannot say what a sheet does with one");

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
  /*
    The exposed part, above the sheet, is the browser's own to decide for a finger: no line of ours allows or stops it
    (the wheel is the one gesture the sheet handles itself, and the test above holds it on both sides). This machine's
    browser scrolls the page under it; the Linux browser of the CI run does not (1 Oct 2026: 35 for 35 at every width,
    the finger on the dialog's backdrop, on the glass from start to end). So it is written down and not asserted.
  */
  const top = (await sheet.boundingBox())!.y;
  const from = Math.max(24, top - 8);
  await swipe(page, 20, from, from - 12);
  await page.waitForTimeout(300);
  test.info().annotations.push({ type: "a finger on the backdrop", description: (await scrolled(page)) > before ? "moved the page behind the sheet" : "left the page where it was" });
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
