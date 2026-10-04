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
const USDC_COIN = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
/** The withdrawal the account has open, as the route reads it from what was written down: none, unless a test says one. */
type Open = { coin: string; atLeast: string; sinceMs: number } | null;

/** Somebody signed in, with these holdings, in this country, as the routes would answer for them. */
async function person(device: Profile, holdings: Holdings, where: Where, open: Open = null, currency = "USD"): Promise<void> {
  const { page, context } = device;
  await answerTheChain(context, holdings);
  await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
  await page.route("**/api/exit/open", (route) => route.fulfill(json({ open })));
  await page.route("**/api/rates", (route) => route.fulfill(json({ rates: { ...RATES, readAtMs: Date.now() }, currencies: ["USD", "EUR", "XOF"] })));
  await page.route("**/api/account/preferences", (route) => route.fulfill(json({ country: where.country, displayCurrency: currency })));
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
      // Fifteen dollars of what a gift holds, and 9.99 already made ready for the bank service: a withdrawal is open.
      await person(device, { ausd: 15_000_000n, usdc: 9_990_000n, mon: 0n }, { country: "fr", bank: "serves", card: "does-not", method: { method: "SEPA", currency: "EUR" } }, { coin: USDC_COIN, atLeast: "9990000", sinceMs: Date.now() - 60_000 });
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/cash-out");
      // The first screen, not step 2: what is ready is said, with the way back to it, and the rest can still be used.
      await expect(page.getByText("$9.99 of it is ready to send to Ramp.")).toBeVisible();
      await expect(page.getByRole("heading", { name: /^Step 2 of 3/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Send to my bank" })).toBeEnabled();
      // One sentence in the open on the card that decides, and the partner's ID check folded under it (rule 4).
      await expect(page.getByText("A transfer in euros to your IBAN, within two working days.", { exact: true })).toBeVisible();
      await expect(page.locator(".said-fold").getByText("Our partner Ramp asks for your ID, once.", { exact: true })).toHaveCount(1);
      await shot(page, size.name, "1a-first-screen-with-money-ready");

      await page.getByRole("button", { name: "Continue with Ramp" }).click();
      await expect(page.getByRole("heading", { name: "Step 2 of 3: Place your order with Ramp" })).toBeVisible();
      await expect(page.getByText("On Ramp's page, pick USDC, the one marked Monad, and type 9.99.")).toBeVisible();
      await expect(page.getByText("Ramp opens in a new tab and uses its own words.", { exact: true })).toBeVisible();
      await expect(page.getByText("Come back to this tab with the code it gives you.", { exact: true })).toBeVisible();
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
      await expect(bank.getByText("A transfer in dollars to your bank account.", { exact: true })).toBeVisible();
      await expect(bank.locator(".said-fold").getByText("Our partner Ramp asks for your ID, once.", { exact: true })).toHaveCount(1);
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

/**
 * A balance is never read as a withdrawal (the founder, 3 Oct 2026). A card payment delivers USDC, the coin the bank
 * service takes, and Home said "$5.60 of it is ready to send to Ramp" a moment after paying. A withdrawal is open only
 * when what was written down says so (src/open-withdrawal.ts).
 */
test.describe("money a card just delivered is money in the account, not a withdrawal", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);
  const FRANCE: Where = { country: "fr", bank: "serves", card: "serves", method: { method: "SEPA", currency: "EUR" } };

  test("Home says one amount and names no service; the withdrawal screen says nothing is ready", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    // The founder's account after his card payment of 3 Oct 2026: 0.66 of what a gift holds, 5.60 USDC just delivered,
    // and no withdrawal open.
    await person(device, { ausd: 660_000n, usdc: 5_600_948n, mon: 0n }, FRANCE);
    await page.goto("/");
    const money = page.locator(".money-display-box");
    await expect(money.getByRole("heading", { name: "In your account" })).toBeVisible();
    await expect(money.locator("[data-amount]")).toContainText("$6.26");
    await expect(money).not.toContainText(/ready|Ramp|Mercuryo/i);
    await expect(money.locator("p")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Spend or withdraw" })).toBeVisible();
    // The withdrawal screen: the same money, and nothing said to be ready, nothing to continue.
    await page.goto("/cash-out");
    await expect(page.getByRole("button", { name: "Send to my bank" })).toBeVisible();
    await expect(page.getByText(/ready to send to/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Continue with/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^Ready to send to/ })).toHaveCount(0);
    await device.context.close();
  });

  test("the chain's own coin, which a card payment delivers too, is not said on Home either", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    await person(device, { ausd: 0n, usdc: 0n, mon: 11n * ONE + (13_843n * ONE) / 100n }, FRANCE);
    await page.goto("/");
    const money = page.locator(".money-display-box");
    await expect(money.getByRole("heading", { name: "In your account" })).toBeVisible();
    await expect(money.locator("[data-amount]")).toContainText("$0.00");
    await expect(money).not.toContainText(/ready|Ramp|Mercuryo|138/i);
    // The way to the withdrawal screen is still offered: that is where what the account holds can leave.
    await expect(page.getByRole("link", { name: "Spend or withdraw" })).toBeVisible();
    await device.context.close();
  });

  test("a withdrawal that is open is said on the withdrawal screen alone, in the account's own currency", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    await person(device, { ausd: 15_000_000n, usdc: 9_990_000n, mon: 0n }, FRANCE, { coin: USDC_COIN, atLeast: "9990000", sinceMs: Date.now() - 60_000 }, "EUR");
    await page.goto("/");
    await expect(page.locator(".money-display-box")).not.toContainText(/ready|Ramp/i);
    await page.goto("/cash-out");
    // 9.99 dollars at 1.1355 dollars for a euro.
    await expect(page.getByText("about €8.80 of it is ready to send to Ramp.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Ramp" })).toBeVisible();
    await shot(page, "390", "4a-an-open-withdrawal-in-the-account-s-currency");
    await device.context.close();
  });

  test("less of the coin than the open withdrawal brought is not that withdrawal's money", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    // The way out of 16 Sep 2026 has no send written after it; the 5.60 held today came from a card.
    await person(device, { ausd: 660_000n, usdc: 5_600_948n, mon: 0n }, FRANCE, { coin: USDC_COIN, atLeast: "9990000", sinceMs: Date.now() - 17 * 86_400_000 });
    await page.goto("/cash-out");
    await expect(page.getByRole("button", { name: "Send to my bank" })).toBeVisible();
    await expect(page.getByText(/ready to send to/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Continue with/ })).toHaveCount(0);
    await device.context.close();
  });
});

/**
 * The same, on a build where Rampnow is the way in and its dollars can be changed (`NEXT_PUBLIC_RAMPNOW_WAY_IN=on`,
 * `NEXT_PUBLIC_USDC_ROUTER_ADDRESS`, `NEXT_PUBLIC_RAMPNOW_FRAME=on`; run with `VIKY_RAMPNOW_FRAME_BUILD=1`): Home after
 * a card payment and before the gift is made, and the withdrawal screen, which changes those dollars first.
 */
test.describe("after a card payment by Rampnow, before the gift is made", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.skip(process.env.VIKY_RAMPNOW_FRAME_BUILD !== "1", "needs a build with Rampnow's way and the step that changes its dollars");
  test.setTimeout(120_000);

  test("Home: the gift to finish, one amount in the account's currency, and no word of a withdrawal", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = device;
    const holdings: Holdings = { ausd: 660_000n, usdc: 0n, mon: 0n };
    await person(device, holdings, { country: "fr", bank: "serves", card: "serves", method: { method: "SEPA", currency: "EUR" } }, null, "EUR");
    await context.route("https://app.rampnow.io/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>Rampnow, stood in for by the test.</p>" }));
    await page.route("**/api/fund/rampnow-frame**", (route) => route.fulfill(json({ url: "https://app.rampnow.io/order/quote?stand-in=1" })));
    // The step that changes the dollars is refused here: this test moves nothing, and the dollars stay as delivered.
    let conversions = 0;
    await page.route("**/api/fund/convert/**", (route) => {
      conversions += 1;
      return route.fulfill(json({ code: "NOT_CONFIGURED", error: "Stood in for by the test. Nothing was taken." }, 503));
    });
    // A gift for Boo, paid by card: the wait opens, and the person goes back to Home before the dollars land.
    await page.goto("/");
    const card = page.locator('section[aria-labelledby="offer-card"]');
    await card.getByLabel("Their first name").fill("Boo");
    await card.locator("[data-card-action]").click();
    await page.locator("dialog.sheet[open]").last().getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first().click();
    await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
    holdings.usdc = 5_600_948n;
    await page.goto("/");
    const money = page.locator(".money-display-box");
    // 0.66 and 5.60 dollars, each cut to the cent, at 1.1355 dollars for a euro.
    await expect(money.locator("[data-amount]")).toContainText("€5.51");
    await expect(money).not.toContainText(/ready|Ramp/i);
    await expect(money.locator("p")).toHaveCount(1);
    await expect(page.locator("[data-finish-gift]").first()).toContainText("for Boo");
    // The figure counts to its value as it arrives: photographed once it has.
    await page.waitForTimeout(2_000);
    await shot(page, "390", "5a-home-after-a-card-payment-before-the-gift");
    // The withdrawal screen: nothing ready, and choosing a way changes the card's dollars first, by the gift's own step.
    await page.goto("/cash-out");
    await expect(page.getByText(/ready to send to/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Continue with/ })).toHaveCount(0);
    await shot(page, "390", "5b-the-withdrawal-screen-after-a-card-payment");
    const before = conversions;
    await page.getByRole("button", { name: "Send to my bank" }).click();
    await expect.poll(() => conversions, { timeout: 30_000 }).toBeGreaterThan(before);
    await expect(page.locator("main").getByRole("alert")).toHaveText("Part of your money could not be made ready just now. It is still in your account.");
    await context.close();
  });
});

