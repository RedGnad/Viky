import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, shot as capture, sizesFor, type Holdings, type Profile } from "./gift-kit";

/**
 * Taking money out, as a person meets it (the audit of 1 Oct 2026, findings F-16, F-18, P-08, P-11).
 *
 * What was measured before this: the bank's step opened an address Ramp answers with "Integration issue detected", the
 * screen opened by itself on that step at every visit, the card was offered where its service serves nobody and refused
 * nothing under its own minimum, and a bank in the United States was promised euros on an IBAN.
 *
 * The account is a virtual passkey; the chain and the routes that need a database or a service are answered here, and
 * nothing is sent anywhere.
 *
 * VIKY_WAY_OUT_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_WAY_OUT_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const ONE = 1_000_000_000_000_000_000n;

const RATES = { date: "2026-09-30", usdPerEur: 1.1355, eurPerUsd: 1 / 1.1355, xofPerUsd: 655.957 / 1.1355, eurPer: { USD: 1.1355, EUR: 1 }, readAtMs: Date.now() };

type Where = { country: string; bank: "serves" | "does-not"; card: "serves" | "does-not"; method?: { method: string; currency: string } | null };

/** Somebody signed in, with these holdings, in this country, as the routes would answer for them. */
async function person(device: Profile, holdings: Holdings, where: Where): Promise<void> {
  const { page, context } = device;
  await answerTheChain(context, holdings);
  await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
  await page.route("**/api/rates", (route) => route.fulfill(json({ rates: { ...RATES, readAtMs: Date.now() }, currencies: ["USD", "EUR", "XOF"] })));
  await page.route("**/api/account/preferences", (route) => route.fulfill(json({ country: where.country, displayCurrency: "USD" })));
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(
      json({
        country: where.country,
        ask: false,
        fromConnection: where.country,
        fromDevice: where.country,
        waysOut: { Ramp: where.bank, Mercuryo: where.card },
        waysIn: {},
        card: { offered: true, country: where.country },
        out: { bank: where.method ?? null, cardSmallest: { amount: 15, currency: "EUR" } },
      }),
    ),
  );
  // What the coin a card service buys is worth, as the price route would answer it: about 2.7 cents each.
  await page.route("**/api/fund/quote", (route) => {
    const asked = BigInt((JSON.parse(route.request().postData() ?? "{}") as { amount?: string }).amount ?? "0");
    return route.fulfill(json({ output: ((asked * 27_000n) / ONE).toString(), minOut: "0", to: "0x0000000000000000000000000000000000000001", data: "0x", value: "0" }));
  });
  await makeAnAccount(device);
}

test.describe("taking money out", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  for (const size of sizesFor(SHOTS)) {
    test(`the bank: nothing opens by itself, and step 2 opens Ramp's own selling page with the code copied (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page, context } = device;
      // Fifteen dollars of what a gift holds, and 9.99 already made ready for the bank service.
      await person(device, { ausd: 15_000_000n, usdc: 9_990_000n, mon: 0n }, { country: "fr", bank: "serves", card: "does-not", method: { method: "SEPA", currency: "EUR" } });
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/cash-out");
      // The first screen, not step 2: what is ready is said, with the way back to it, and the rest can still be used.
      await expect(page.getByText("$9.99 of it is ready to send to Ramp.")).toBeVisible();
      await expect(page.getByRole("heading", { name: /^Step 2 of 3/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Send to my bank" })).toBeEnabled();
      await expect(page.getByText("A transfer in euros to your IBAN, within two working days. Our partner Ramp asks for your ID, once.")).toBeVisible();
      await shot(page, size.name, "1a-first-screen-with-money-ready");

      await page.getByRole("button", { name: "Continue with Ramp" }).click();
      await expect(page.getByRole("heading", { name: "Step 2 of 3: Place your order with Ramp" })).toBeVisible();
      await expect(page.getByText("On Ramp's page, pick USDC, the one marked Monad, and type 9.99.")).toBeVisible();
      await expect(page.getByText("Ramp opens in a new tab and uses its own words. Come back to this tab with the code it gives you.")).toBeVisible();
      const open = page.getByRole("link", { name: "Copy my code and open Ramp" });
      await expect(open).toHaveAttribute("href", "https://rampnetwork.com/sell");
      await expect(open).toHaveAttribute("target", "_blank");
      await expect(page.getByRole("button", { name: /^Copy$/ })).toHaveCount(0);
      await page.getByRole("heading", { name: /^Step 2 of 3/ }).scrollIntoViewIfNeeded();
      await shot(page, size.name, "1b-step-2-the-bank");

      // One gesture: the press that opens the page has copied the code first. The page itself is not loaded here.
      await context.route("https://rampnetwork.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>stand-in</title>" }));
      const [opened] = await Promise.all([context.waitForEvent("page"), open.click()]);
      expect(opened.url()).toBe("https://rampnetwork.com/sell");
      await opened.close();
      await expect(page.getByText("Copied", { exact: true })).toBeVisible();
      const code = await page.evaluate(() => navigator.clipboard.readText());
      expect(code).toMatch(/^0x[0-9a-fA-F]{40}$/);
      await context.close();
    });

    test(`the card: its minimum is on the card, a smaller amount is refused in dollars, and step 2 says to tap Sell (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      // Dakar: ten dollars of what a gift holds, and 138.43 of the card service's coin above what the account keeps.
      await person(device, { ausd: 10_000_000n, usdc: 0n, mon: 11n * ONE + (13_843n * ONE) / 100n }, { country: "sn", bank: "does-not", card: "serves" });
      await page.route("**/api/exit/quote", (route) =>
        route.fulfill(json({ error: "Mercuryo pays a card from 15.00 EUR, about $17.44 today. Send at least that.", code: "BELOW_PAYOUT_MINIMUM" }, 409)),
      );
      await page.goto("/cash-out");
      const card = page.locator("section", { has: page.getByRole("heading", { name: "Your card" }) });
      await expect(card.getByText("From €15.00 at a time.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Your bank" })).toHaveCount(0);
      await card.scrollIntoViewIfNeeded();
      await shot(page, size.name, "2a-the-card-says-its-minimum");

      // Ten dollars is under it: said in dollars, before anything is changed, under the amount it is about.
      await card.getByRole("button", { name: "Send to my card" }).click();
      await page.getByRole("button", { name: "See what you will get" }).click();
      await expect(page.locator("main").getByRole("alert")).toHaveText("Mercuryo pays a card from 15.00 EUR, about $17.44 today. Send at least that.");
      await expect(page.getByRole("heading", { name: /^Step 2 of 3/ })).toHaveCount(0);
      await shot(page, size.name, "2b-refused-under-the-minimum");

      // What was made ready earlier: its step 2, which says what to do on a page that opens on buying.
      await page.getByRole("button", { name: "Not now" }).click();
      await page.getByRole("button", { name: "Continue with Mercuryo" }).click();
      await expect(page.getByText("On Mercuryo's page, tap Sell. Pick MON, the one marked Monad, and type 138.43.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Copy my code and open Mercuryo" })).toHaveAttribute("href", /^https:\/\/exchange\.mercuryo\.io\//);
      await page.getByRole("heading", { name: /^Step 2 of 3/ }).scrollIntoViewIfNeeded();
      await shot(page, size.name, "2c-step-2-the-card");
      await device.context.close();
    });

    test(`a bank in the United States is told dollars, and a country nothing reaches is told so (${size.name})`, async ({ browser, baseURL }) => {
      const american = await profile(browser, baseURL, size.viewport);
      await person(american, { ausd: 100_000_000n, usdc: 0n, mon: 0n }, { country: "us", bank: "serves", card: "does-not", method: { method: "AMERICAN_BANK_TRANSFER", currency: "USD" } });
      await american.page.goto("/cash-out");
      const bank = american.page.locator("section", { has: american.page.getByRole("heading", { name: "Your bank" }) });
      await expect(bank.getByText("A transfer in dollars to your bank account. Our partner Ramp asks for your ID, once.")).toBeVisible();
      await expect(bank.getByText(/IBAN|euros/)).toHaveCount(0);
      // A hundred dollars less the service's 1.99 EUR minimum, counted back at the day's rate: said in dollars.
      await expect(bank.getByText("$97.74")).toBeVisible();
      await bank.scrollIntoViewIfNeeded();
      await shot(american.page, size.name, "3a-a-bank-in-the-united-states");
      await american.context.close();

      const malian = await profile(browser, baseURL, size.viewport);
      await person(malian, { ausd: 10_000_000n, usdc: 0n, mon: 0n }, { country: "ml", bank: "does-not", card: "does-not" });
      await malian.page.goto("/cash-out");
      await expect(malian.page.getByText("No way to take money out reaches Mali yet. It stays yours here.")).toBeVisible();
      await expect(malian.page.getByRole("heading", { name: /^Your (bank|card)$/ })).toHaveCount(0);
      await expect(malian.page.getByRole("heading", { name: "Your phone" })).toBeVisible();
      await shot(malian.page, size.name, "3b-a-country-nothing-reaches");
      await malian.context.close();
    });
  }
});
