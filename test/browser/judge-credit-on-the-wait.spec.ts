import { expect, test, type Page } from "@playwright/test";
import { TERMS, daily, serve } from "./gift-fixtures";
import { answerTheChain, json, makeAnAccount, needsAContract, neverAskedToBeTold, profile, type Holdings } from "./gift-kit";

/**
 * A judge credit under the gift, typed on the wait (the founder, 11 Oct 2026).
 *
 * A first funder presses pay by card, lands on the screen that waits for the payment, and types the judge code there.
 * The credit is three dollars and the gift nineteen: the gift is brought to what the account holds (D300), and the
 * wait makes it. Since the wait makes only the gift whose payment this device started (src/pending-gift.ts), the
 * card rewritten by the credit has to be written as a payment started too, as "Make it" writes it: written as a card
 * alone, nothing was made and the credit stayed in the account.
 *
 * Walked here: one gift is made, of the credit's amount, for the name on the card, and no second one follows.
 *
 * What is real: the product's pages against the server under test, a real account and its passkey, every press. What
 * is stood in for: the chain, the judge credit, the creation and the gift's own page. On a build that names no gift
 * contract the creation is never sent, and the test says so and stops.
 */
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const THE_CODE = "JUDGE-TEST";
const GIFT = "78";

test.describe("a judge credit under the gift, typed on the wait", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: the case opens its own window");
  test.setTimeout(180_000);

  test("the gift becomes the credit, and one gift of that amount is made", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await neverAskedToBeTold(context);
    // An account that holds nothing: the gift is to be paid by card.
    const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
    await answerTheChain(context, holdings);
    await page.route("**/api/rails/where**", (route) =>
      route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: {}, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: null, cardSmallest: null } })),
    );
    // The judge credit, as the server would answer it: open, one code, three dollars, once, and in the account at once.
    let credited = false;
    await page.route("**/api/judge/credit", (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ open: true, credited, untouchedCredit: credited ? "3000000" : null }));
      const code = (JSON.parse(route.request().postData() ?? "{}") as { code?: string }).code ?? "";
      if (code !== THE_CODE) return route.fulfill(json({ error: "That is not the judge code.", code: "JUDGE_CODE_WRONG" }, 403));
      credited = true;
      holdings.ausd += 3_000_000n;
      return route.fulfill(json({ units: "3000000" }));
    });
    const sent: string[] = [];
    await page.route("**/api/gift/create", (route) => {
      sent.push(route.request().postData() ?? "");
      return route.fulfill(json({ giftId: GIFT, claimUrl: `${funder.baseURL}/g/${GIFT}?t=AbCdEfGhIjKlMnOpQrStUv`, funded: true }));
    });
    await serve(page, GIFT, () => daily(GIFT, "funder", { opened: false, connected: false, creditedDays: 0, days: [], startDay: 0, endDay: 0, claimedAtChain: 0, amount: "3000000", amountDisplay: "$3.00" }), TERMS.daily, null);
    await makeAnAccount(funder);

    // Nineteen dollars for Boo, paid by card: the press writes the payment down and opens the wait.
    await page.goto("/");
    await card(page).getByLabel("Their first name").fill("Boo");
    await card(page).getByLabel("how much").fill("19");
    await card(page).locator("[data-card-action]").click();
    await sheet(page).getByRole("button", { name: /^Pay \S+ by card$/ }).click();
    await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
    const started = JSON.parse(String(await page.evaluate(`localStorage.getItem("viky.pendingGift")`))) as { dollars: string; wayIn?: string };
    expect(Number(started.dollars), "nineteen dollars, as it was typed").toBe(19);
    expect(started.wayIn, "the pay press named the way in").toBeTruthy();
    // Nothing in the account, so nothing is made yet, however long the wait looks.
    await page.waitForTimeout(3_000);
    expect(sent).toEqual([]);

    // The code, typed on the wait: three dollars, under the gift.
    await page.locator("[data-have-a-code]").click();
    await page.locator("#gift-code").fill(THE_CODE);
    await page.getByRole("button", { name: "Use the code", exact: true }).click();

    // The gift is the credit's now, written down as a payment started: the wait makes it, once.
    const reached = await expect.poll(() => sent.length, { timeout: 40_000 }).toBeGreaterThan(0).then(() => true, () => false);
    needsAContract(reached);
    expect(JSON.parse(sent[0])).toMatchObject({ recipientName: "Boo", amount: "3000000" });
    await page.waitForURL(new RegExp(`/g/${GIFT}$`), { timeout: 30_000 });
    // Longer than the wait's own look at the account (eight seconds): no second gift, of any amount.
    await page.waitForTimeout(10_000);
    expect(sent.length, "one gift, of the credit's amount").toBe(1);
    // Made, so nothing is left on this device to finish.
    expect(await page.evaluate(`localStorage.getItem("viky.pendingGift")`)).toBeNull();
    await context.close();
  });
});
