import { expect, test } from "@playwright/test";
import { gift, json, makeAnAccount, profile } from "./gift-kit";

/**
 * The back key steps back only when the page before is one of Viky's (7 Oct 2026).
 *
 * A person brought back to their gift by the verification page had that page as the one before: the key went a step
 * back whenever the history held more than one entry, the step led to Reclaim, which sent them straight back, and the
 * key seemed dead. It now goes where it names, "My gifts", unless the page before is a page Viky itself showed.
 *
 * What is real: the product's pages against the server under test, the browser's own history, every press. What is
 * stood in for: the page arrived from, which is an empty page here and Reclaim's there, and the gift.
 */
const key = "a.back-round";

test.describe("the back key", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: the key is the same at every size");

  test("arrived from elsewhere, it goes to the place it names and not a step back", async ({ page }) => {
    await page.goto("about:blank");
    await page.goto("/what-viky-can-check");
    await page.waitForLoadState("networkidle");
    await page.locator(key).first().click();
    // A step back would have been the empty page: the key seemed to do nothing, or left Viky.
    await expect(page).toHaveURL(/\/$/);
  });

  test("inside Viky, it goes a step back to the page the person came from", async ({ page }) => {
    await page.goto("/me");
    await page.waitForLoadState("networkidle");
    await page.locator('a[href="/what-viky-can-check"]').first().click();
    await expect(page).toHaveURL(/\/what-viky-can-check$/);
    await page.locator(key).first().click();
    // The key names Home, and the page before is Me: a step back is what the person expects.
    await expect(page).toHaveURL(/\/me$/);
  });

  test("a page loaded again keeps what it knew of the page before", async ({ page }) => {
    await page.goto("/me");
    await page.waitForLoadState("networkidle");
    await page.locator('a[href="/what-viky-can-check"]').first().click();
    await expect(page).toHaveURL(/\/what-viky-can-check$/);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.locator(key).first().click();
    await expect(page).toHaveURL(/\/me$/);
  });

  test("brought back to a gift by the verification page, it goes to My gifts", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "1999985";
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(gift(GIFT, "recipient", { review: { status: "pending" } }))));
    await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
      route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your TOEFL score" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
    );
    await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
    await makeAnAccount(device);
    // The verification page, then the gift's page it sends the person to: two documents, the first not Viky's.
    await page.goto("about:blank");
    await page.goto(`/g/${GIFT}`);
    await page.waitForLoadState("networkidle");
    const back = page.getByRole("link", { name: "Back to my gifts" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/gifts$/);
    await device.context.close();
  });
});
