import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { makeAnAccount, profile } from "./gift-kit";

/**
 * The two blocks the judges page gained on 1 Oct 2026 (the audit, D-14 and section 3.7): the index of the contracts'
 * events, and the agreement key of the account signed in on this device.
 *
 * The server under test has no index endpoint set, which is every deployment's state until its operator sets one:
 * the block then says the index could not be read and shows no figure. With VIKY_INDEX_SET=1 the server was started
 * with an endpoint, and the block is held to what it shows then. VIKY_JUDGES_CAPTURES=<folder> photographs the two
 * blocks at 390 and at 1440.
 */
const SHOTS = process.env.VIKY_JUDGES_CAPTURES;
const SIZES = SHOTS
  ? [
      { name: "390", viewport: { width: 390, height: 844 } },
      { name: "1440", viewport: { width: 1440, height: 900 } },
    ]
  : [{ name: "390", viewport: { width: 390, height: 844 } }];

for (const size of SIZES) {
  test.describe(`the judges page's index and agreement key (${size.name})`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: the test opens its own window");

    test(`the index's block says what it read or that it read nothing, and the account's block prints the agreement key (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await makeAnAccount(device);
      // By links, so the key made at sign-in is still in the page's memory.
      await page.locator('a[href="/me"]:visible').first().click();
      await page.locator('a[href="/judges"]:visible').first().click();

      const index = page.locator("section", { has: page.getByRole("heading", { name: "The index of the contracts' events" }) });
      await expect(index).toBeVisible({ timeout: 30_000 });
      if (process.env.VIKY_INDEX_SET === "1") {
        await expect(index.locator('[data-index="block"]')).toContainText(/^Block [\d,]+/);
        await expect(index.getByText(/the index's events add up to \$[\d.]+ still held/).first()).toBeVisible();
        await expect(index.locator('a[href^="https://monadvision.com/tx/0x"]').first()).toBeVisible();
      } else {
        await expect(index.locator('[data-index="unread"]')).toContainText("no figure of it is shown here rather than an old one");
        await expect(index.locator('a[href^="https://monadvision.com/tx/"]')).toHaveCount(0);
      }

      const account = page.locator("section", { has: page.getByRole("heading", { name: "Your account on this device" }) });
      const key = account.locator("[data-agreement-key]");
      await expect(key).toContainText("Your agreement key: ed25519 ");
      expect(await key.getAttribute("data-agreement-key")).toMatch(/^[0-9a-f]{64}$/);
      await expect(account.getByText(/iCloud Keychain on iOS 18 or macOS 15 and later/)).toBeVisible();

      // A block below the fold rises when it is scrolled into view: it is brought there and left to arrive before
      // it is photographed.
      const photograph = async (name: string, section: typeof index) => {
        if (!SHOTS) return;
        mkdirSync(SHOTS, { recursive: true });
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1_500);
        await section.screenshot({ path: join(SHOTS, `${name}-${size.name}.png`) });
      };
      await photograph(`1-the-index-${process.env.VIKY_INDEX_SET === "1" ? "read" : "not-set"}`, index);
      await photograph("2-the-agreement-key", account);

      // Loaded again, the page holds no key: it says so rather than printing one from anywhere else.
      await page.reload();
      await expect(page.locator('[data-agreement-key=""]')).toContainText("Your agreement key is not in this page's memory right now", { timeout: 30_000 });
      await photograph("3-no-key-after-a-load", page.locator("section", { has: page.getByRole("heading", { name: "Your account on this device" }) }));
      await device.context.close();
    });
  });
}
