import { expect, test } from "@playwright/test";
import { FORBIDDEN_WORDS } from "../../src/consumer-words";

/** Every screen a person can reach without signing in. The judges page is excluded by design: it is the
 *  one place allowed to show a contract. */
const CONSUMER_PAGES = ["/", "/fund", "/privacy", "/legal"];

test.describe("the screens a person meets", () => {
  for (const path of CONSUMER_PAGES) {
    test(`${path} renders, reads one handed, and says no forbidden word`, async ({ page }) => {
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(String(error)));
      const response = await page.goto(path);
      expect(response?.status(), `${path} answered`).toBeLessThan(400);

      // Something the person can actually read, not a blank shell.
      await expect(page.locator("main")).toBeVisible();
      const text = (await page.locator("main").innerText()).trim();
      expect(text.length, `${path} has readable text`).toBeGreaterThan(40);

      // The words the user must never see, checked on what React actually rendered.
      const found = text.match(new RegExp(FORBIDDEN_WORDS.source, "gi")) ?? [];
      expect(found, `${path} shows forbidden words`).toEqual([]);

      // One handed on a phone: nothing may push the page sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);

      expect(failures, `${path} threw in the browser`).toEqual([]);
    });
  }

  test("a first visit is offered a way in, and never a dead end", async ({ page }) => {
    await page.goto("/");
    // The account panel is the only way in, and it must be reachable without scrolling past the fold.
    await expect(page.getByRole("button", { name: /Face ID or fingerprint/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /already have an account|Sign in/i })).toBeVisible();
    // Nothing may claim the person is signed in before they are.
    await expect(page.getByText("You are signed in.")).toHaveCount(0);
  });

  test("the funder screen asks for sign-in before it asks for money", async ({ page }) => {
    await page.goto("/fund");
    await expect(page.getByRole("button", { name: /Face ID or fingerprint/i })).toBeVisible();
    // The amount fields belong behind the account, never in front of it.
    await expect(page.getByPlaceholder(/email or phone/i)).toHaveCount(0);
  });

  test("every tap target is big enough for a thumb", async ({ page }) => {
    await page.goto("/");
    const targets = page.locator("main button, main a");
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      if (!box) continue;
      const label = (await targets.nth(index).innerText()).slice(0, 40);
      // The floor platform guidance gives for a thumb, rather than a number we invented.
      expect(box.height, `"${label}" is too short to tap`).toBeGreaterThanOrEqual(44);
    }
  });
});
