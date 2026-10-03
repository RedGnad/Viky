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

type Setup = Readonly<{ ausd: bigint; signedIn: boolean; gifts?: unknown[]; offered?: boolean; country?: string }>;

async function toTheSheet(browser: Parameters<typeof profile>[0], baseURL: string | undefined, setup: Setup): Promise<Profile> {
  const funder = await profile(browser, baseURL, { width: 390, height: 844 });
  const { page, context } = funder;
  const holdings: Holdings = { ausd: setup.ausd, mon: 0n, usdc: 0n };
  await answerTheChain(context, holdings);
  // The profile's own address, which may be another name for the server than the one the run was given.
  const host = new URL(funder.baseURL).hostname;
  await context.addCookies([{ name: "viky.currency", value: "EUR", domain: host, path: "/" }]);
  const country = setup.country ?? "fr";
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country, ask: false, fromConnection: country, fromDevice: country, waysOut: {}, waysIn: {}, card: { offered: setup.offered ?? true, country }, out: { bank: null, cardSmallest: null } })),
  );
  if (setup.gifts) await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: setup.gifts })));
  if (setup.signedIn) await makeAnAccount(funder);
  await page.goto("/");
  if (!setup.signedIn) await page.getByRole("link", { name: "Offer a gift" }).first().click();
  await card(page).getByLabel("Their first name").fill("Boo");
  await card(page).getByLabel("how much").fill("19");
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
    await expect(sheet(page).getByRole("button", { name: "I already have an account" })).toBeVisible();
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
