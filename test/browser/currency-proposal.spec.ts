import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The currency a person reads in is proposed, never asked (the founder, 1 Oct 2026): from the country the connection
 * comes from, then from the region of the device's language. Measured in production before this: a phone in English,
 * or in French with no region, read dollars in France.
 *
 * The connection's country is the platform's own header, which this test sends as the platform would.
 *
 * VIKY_CURRENCY_CAPTURES=<folder> also photographs the card, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_CURRENCY_CAPTURES;

const key = (page: Page) => page.locator("button[aria-label^='Read in another currency']").first();

async function visitor(browser: Browser, served: string | undefined, from: string | null, locale: string, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ baseURL: served, serviceWorkers: "block", viewport, locale, ...(from ? { extraHTTPHeaders: { "x-vercel-ip-country": from } } : {}) });
  const page = await context.newPage();
  return { context, page };
}

const kept = async (page: Page) => (await page.context().cookies()).find((cookie) => cookie.name === "viky.currency")?.value ?? null;

test.describe("the currency is proposed from where the connection comes from", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");

  test("a phone in English in France reads euros, keeps them, and still reads them from another network", async ({ browser, baseURL }) => {
    const { context, page } = await visitor(browser, baseURL, "FR", "en-US");
    await page.goto("/");
    await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, Euro now");
    await expect.poll(() => kept(page), { message: "the first proposal is kept on the device" }).toBe("EUR");
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.locator("#offer").scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS, "c1-english-phone-in-france-390.png") });
    }
    // The same device, on a connection from somewhere else: what it kept decides, and nothing is asked.
    await context.setExtraHTTPHeaders({ "x-vercel-ip-country": "US" });
    await page.goto("/");
    await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, Euro now");
    await context.close();
  });

  test("the connection decides when it and the language disagree, and a currency not offered reads dollars", async ({ browser, baseURL }) => {
    // A phone in English in Dakar.
    const dakar = await visitor(browser, baseURL, "SN", "en-GB");
    await dakar.page.goto("/");
    await expect(key(dakar.page)).toHaveAttribute("aria-label", "Read in another currency, CFA franc now");
    await dakar.context.close();
    // Morocco: the dirham is not offered, so the dollar, whatever the phone's language says.
    const rabat = await visitor(browser, baseURL, "MA", "fr-FR");
    await rabat.page.goto("/");
    await expect(key(rabat.page)).toHaveAttribute("aria-label", "Read in another currency, US Dollar now");
    await expect.poll(() => kept(rabat.page)).toBe("USD");
    await rabat.context.close();
    // No connection country at all: the language's region proposes, as it did.
    const unknown = await visitor(browser, baseURL, null, "fr-FR");
    await unknown.page.goto("/");
    await expect(key(unknown.page)).toHaveAttribute("aria-label", "Read in another currency, Euro now");
    await unknown.context.close();
  });

  test("a choice made by hand is never replaced by a proposal", async ({ browser, baseURL }) => {
    const { context, page } = await visitor(browser, baseURL, "FR", "fr-FR");
    await page.goto("/");
    await key(page).click();
    await page.locator("dialog.sheet[open]").getByRole("button", { name: /US Dollar/ }).click();
    await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, US Dollar now");
    await page.goto("/");
    await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, US Dollar now");
    expect(await kept(page)).toBe("USD");
    await context.close();
  });

  if (SHOTS) {
    test("the card at 1440, for the capture", async ({ browser, baseURL }) => {
      const { context, page } = await visitor(browser, baseURL, "FR", "en-US", { width: 1440, height: 900 });
      await page.goto("/");
      await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, Euro now");
      await page.locator("#offer").scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS, "c1-english-phone-in-france-1440.png") });
      await context.close();
    });
  }
});
