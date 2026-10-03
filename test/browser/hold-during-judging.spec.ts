import { expect, test, type Page } from "@playwright/test";
import { shot as capture, sizesFor } from "./gift-kit";

/**
 * What a person meets when something is not there, when a page fails, and on an address of the app that is not
 * viky.cash (the audit of 1 Oct 2026, PR 6).
 *
 * Before this an address that led nowhere and a page that failed were the framework's own bare screens, in its words,
 * with no way back; and an account could be made on any address the app answers at, bound for good to that address.
 *
 * VIKY_HOLD_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_HOLD_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

for (const size of sizesFor(SHOTS)) {
  test.describe(`holding during the judging (${size.name})`, () => {
    test.use({ viewport: size.viewport });

    test(`an address that leads nowhere says so in one sentence and leads home (${size.name})`, async ({ page }) => {
      const answer = await page.goto("/nowhere-at-all");
      expect(answer?.status()).toBe(404);
      await expect(page.getByText("This page does not exist.", { exact: true })).toBeVisible();
      const home = page.getByRole("link", { name: "Back to Viky" });
      await expect(home).toHaveAttribute("href", "/");
      await shot(page, size.name, "1-a-page-that-does-not-exist");
      await home.click();
      await expect(page).toHaveURL(/\/$/);
    });

    test(`a page that fails while it is drawn says so, and that nothing was changed (${size.name})`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, serviceWorkers: "block", viewport: size.viewport });
      // A browser that refuses a question every screen asks of it: the page throws as it wakes, as a real fault would.
      await context.addInitScript(`window.matchMedia = () => { throw new Error("a fault made for the test"); };`);
      const page = await context.newPage();
      await page.goto("/help");
      await expect(page.locator("main").getByRole("alert")).toHaveText("This page could not be shown. Nothing was changed.");
      await expect(page.getByRole("link", { name: "Back to Viky" })).toHaveAttribute("href", "/");
      // Nothing of the fault itself is shown to the person.
      await expect(page.getByText("a fault made for the test")).toHaveCount(0);
      await shot(page, size.name, "2-a-page-that-failed");
      await context.close();
    });

    test(`on another address of the app an account is not made: the door leads to viky.cash, and signing in stays (${size.name})`, async ({ browser, baseURL }) => {
      // The address the platform says the page was asked at, as it does on viky-two.vercel.app.
      const context = await browser.newContext({ baseURL, serviceWorkers: "block", viewport: size.viewport, extraHTTPHeaders: { "x-forwarded-host": "viky-two.vercel.app", "x-forwarded-proto": "https" } });
      const page = await context.newPage();
      await page.goto("/");
      await page.getByRole("button", { name: /^Sign in$/ }).first().click();
      const door = page.getByRole("dialog", { name: "Sign in or create account" });
      await expect(door.getByText("Accounts are created on viky.cash.", { exact: true })).toBeVisible();
      await expect(door.getByRole("link", { name: "Create my account on viky.cash" })).toHaveAttribute("href", "https://viky.cash/");
      await expect(page.getByRole("button", { name: /^Create (your|my) account$/ })).toHaveCount(0);
      // An account made on that address before still opens there: the press that asks the device for its passkey stays.
      await expect(door.getByRole("button", { name: "Try again" })).toBeEnabled();
      await shot(page, size.name, "3-the-account-door-on-another-address");
      await context.close();
    });

    test(`on viky.cash's own address and on a development one, the account is made where the person stands (${size.name})`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /^Sign in$/ }).first().click();
      await expect(page.getByRole("button", { name: /^Create (your|my) account$/ }).first()).toBeVisible();
      await expect(page.getByText("Accounts are created on viky.cash.")).toHaveCount(0);
    });
  });
}

test("every page forbids being framed and says nothing of the framework that answers", async ({ request }) => {
  const answer = await request.get("/");
  const headers = answer.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'; frame-src 'self' https://deposit.swapper.finance https://app.rampnow.io");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("the health answer names no account, no contract and no gift, whatever it finds", async ({ request }) => {
  const answer = await request.get("/api/health");
  // 200 when everything this server depends on stands, 503 when one thing does not: a test server has no database.
  expect([200, 503]).toContain(answer.status());
  const text = await answer.text();
  expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
  const body = JSON.parse(text) as { ok: boolean; database: unknown; rpc: unknown; worker: unknown; relayer: unknown; exitPin: unknown; evidenceKey: unknown; passes: unknown };
  expect(body.ok).toBe(answer.status() === 200);
  for (const part of ["database", "rpc", "worker", "relayer", "exitPin", "evidenceKey", "passes"] as const) expect(body[part]).toBeTruthy();
});
