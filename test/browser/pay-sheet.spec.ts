import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, type Holdings, type Profile } from "./gift-kit";

/**
 * The pay sheet after the founder's mockup of 3 Oct 2026: the name first, lines that add up to what the card pays, in
 * the one money the gift was typed in, one button, one line under it, one fold, and the code last.
 *
 * The reader counts in euros here (the currency's own cookie) and types 19 for a gift; the account holds $10.00. Which
 * card service stands depends on the build's settings, so the sum is read off the screen and checked as a sum.
 *
 * VIKY_PAY_SHEET_CAPTURES=<folder> also photographs the six states the founder asked for, at 390 by 844.
 */
const SHOTS = process.env.VIKY_PAY_SHEET_CAPTURES;
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();

type Setup = Readonly<{
  ausd: bigint;
  signedIn: boolean;
  gifts?: unknown[];
  offered?: boolean;
  country?: string;
  /** The account as the chain answers it, when the test changes it as it goes. */
  holdings?: Holdings;
  /** The money the reader counts in: the euro unless said. */
  currency?: string;
  /** What is typed in "how much": 19 unless said; null leaves the figure the card started on. */
  amount?: string | null;
}>;

async function toTheSheet(browser: Parameters<typeof profile>[0], baseURL: string | undefined, setup: Setup): Promise<Profile> {
  const funder = await profile(browser, baseURL, { width: 390, height: 844 });
  const { page, context } = funder;
  const holdings: Holdings = setup.holdings ?? { ausd: setup.ausd, mon: 0n, usdc: 0n };
  await answerTheChain(context, holdings);
  // The profile's own address, which may be another name for the server than the one the run was given.
  const host = new URL(funder.baseURL).hostname;
  await context.addCookies([{ name: "viky.currency", value: setup.currency ?? "EUR", domain: host, path: "/" }]);
  const country = setup.country ?? "fr";
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country, ask: false, fromConnection: country, fromDevice: country, waysOut: {}, waysIn: {}, card: { offered: setup.offered ?? true, country }, out: { bank: null, cardSmallest: null } })),
  );
  if (setup.gifts) await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: setup.gifts })));
  if (setup.signedIn) await makeAnAccount(funder);
  await page.goto("/");
  if (!setup.signedIn) await page.getByRole("link", { name: "Offer a gift" }).first().click();
  await card(page).getByLabel("Their first name").fill("Boo");
  if (setup.amount !== null) await card(page).getByLabel("how much").fill(setup.amount ?? "19");
  await card(page).locator("[data-card-action]").click();
  await expect(sheet(page)).toBeVisible();
  await page.waitForTimeout(900);
  return funder;
}

/** "€19.00", "− €8.24", "up to €1.24": the figure, signed by what it does to the sum. */
function figure(text: string): number {
  const amount = Number(text.replace(/[^0-9.]/g, ""));
  return text.trim().startsWith("−") ? -amount : amount;
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-390.png` });
}

test.describe("the pay sheet of 3 Oct 2026", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  test("signed in: the name first, lines that add up to the card's figure, in the money typed, and one action", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 10_000_000n, signedIn: true, gifts: [{ role: "funder", funderName: "Mum", fundedAt: 1 }] });
    const { page } = funder;
    // The name this account gave last, in the field and not as its example.
    await expect(sheet(page).getByLabel("Your name, as Boo knows you")).toHaveValue("Mum");
    const values = await sheet(page).locator("[data-pay-lines] > div > span:last-child").allInnerTexts();
    const labels = await sheet(page).locator("[data-pay-lines] > div > span:first-child").allInnerTexts();
    expect(labels[0]).toBe("Boo's gift");
    expect(values[0]).toBe("€19.00");
    expect(labels).toContain("Card fee");
    expect(labels[labels.length - 1]).toBe("Viky takes");
    const total = (await sheet(page).locator("[data-pay-total]").innerText()).trim();
    // One money format: every figure is written in euros, to the cent, and nothing is "about".
    for (const value of [...values.slice(0, -1), total]) expect(value).toMatch(/^(− |up to )?€\d+\.\d{2}$/);
    // The gift, less the account's part, plus the fee, plus what stays: the card's figure, to the cent.
    const sum = values.slice(0, -1).reduce((running, value) => running + figure(value), 0);
    expect(Math.round(sum * 100)).toBe(Math.round(figure(total) * 100));
    await expect(sheet(page).getByRole("button", { name: `Pay ${total} by card` })).toBeVisible();
    // Signed in, the phone's own prompt says what the passkey does: no line about it, and no link warning here.
    await expect(sheet(page).getByText(/Your face or your fingerprint/)).toHaveCount(0);
    await expect(sheet(page).getByText(/opens the gift for whoever opens it first/)).toHaveCount(0);
    await expect(sheet(page).getByText(/takes your card, with your ID the first time\. By paying you are 18 or older/)).toBeVisible();
    await expect(sheet(page).locator("summary", { hasText: "How it works" })).toHaveCount(0);
    await shot(page, "1-signed-in");
    // The one fold, opened: what happens to the money, the card service's first time, its fee and the rate.
    await sheet(page).locator("summary", { hasText: "What happens to my money" }).click();
    await page.waitForTimeout(400);
    await expect(sheet(page).getByText("Boo's name and yours show on the gift, to whoever opens its link.")).toBeVisible();
    await expect(sheet(page).getByText(/Euros at the European Central Bank's rate of/)).toBeVisible();
    await sheet(page).locator("[data-what-happens]").scrollIntoViewIfNeeded();
    await shot(page, "4-fold-open");
    await funder.context.close();
  });

  test("the first time: the account is made by the press, and said under it", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: false });
    const { page } = funder;
    await expect(sheet(page).getByText(/Your face or your fingerprint creates your account when you press pay/)).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await shot(page, "2-first-time");
    await funder.context.close();
  });

  test("no name: the field shows its example, and the fold's sentence stands whole", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 10_000_000n, signedIn: true, gifts: [] });
    const { page } = funder;
    const name = sheet(page).getByLabel("Your name, as Boo knows you");
    await expect(name).toHaveValue("");
    await expect(name).toHaveAttribute("placeholder", "Mum");
    await shot(page, "3-name-empty");
    await sheet(page).locator("summary", { hasText: "What happens to my money" }).click();
    await expect(sheet(page).getByText("Boo's name shows on the gift, to whoever opens its link.")).toBeVisible();
    await funder.context.close();
  });

  test("paid from the account alone: no card line, and the account's figure is the action's", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 30_000_000n, signedIn: true, gifts: [] });
    const { page } = funder;
    await expect(sheet(page).locator("[data-pay-total]")).toHaveText("€19.00");
    await expect(sheet(page).getByRole("button", { name: "Put €19.00 in Boo's name" })).toBeVisible();
    await expect(sheet(page).getByText(/takes your card/)).toHaveCount(0);
    await shot(page, "5-from-the-account");
    await funder.context.close();
  });

  test("what the person's gifts have paid them pays a gift: counted in 'From your Viky money', and taken first by the press", async ({ browser, baseURL }) => {
    // Nothing in the account, and thirty dollars a gift has already paid this person and still holds: Home says
    // $30.00, and this sheet said "Pay by card" for a gift of nineteen euros (the founder, 4 Oct 2026).
    const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
    const mine = { giftId: "1000", role: "recipient", funderName: "Maman", recipientName: "Boo", fundedAt: 1, takeable: "30000000" };
    const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [mine], holdings });
    const { page } = funder;
    await expect(sheet(page).locator("[data-pay-total]")).toHaveText("€19.00");
    await expect(sheet(page).getByText("From your Viky money", { exact: true })).toBeVisible();
    await expect(sheet(page).getByText(/takes your card/)).toHaveCount(0);
    await expect(sheet(page).getByRole("button", { name: /by card$/ })).toHaveCount(0);
    await shot(page, "7-from-what-a-gift-has-paid");

    // The press: the gifts' part is taken into the account first, by the way out's own gesture, then the gift is made.
    const calls: string[] = [];
    await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [{ giftId: "1000", escrow: "0x591d76863177E70FfcA2C793212d4715A367Ec70", earned: "30000000", nonce: "0" }] })));
    await page.route("**/api/gift/withdraw", (route) => {
      const asked = JSON.parse(route.request().postData() ?? "{}") as { giftId?: string; amount?: string };
      calls.push(`withdraw ${asked.giftId} ${asked.amount}`);
      holdings.ausd += 30_000_000n;
      return route.fulfill(json({ sent: true }));
    });
    await page.route("**/api/gift/create", (route) => {
      calls.push("create");
      return route.fulfill(json({ error: "Not made in this test.", code: "TEST" }, 409));
    });
    await sheet(page).getByRole("button", { name: "Put €19.00 in Boo's name" }).click();
    await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
    await expect.poll(() => calls[0], { timeout: 30_000 }).toBe("withdraw 1000 30000000");
    // Then the gift is made from the account. Nothing can be made in this test, on a build with the contracts set or
    // without them, so the making stops on its refusal, which only the making leads to.
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 30_000 });
    expect(calls.filter((call) => call.startsWith("withdraw")), "taken once").toHaveLength(1);
    expect(calls.indexOf("create"), "and never made before it was taken").not.toBe(0);
    // No card was asked for at any moment: the wait never offered one.
    await expect(page.getByRole("link", { name: /by card/ })).toHaveCount(0);
    await funder.context.close();
  });

  test("one writing of money: what was typed is what is read, on the sheet, on the wait and on the card that says it is not made yet", async ({ browser, baseURL }) => {
    // Nineteen euros typed, ten dollars in the account: from the wait on, the gift was said in dollars (the founder,
    // 4 Oct 2026: "Your gift: $50.51 for Boo" after 45 euros typed).
    const funder = await toTheSheet(browser, baseURL, { ausd: 10_000_000n, signedIn: true, gifts: [] });
    const { page } = funder;
    await expect(sheet(page).locator("[data-pay-lines] > div > span:last-child").first()).toHaveText("€19.00");
    await sheet(page).getByRole("button", { name: /^Pay \S+ by card$/ }).click();
    await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
    // The wait: the gift as it was typed, and the account in the same money. No dollar on the screen.
    await expect(page.getByText("Your gift: €19.00 for Boo, 30 days.")).toBeVisible();
    await expect(page.getByText(/^In your account now: €\d+\.\d{2}$/)).toBeVisible();
    await expect(page.locator("main")).not.toContainText("$");
    await shot(page, "8-the-wait-in-the-money-typed");
    // Home and Gifts: the card that says the gift is not made yet says it as typed too.
    await page.goto("/");
    await expect(page.locator("[data-finish-gift]")).toContainText("€19.00 for Boo");
    await expect(page.locator("[data-finish-gift]")).not.toContainText("$");
    await page.goto("/gifts");
    await expect(page.locator("[data-finish-gift]")).toContainText("€19.00 for Boo");
    await funder.context.close();
  });

  test("a figure the card started on is the figure the sheet says: round francs are not read back from their dollars", async ({ browser, baseURL }) => {
    // A reader who counts in CFA francs and types nothing: the card starts on a round figure, and the sheet said
    // "F CFA 19,997" for 20,000 (the founder, 4 Oct 2026).
    const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], currency: "XOF", amount: null });
    const { page } = funder;
    const started = (await card(page).getByLabel("how much").inputValue()).replace(/\D/g, "");
    expect(Number(started) % 1_000, `the card starts on a round figure (${started})`).toBe(0);
    const gift = (await sheet(page).locator("[data-pay-lines] > div > span:last-child").first().innerText()).replace(/\D/g, "");
    expect(gift, "and the sheet says that figure").toBe(started);
    await shot(page, "9-the-sheet-says-the-round-francs");
    await funder.context.close();
  });

  test("where no card serves the country: the account's part, and the sentence in place of the action", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 10_000_000n, signedIn: true, gifts: [], offered: false, country: "ir" });
    const { page } = funder;
    await expect(sheet(page).getByText(/^Card payment isn't available in Iran\. You can pay with money already in your Viky account/)).toBeVisible();
    // Said whole: the sheet has one fold, and it is not this sentence's.
    await expect(sheet(page).locator("summary", { hasText: "How it works" })).toHaveCount(0);
    await expect(sheet(page).getByRole("button", { name: /by card$/ })).toHaveCount(0);
    await shot(page, "6-card-not-offered");
    await funder.context.close();
  });
});
