import { expect, test } from "@playwright/test";

/**
 * The character on every screen, not only on Home (the life of the product, step 3, 23 Sep 2026). Every screen a
 * person reaches draws exactly one, listening to the same moods: the head character, or on the page without an
 * account its own larger one beside the title.
 */
const SCREENS = ["/", "/me", "/gifts", "/fund", "/cash-out", "/what-viky-can-check", "/judges", "/help", "/privacy", "/legal"];

for (const path of SCREENS) {
  test(`${path} draws the character once, and it hears the moods`, async ({ page }) => {
    await page.goto(path);
    // Visible ones: a sheet that is shut (the card's pay sheet on the landing) carries its own, unseen until it opens.
    await expect(page.locator("main [data-mood] > span[data-gaze] > svg:visible, main [data-mood] svg:visible").first()).toBeVisible();
    await expect(page.locator("main [data-mood] svg:visible")).toHaveCount(1);
  });
}
