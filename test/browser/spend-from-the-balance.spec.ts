import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, shot as capture, sizesFor, type Profile } from "./gift-kit";

/**
 * Spending from the balance: one rule for the gift card and the phone top-up (the founder, 10 Oct 2026, on a mockup,
 * after the first real tester).
 *
 * What the tester met: the amount was asked twice, by buttons and then by a field; "See the price" was a press of its
 * own; he chose 10 EUR and read $12.05, which reads as a mark-up; and his five presses on "Buy the card" seemed to
 * show nothing, the refusal standing in a quiet line above the button.
 *
 * Walked here, with an account that reads in euros and holds 17.36 dollars. The amounts are buttons, the field stands
 * behind "Another amount". A press on an amount asks its price at once and shows it in place: the total in euros, and
 * one sentence with the card at its face value, the fees and what stays. No dollar figure is on the screen at any
 * step. The one button says "Buying the card" while it works; a refusal is said under it, and a price that ran out is
 * asked again by itself; then the code stands in the card's place.
 *
 * What is real: the product's screens against the server under test, a real account and its passkey, every press.
 * What is stood in for: the chain, Bitrefill's cards and prices, and the payment's route. Nothing is sent anywhere.
 *
 * VIKY_SPEND_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_SPEND_CAPTURES;
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

const RATES = { date: "2026-10-09", usdPerEur: 1.1355, eurPerUsd: 1 / 1.1355, xofPerUsd: 655.957 / 1.1355, eurPer: { USD: 1.1355, EUR: 1 }, readAtMs: Date.now() };
/** What a thing bought takes from the account, in the dollar's units: its face value at the day's rate, and a fee. */
const taken = (euros: number) => ({ ausdUnits: String(Math.round((euros * 1.1355 + 0.352) * 1_000_000)), feeUnits: "352000" });
const main = (page: Page) => page.locator("main");

type Asked = { price: Array<Record<string, unknown>>; pay: number };

/** Somebody signed in in France, reading in euros, with 17.36 dollars, and Bitrefill answered for. */
async function person(device: Profile, asked: Asked, pays: Array<"lapsed" | "delivered">): Promise<void> {
  const { page, context } = device;
  // What the account holds is read again after a payment: it holds that much less once a thing is paid.
  const holds = { ausd: 17_360_000n, mon: 0n, usdc: 0n };
  await answerTheChain(context, holds);
  await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
  await page.route("**/api/exit/open", (route) => route.fulfill(json({ open: null })));
  await page.route("**/api/rates", (route) => route.fulfill(json({ rates: { ...RATES, readAtMs: Date.now() }, currencies: ["USD", "EUR", "XOF"] })));
  await page.route("**/api/account/preferences", (route) => route.fulfill(json({ country: "fr", displayCurrency: "EUR" })));
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: { Ramp: "serves", Mercuryo: "serves" }, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: { method: "SEPA", currency: "EUR" }, cardSmallest: { amount: 15, currency: "EUR" }, bankSmallest: { amount: 6.69, currency: "EUR" } } })),
  );
  await page.route("**/api/fund/quote", (route) => route.fulfill(json({ output: "0", minOut: "0", to: "0x0000000000000000000000000000000000000001", data: "0x", value: "0" })));
  await page.route(/\/api\/giftcards\?country=/, (route) =>
    route.fulfill(
      json({
        cards: [
          { id: "amazon_fr-france", name: "Amazon.fr", worksIn: "Works on amazon.fr", currency: "EUR", range: { min: 5, max: 500, step: 0.01 }, packages: [10, 20, 50].map((value) => ({ id: `amazon-${value}`, value: String(value) })) },
          { id: "nike-france", name: "Nike France", worksIn: "Works in: France", currency: "EUR", range: { min: 5, max: 200, step: 1 }, packages: [] },
        ],
      }),
    ),
  );
  let kept: unknown[] = [];
  await page.route("**/api/giftcards/codes", (route) => route.fulfill(json({ cards: kept })));
  await page.route("**/api/giftcards/price", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { productId?: string; packageId?: string; value?: number };
    asked.price.push(body);
    const euros = body.packageId ? Number(body.packageId.split("-")[1]) : Number(body.value);
    // Long enough for the wait to be seen and photographed.
    await new Promise((done) => setTimeout(done, 500));
    return route.fulfill(json({ orderId: `ph_test_${String(asked.price.length).padStart(6, "0")}`, operatorName: body.productId === "nike-france" ? "Nike France" : "Amazon.fr", localAmount: String(euros), localCurrency: "EUR", to: "0x00000000000000000000000000000000000000aa", ...taken(euros) }));
  });
  await page.route("**/api/phone/pay", async (route) => {
    const outcome = pays[asked.pay] ?? "delivered";
    asked.pay += 1;
    await new Promise((done) => setTimeout(done, 900));
    if (outcome === "lapsed") return route.fulfill(json({ code: "PRICE_EXPIRED", error: "That price has run out. Start again: nothing was taken." }, 409));
    holds.ausd -= BigInt(taken(10).ausdUnits);
    kept = [{ orderId: "ph_test_000002", name: "Amazon.fr", localAmount: "10", localCurrency: "EUR", amount: "$11.70", at: new Date().toISOString(), code: { code: "AQ7K-M2XP-9TLD", link: "https://www.amazon.fr/gc/redeem", expires: "10 Oct 2036" } }];
    return route.fulfill(json({ orderId: "ph_test_000002", state: "delivered", amount: "$11.70", units: taken(10).ausdUnits, operatorName: "Amazon.fr", kind: "gift_card", code: { code: "AQ7K-M2XP-9TLD", link: "https://www.amazon.fr/gc/redeem", expires: "10 Oct 2036" } }));
  });
  await makeAnAccount(device);
}

/** No dollar figure anywhere on the screen: the account reads in euros. */
async function noDollars(page: Page, where: string): Promise<void> {
  expect(await main(page).innerText(), `${where}: no dollar beside the euros`).not.toMatch(/\$\s?\d/);
}

test.describe("spending from the balance", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  for (const size of sizesFor(SHOTS)) {
    test(`a gift card: its amounts are buttons, the price comes by itself in the reader's currency, and one button says what happened (${size.name})`, async ({ browser, baseURL }) => {
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      const asked: Asked = { price: [], pay: 0 };
      await person(device, asked, ["lapsed", "delivered"]);
      await page.goto("/cash-out");
      await page.getByRole("button", { name: "Choose a card", exact: true }).click();
      await page.getByRole("dialog").getByText("Amazon.fr", { exact: true }).click();

      // The amounts are buttons, the ones beyond the balance shown and said; a typed amount stands behind its button.
      const amounts = page.locator("[data-spend-amounts] button");
      await expect(amounts).toHaveText(["€10", "€20More than you have", "€50More than you have", "Another amount"]);
      await expect(amounts.nth(1)).toBeDisabled();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      // No press for a price, and nothing to buy before one stands.
      await expect(page.getByRole("button", { name: "See the price" })).toHaveCount(0);
      const buy = page.locator("[data-spend-pay]");
      await expect(buy).toHaveText("Buy the card");
      await expect(buy).toBeDisabled();
      await noDollars(page, "the amounts");
      await shot(page, size.name, "1-a-card-and-its-amounts");

      // A press on an amount asks its price at once, and says so while it is asked.
      await amounts.nth(0).click();
      await expect(page.locator("[data-spend-asking]")).toContainText("Asking the price");
      await shot(page, size.name, "2-the-price-is-asked-by-itself");
      const total = page.locator("[data-spend-total]");
      await expect(total).toBeVisible();
      expect(asked.price).toEqual([{ productId: "amazon_fr-france", packageId: "amazon-10" }]);
      // The total in euros, and one sentence: the card at its face value, the fees once, what stays.
      await expect(total.locator("p").nth(0)).toHaveText(/^€\d+\.\d\d$/);
      await expect(total.locator("p").nth(1)).toHaveText(/^A €10 Amazon\.fr card and €0\.\d\d of fees\. €\d+\.\d\d stays with you\.$/);
      await expect(buy).toBeEnabled();
      await noDollars(page, "the price");
      await shot(page, size.name, "3-the-total-in-place");
      await page.emulateMedia({ colorScheme: "dark" });
      await shot(page, size.name, "3-the-total-in-place-after-dark");
      await page.emulateMedia({ colorScheme: "light" });

      // The button carries what it is doing, and a refusal is said under it and nowhere else.
      await buy.click();
      await expect(buy).toHaveText("Buying the card");
      await expect(buy).toHaveAttribute("data-state", "doing");
      await shot(page, size.name, "4-buying-on-the-same-button");
      const refused = page.locator("#spend-refused");
      await expect(refused).toHaveText("That price has run out. Start again: nothing was taken.");
      // Asked of the page as a string: a function sent to it is compiled on the way and arrives calling a helper it lacks.
      expect(await page.evaluate(`Boolean(document.querySelector("#spend-refused").compareDocumentPosition(document.querySelector("[data-spend-pay]")) & Node.DOCUMENT_POSITION_PRECEDING)`), "the refusal stands under the button").toBe(true);
      // It is the one thing the card says of what did not happen: no line of its own above the button any more.
      expect(await page.evaluate(`[...document.querySelectorAll('main [role="alert"]')].map((line) => line.id)`)).toEqual(["spend-refused"]);
      // A price that ran out is asked again by itself: the same choice, a second asking, and the button lives again.
      await expect(total).toBeVisible();
      expect(asked.price.length).toBe(2);
      await expect(buy).toBeEnabled();
      await shot(page, size.name, "5-a-refusal-under-the-button");

      // The second press buys: the code stands in the card's place, with the card named at its face value.
      await buy.click();
      await expect(page.getByRole("heading", { name: "Your card" })).toBeVisible();
      await expect(main(page)).toContainText("A €10 Amazon.fr card.");
      await expect(main(page)).toContainText("AQ7K-M2XP-9TLD");
      await expect(main(page)).toContainText('It stays in "Your gift cards" below.');
      expect(asked.pay).toBe(2);
      // What the sentence under the total promised is what the balance now says: the same figure, read again.
      await expect(main(page)).toContainText("€4.98");
      await expect(main(page)).not.toContainText("€15.29");
      await noDollars(page, "the code");
      await shot(page, size.name, "6-the-code-in-its-place");
      await device.context.close();
    });
  }

  test("another amount: the field stands behind its button, alone where a card has no fixed amount, and is priced once the typing is over", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    const asked: Asked = { price: [], pay: 0 };
    await person(device, asked, []);
    await page.goto("/cash-out");
    await page.getByRole("button", { name: "Choose a card", exact: true }).click();
    await page.getByRole("dialog").getByText("Amazon.fr", { exact: true }).click();
    await page.locator("[data-spend-amounts] button").nth(0).click();
    await expect(page.locator("[data-spend-total]")).toBeVisible();

    // "Another amount" takes the fixed choice and its price away, and brings the field with the keyboard on it.
    await page.getByRole("button", { name: "Another amount" }).click();
    await expect(page.locator("[data-spend-total]")).toHaveCount(0);
    const field = page.getByRole("textbox");
    await expect(field).toBeFocused();
    await expect(main(page)).toContainText("How much, in euros");
    await expect(main(page)).toContainText("Between €5 and €500.");
    // Nothing is asked while the amount is being typed; one asking once it is over.
    await field.pressSequentially("12", { delay: 120 });
    expect(asked.price.length).toBe(1);
    await expect(page.locator("[data-spend-total] p").nth(1)).toHaveText(/^A €12 Amazon\.fr card and €0\.\d\d of fees\. €\d+\.\d\d stays with you\.$/);
    expect(asked.price[1]).toEqual({ productId: "amazon_fr-france", value: 12 });
    expect(asked.price.length).toBe(2);
    await shot(page, "390", "7-another-amount");
    // An amount outside the card's own bounds asks nothing and offers nothing to buy.
    await field.fill("3");
    await page.waitForTimeout(1_000);
    expect(asked.price.length).toBe(2);
    await expect(page.locator("[data-spend-pay]")).toBeDisabled();

    // A card with no fixed amount: the field alone, with no button to reach it.
    await page.getByRole("button", { name: "Choose another card" }).click();
    await page.getByRole("dialog").getByText("Nike France", { exact: true }).click();
    await expect(page.locator("[data-spend-amounts]")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toBeVisible();
    await expect(main(page)).toContainText("Between €5 and €200.");
    // Another card is another choice from nothing: no price left from the one before.
    await expect(page.locator("[data-spend-total]")).toHaveCount(0);
    await page.getByRole("textbox").fill("8");
    await expect(page.locator("[data-spend-total] p").nth(1)).toHaveText(/^An €8 Nike France card and €0\.\d\d of fees\. €\d+\.\d\d stays with you\.$/);
    await shot(page, "390", "8-a-card-with-no-fixed-amount");
    await device.context.close();
  });

  test("the phone top-up follows the same rule: whose phone, the amounts, the total with what stays, the one button", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    const asked: Asked = { price: [], pay: 0 };
    await person(device, asked, []);
    await page.route("**/api/phone/operators", (route) => route.fulfill(json({ operators: [{ id: "orange-france", name: "Orange", currency: "EUR", range: null, packages: [5, 10, 20].map((value) => ({ id: `orange-${value}`, value: String(value) })) }] })));
    await page.route("**/api/phone/price", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as { packageId?: string };
      asked.price.push(body);
      const euros = Number(String(body.packageId).split("-")[1]);
      return route.fulfill(json({ orderId: "ph_test_000009", operatorName: "Orange", localAmount: String(euros), localCurrency: "EUR", to: "0x00000000000000000000000000000000000000aa", ...taken(euros) }));
    });
    await page.goto("/cash-out");
    await page.getByRole("button", { name: "Top up my phone", exact: true }).click();
    await page.getByRole("textbox").fill("+33612345642");
    await page.getByRole("button", { name: "Find the phone company" }).click();

    // Whose phone it is, its middle left out, then the amounts as buttons.
    await expect(page.getByRole("heading", { name: "Your phone" })).toBeVisible();
    await expect(main(page)).toContainText("+336 •• •• •• 42 · Orange");
    await expect(page.locator("[data-spend-amounts] button")).toHaveText(["€5", "€10", "€20More than you have"]);
    await expect(page.getByRole("button", { name: "See the price" })).toHaveCount(0);
    await page.locator("[data-spend-amounts] button").nth(1).click();
    await expect(page.locator("[data-spend-total] p").nth(1)).toHaveText(/^€10 of credit on the phone, through Orange, and €0\.\d\d of fees\. €\d+\.\d\d stays with you\.$/);
    await expect(page.locator("[data-spend-pay]")).toHaveText("Top it up");
    await noDollars(page, "the phone");
    await shot(page, "390", "9-the-phone-top-up");
    await device.context.close();
  });
});
