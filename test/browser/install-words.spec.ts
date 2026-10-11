import { expect, test, type Page } from "@playwright/test";
import { makeAnAccount, profile, shot as capture } from "./gift-kit";

/**
 * "Install Viky", the same two words on a phone and on a computer (the founder, 11 Oct 2026). The button at the foot
 * of the landing and the title of Me's sheet said "Install Viky on this phone", and somebody at a desk read it too.
 * The landing's own title, "On your phone, like an app.", is about a phone and stays.
 *
 * VIKY_INSTALL_CAPTURES=<folder> also photographs both, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_INSTALL_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const SIZES = [
  { name: "390", viewport: { width: 390, height: 844 } },
  { name: "1440", viewport: { width: 1440, height: 900 } },
];

test.describe("installing is offered in the same words on a phone and on a computer", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the button at the foot of the landing, and the title of Me's sheet (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;

      // The landing, signed out: one button, under the title that is about a phone.
      await page.goto("/");
      const install = page.getByRole("button", { name: "Install Viky", exact: true });
      await expect(install).toHaveCount(1);
      await install.scrollIntoViewIfNeeded();
      await expect(install).toBeVisible();
      await expect(page.getByRole("heading", { name: "On your phone, like an app.", exact: true })).toBeVisible();
      await expect(page.getByText(/Install Viky on this phone/)).toHaveCount(0);
      await install.evaluate((button) => button.scrollIntoView({ block: "center", behavior: "instant" }));
      await shot(page, size.name, "1-the-foot-of-the-landing");

      // Me: the round control says "Install", and its sheet is named by the same two words.
      await makeAnAccount(device);
      await page.goto("/me");
      await page.locator('[data-decide="install"]').click();
      const sheet = page.getByRole("dialog", { name: "Install Viky", exact: true });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText("If nothing opens, use your browser's menu: Add to Home screen, or Install.")).toBeVisible();
      await expect(page.getByText(/on this phone/)).toHaveCount(0);
      await shot(page, size.name, "2-the-sheet-of-me");
      await device.context.close();
    });
  }
});
