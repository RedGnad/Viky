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

  /**
   * Rewritten on 15 Sep because the decision changed, not because the test was wrong. It used to assert that
   * a first visit meets the passkey button on the home page. It now asserts the opposite, which is what GOV.UK
   * and Apple both ask for: say what this is, offer the thing itself, and let the account wait until it is
   * needed. If the account ever climbs back to the top of the home page, this fails.
   */
  test("a first visit is told what this is and offered the gift, not an account", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /already in their name/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Offer a gift$/i })).toBeVisible();
    // The one door, in the header rather than in the body, named for both of the things it does (brief, section 7).
    await expect(page.getByRole("button", { name: /^Sign in or create account$/i })).toBeVisible();
    // The body asks for one thing and one only: the gift.
    await expect(page.locator("main").getByRole("link", { name: /^Offer a gift$/i })).toHaveCount(1);
    // No passkey prompt on the home page at all, and nothing claiming a session that does not exist.
    await expect(page.getByRole("button", { name: /Create my account/i })).toHaveCount(0);
    await expect(page.getByText("You are signed in.")).toHaveCount(0);
  });

  /**
   * Also rewritten, and it is the same decision from the other end: composing a gift needs nobody's identity,
   * so the funder journey starts with the gift and the passkey arrives just before money does. The guard that
   * matters now is that no amount is ever asked for on the first screen, and no account is either.
   */
  test("the funder journey starts with the gift, not with an account", async ({ page }) => {
    await page.goto("/fund");
    await expect(page.getByRole("heading", { name: /Who is it for/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create my account/i })).toHaveCount(0);
    // One question per screen: the amount belongs to the next one.
    await expect(page.getByText(/How much, in dollars/i)).toHaveCount(0);
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
