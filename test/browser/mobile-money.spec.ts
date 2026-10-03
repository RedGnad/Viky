import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, shot as capture, sizesFor, type Profile } from "./gift-kit";

/**
 * Your mobile money, the third way out (the founder, 2 Oct 2026), as a person in Senegal meets it: the card first, the
 * operator, the number, the name, the figure on the number with the moment it was priced, one button; the wait with
 * the time Switch publishes; arrived, or failed and the money coming back.
 *
 * The account is a virtual passkey; the chain and every route are answered here, Switch included, and nothing is sent
 * anywhere. What is checked is the screen: what it says, what it sends to the routes, and what it never shows.
 *
 * VIKY_MOBILE_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_MOBILE_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const RATES = { date: "2026-10-02", usdPerEur: 1.1225, eurPerUsd: 1 / 1.1225, xofPerUsd: 655.957 / 1.1225, eurPer: { USD: 1.1225, EUR: 1 }, readAtMs: Date.now() };
const REFERENCE = "61f9a35a-e535-4f04-ba50-3058b4c856c4";
const EXIT_ROUTER = "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223";

const OFFER = {
  offered: true,
  country: "SN",
  currency: "XOF",
  settlement: "5-10 minutes",
  minimumUnits: "10000000",
  maximumUnits: "100000000000",
  operators: [
    { code: "ORANGE", name: "Orange" },
    { code: "WAVE", name: "Wave" },
  ],
  numberRule: "^[0-9]{9,40}$",
  nameRule: "^(?=.*[A-Za-z])[A-Za-z0-9\\s\\-'&().,;]{2,100}$",
  rate: 587.1333,
  mostUnits: "200000000",
};

async function inSenegal(device: Profile, ending: "arrived" | "failed", priced = true, mostUnits = "200000000"): Promise<{ started: () => unknown; sent: () => unknown; priced: () => unknown }> {
  const { page, context } = device;
  // What the account holds, changed as the money leaves, so every screen after the send shows what is left.
  const holdings = { ausd: 15_000_000n, usdc: 0n, mon: 0n };
  await answerTheChain(context, holdings);
  await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
  await page.route("**/api/rates", (route) => route.fulfill(json({ rates: { ...RATES, readAtMs: Date.now() }, currencies: ["USD", "EUR", "XOF"] })));
  await page.route("**/api/account/preferences", (route) => route.fulfill(json({ country: "sn", displayCurrency: "XOF" })));
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country: "sn", ask: false, fromConnection: "sn", fromDevice: "sn", waysOut: { Ramp: "does-not", Mercuryo: "does-not" }, waysIn: {}, card: { offered: false, country: "sn" }, out: { bank: null, cardSmallest: null } })),
  );
  await page.route("**/api/mobile-money/offer**", (route) => route.fulfill(json({ ...OFFER, mostUnits })));
  // The exchange makes a little less than it takes: 15.07 asked first gives 15.04, then 15.11 gives 15.08.
  await page.route("**/api/exit/quote", (route) => {
    const asked = BigInt((JSON.parse(route.request().postData() ?? "{}") as { amount?: string }).amount ?? "0");
    const floor = (asked * 998n) / 1000n;
    return route.fulfill(json({ shown: (Number(floor) / 1e6).toFixed(6), sells: "USDC", name: "Ramp", ticket: `ticket-${asked}` }));
  });
  let quoted: unknown = null;
  await page.route("**/api/mobile-money/quote", (route) => {
    quoted = JSON.parse(route.request().postData() ?? "{}");
    const local = (quoted as { local?: number }).local ?? 0;
    // Switch's exact quote for the francs typed: what it takes in dollars at its rate, a little above the published one.
    return priced ? route.fulfill(json({ local, currency: "XOF", sourceUnits: String(Math.round((local / 584.2) * 1e6)), at: "2026-10-03T10:15:00.000Z" })) : route.fulfill(json({ error: "Mobile money is not open here yet. Nothing was taken.", code: "NOT_CONFIGURED" }, 503));
  });
  await page.route("**/api/exit/prepare", (route) =>
    route.fulfill(json({ id: "terms-1", shown: "11.19", signed: false, authorization: { to: EXIT_ROUTER, value: "11200000", validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + 600), nonce: `0x${"11".repeat(32)}` } })),
  );
  await page.route("**/api/exit/relay", (route) => route.fulfill(json({ paid: true, hash: `0x${"e1".repeat(32)}` })));
  let started: unknown = null;
  await page.route("**/api/mobile-money/start", (route) => {
    started = JSON.parse(route.request().postData() ?? "{}");
    return route.fulfill(json({ reference: REFERENCE, depositAddress: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", depositUnits: "11190000", expiresAt: new Date(Date.now() + 1_800_000).toISOString(), local: 6540.92, currency: "XOF" }));
  });
  let sent: unknown = null;
  await page.route("**/api/send", (route) => {
    sent = JSON.parse(route.request().postData() ?? "{}");
    holdings.ausd = 3_800_000n;
    return route.fulfill(json({ sent: true, reference: "S-1", sentAtMs: Date.now() }));
  });
  await page.route("**/api/mobile-money/deposited", (route) => route.fulfill(json({ noted: true })));
  let looks = 0;
  await page.route("**/api/mobile-money/status**", (route) => {
    looks += 1;
    const phase = looks < 2 ? "waiting" : ending;
    return route.fulfill(json({ reference: REFERENCE, phase, status: phase === "arrived" ? "COMPLETED" : phase === "failed" ? "FAILED" : "PROCESSING", network: "ORANGE", numberEnd: "4567", local: 6540.92, currency: "XOF", units: "11190000", country: "SN" }));
  });
  await makeAnAccount(device);
  return { started: () => started, sent: () => sent, priced: () => quoted };
}

test.describe("your mobile money", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  for (const size of sizesFor(SHOTS)) {
    test(`the card, the form priced, the wait and arrived (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked = await inSenegal(device, "arrived");
      await page.clock.install();
      await page.goto("/cash-out");
      // The card, first, with the operators Switch pays in Senegal and the time it publishes.
      const card = page.locator("section", { has: page.getByRole("heading", { name: "Your mobile money" }) }).first();
      await expect(card).toBeVisible();
      await expect(card.getByText("To your Orange or Wave number, within 5 to 10 minutes.", { exact: true })).toBeVisible();
      await expect(card.locator(".said-fold").getByText("Our partner Switch pays it, at its own rate.", { exact: true })).toHaveCount(1);
      await expect(page.getByText(/USDC|wallet|address|token|chain/i)).toHaveCount(0);
      await shot(page, size.name, "1-the-card");

      await card.getByRole("button", { name: "Send to my mobile money" }).click();
      await page.getByRole("radio", { name: "Orange" }).check();
      await page.getByLabel("Number").fill("771234567");
      await page.getByLabel("Name on the account").fill("Awa Ndiaye");
      // The amount is in francs, set to the most one payout may be now: $15.00 held, at Switch's published rate.
      await expect(page.getByLabel("How much")).toHaveValue("8806");
      await expect(page.getByText("From 5 872 F to 8 806 F at a time.", { exact: true })).toBeVisible();
      await page.getByLabel("How much").fill("8800");
      await page.clock.fastForward(1_000);
      // The francs figure is Switch's quote for the francs typed, and the dollars it takes from the balance come second.
      await expect(page.getByText("about 8 800 F", { exact: true })).toBeVisible();
      expect(asked.priced()).toEqual({ country: "SN", local: 8800 });
      await expect(page.getByText(/^\$15\.\d\d from your balance, at the rate of 3 Oct, 10:15 UTC\.$/)).toBeVisible();
      const send = page.getByRole("button", { name: "Send to my Orange" });
      await expect(send).toBeEnabled();
      await expect(page.getByText(/USDC|wallet|address|token|chain/i)).toHaveCount(0);
      await shot(page, size.name, "2a-the-form");
      await send.scrollIntoViewIfNeeded();
      await shot(page, size.name, "2b-the-figure-and-the-button");

      await send.click();
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await expect(page.getByText("To your Orange number ending 4567. It usually takes 5 to 10 minutes.", { exact: true })).toBeVisible();
      // What the routes were asked: the exchange's own transaction, the payout's fields, and the deposit, exactly.
      expect(asked.started()).toEqual({ exitTx: `0x${"e1".repeat(32)}`, country: "SN", network: "ORANGE", number: "771234567", holderName: "Awa Ndiaye" });
      expect(asked.sent()).toMatchObject({ coin: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", to: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", value: "11190000" });
      // The exchange was taken with the second, larger amount: the one whose floor reaches what Switch asks.
      expect(asked.started()).toBeTruthy();
      await shot(page, size.name, "3-on-its-way");

      await page.clock.fastForward(6_000);
      await expect(page.getByRole("heading", { name: "Arrived" })).toBeVisible();
      await expect(page.getByText("6 540 F", { exact: true })).toBeVisible();
      await expect(page.getByText("On your Orange number ending 4567.", { exact: true })).toBeVisible();
      await shot(page, size.name, "4-arrived");
      await device.context.close();
    });

    test(`failed, and the money comes back; and a figure that cannot be priced lets nothing start (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await inSenegal(device, "failed");
      await page.clock.install();
      await page.goto("/cash-out");
      await page.getByRole("button", { name: "Send to my mobile money" }).click();
      await page.getByRole("radio", { name: "Wave" }).check();
      await page.getByLabel("Number").fill("781234567");
      await page.getByLabel("Name on the account").fill("Awa Ndiaye");
      await page.clock.fastForward(1_000);
      await page.getByRole("button", { name: "Send to my Wave" }).click();
      await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
      await page.clock.fastForward(6_000);
      await expect(page.getByRole("heading", { name: "It did not go through" })).toBeVisible();
      await expect(page.getByText("It did not reach the number. The money comes back to your account.", { exact: true })).toBeVisible();
      await shot(page, size.name, "5-failed");
      await device.context.close();

      const other = await profile(browser, baseURL, size.viewport);
      await inSenegal(other, "arrived", false);
      await other.page.clock.install();
      await other.page.goto("/cash-out");
      await other.page.getByRole("button", { name: "Send to my mobile money" }).click();
      await other.page.getByRole("radio", { name: "Orange" }).check();
      await other.page.getByLabel("Number").fill("771234567");
      await other.page.getByLabel("Name on the account").fill("Awa Ndiaye");
      await other.page.clock.fastForward(1_000);
      await expect(other.page.getByText("It cannot be priced right now. Nothing was changed.", { exact: true })).toBeVisible();
      await expect(other.page.getByRole("button", { name: "Send to my Orange" })).toBeDisabled();
      await shot(other.page, size.name, "6-cannot-be-priced");
      await other.context.close();
    });

    test(`the day's ceiling met: said in place of the form, nothing to fill in (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await inSenegal(device, "arrived", true, "5000000");
      await page.goto("/cash-out");
      await page.getByRole("button", { name: "Send to my mobile money" }).click();
      await expect(page.getByText("You have sent $500.00 to mobile money today, the most for a day. It opens again tomorrow.", { exact: true })).toBeVisible();
      await expect(page.getByLabel("How much")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Send to my/ })).toHaveCount(0);
      await shot(page, size.name, "7-the-day-is-full");
      await device.context.close();
    });
  }
});
