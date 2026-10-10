import { expect, test } from "@playwright/test";
import { profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * The page shown when nothing can be fetched (the audit of 9 Oct 2026): one sentence it can know, and a press that
 * loads the address again, written in the page itself since no script of its own can be fetched either. An installed
 * app has no reload button, and the page had nothing to press.
 *
 * VIKY_OFFLINE_CAPTURES=<folder> also photographs it, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_OFFLINE_CAPTURES;

for (const size of sizesFor(SHOTS)) {
  test(`offline: one sentence, and "Try again" loads the address again, what follows its # included (${size.name})`, async ({ browser, baseURL, viewport }) => {
    test.skip((viewport?.width ?? 0) !== 375, "measured once: it opens its own window");
    const { page, context } = await profile(browser, baseURL, size.viewport, { passkey: false });
    await page.goto("/~offline#a-gift-s-key");
    await expect(page.getByText("Viky needs a connection. Nothing was changed by this page.", { exact: true })).toBeVisible();
    await expect(page.getByText(/safe|while you are away/i)).toHaveCount(0);
    const again = page.getByRole("button", { name: "Try again", exact: true });
    await expect(again).toBeVisible();
    await capture(SHOTS, page, size.name, "offline");
    // The press loads the same address as a new document: what this one held is gone, and the address is whole.
    await page.evaluate("window.__thisDocument = true");
    await again.click();
    await expect.poll(() => page.evaluate("window.__thisDocument === undefined"), { timeout: 15_000 }).toBe(true);
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe("/~offline#a-gift-s-key");
    await expect(again).toBeVisible();
    await context.close();
  });
}
