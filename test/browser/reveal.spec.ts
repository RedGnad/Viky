import { expect, test } from "@playwright/test";

/**
 * The reveal on scroll (the life of the product, step 4, 23 Sep 2026): a block below the fold when the screen opened
 * rises 8 px in 250 ms the first time it is scrolled into view, once; what was in view does not move again; under
 * reduced motion nothing moves at all.
 */
const running = (page: import("@playwright/test").Page) =>
  page.evaluate("document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().duration === 250 && !a.animationName).length");

test("a block below the fold rises once when it is scrolled into view, and not a second time", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/privacy");
  await page.waitForTimeout(800);
  expect(await running(page)).toBe(0);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => running(page), { timeout: 2000 }).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(100);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(100);
  expect(await running(page), "once, never on a second pass").toBe(0);
});

test("under reduced motion nothing rises when it is scrolled into view", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/privacy");
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(150);
  expect(await running(page)).toBe(0);
  await context.close();
});
