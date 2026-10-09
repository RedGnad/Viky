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
  /** Done on Home, signed in, just before the press that opens the sheet. */
  beforeTheSheet?: (funder: Profile) => Promise<void>;
  /** The address the person arrives by: Home's own unless said, or the link of the portal's instructions with its code. */
  at?: string;
  /** The window: a phone of 390 by 844 unless said. */
  size?: Readonly<{ width: number; height: number }>;
}>;

async function toTheSheet(browser: Parameters<typeof profile>[0], baseURL: string | undefined, setup: Setup): Promise<Profile> {
  const funder = await profile(browser, baseURL, setup.size ?? { width: 390, height: 844 });
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
  await page.goto(setup.at ?? "/");
  if (!setup.signedIn) await page.getByRole("link", { name: "Offer a gift" }).first().click();
  await card(page).getByLabel("Their first name").fill("Boo");
  if (setup.amount !== null) await card(page).getByLabel("how much").fill(setup.amount ?? "19");
  if (setup.beforeTheSheet) await setup.beforeTheSheet(funder);
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

/** Keeps whether the open sheet ever said "by card", at any moment: a figure that showed and went is still seen. */
const WATCH_FOR_THE_CARD = `(() => {
  const look = () => {
    const open = document.querySelector("dialog.sheet[open]");
    if (open && /by card/i.test(open.innerText)) sessionStorage.setItem("test.saidByCard", open.innerText.match(/[^\\n]*by card[^\\n]*/i)[0]);
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();`;

test.describe("the pay sheet waits for what the account holds (5 Oct 2026)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  test("enough in the account, read slowly and then not at all: the button never says 'by card', and does not go", async ({ browser, baseURL }) => {
    // What the chain's answers do, changed as the test goes: held back, refused, or let through.
    let chain: "held" | "refused" | "answered" = "answered";
    const heldBack: Array<() => void> = [];
    const funder = await toTheSheet(browser, baseURL, {
      ausd: 50_000_000n,
      signedIn: true,
      beforeTheSheet: async ({ context }) => {
        await context.addInitScript(WATCH_FOR_THE_CARD);
        // Registered after the route that answers the chain, so it is asked first.
        await context.route(
          (url) => url.hostname !== "localhost" && url.hostname !== "127.0.0.1",
          async (route) => {
            if (chain === "held") await new Promise<void>((release) => heldBack.push(release));
            if (chain === "refused") return route.abort();
            return route.fallback();
          },
        );
        chain = "held";
      },
    });
    const { page } = funder;
    await page.evaluate(WATCH_FOR_THE_CARD);
    const pay = sheet(page).locator("button[data-pays]");

    // Slow: nothing is named, the button does not go, and the wait is said under it.
    await expect(pay).toHaveAttribute("data-pays", "reading");
    await expect(pay).toHaveText("Pay");
    await expect(pay).toBeDisabled();
    await expect(sheet(page).getByText("Reading what your account holds.", { exact: true })).toBeVisible();
    await expect(sheet(page).locator("[data-pay-total]")).toHaveCount(0);
    await expect(sheet(page).getByText("Card fee")).toHaveCount(0);
    await shot(page, "10-the-account-being-read");

    // Then not at all: said, with what reads again. Still no way named, and still no press.
    chain = "refused";
    for (const release of heldBack.splice(0)) release();
    await expect(pay).toHaveAttribute("data-pays", "unread", { timeout: 60_000 });
    await expect(sheet(page).getByText("What your account holds could not be read.", { exact: true })).toBeVisible();
    await expect(pay).toHaveText("Pay");
    await expect(pay).toBeDisabled();
    await expect(sheet(page).getByText(/takes your card/)).toHaveCount(0);
    await shot(page, "11-the-account-not-read");

    // Read again, and answered: the account pays, as it could all along.
    chain = "answered";
    await sheet(page).getByRole("button", { name: "Read it again" }).click();
    await expect(pay).toHaveAttribute("data-pays", "account", { timeout: 60_000 });
    await expect(pay).toHaveText("Put €19.00 in Boo's name");
    await expect(pay).toBeEnabled();
    await shot(page, "12-the-account-read");
    expect(await page.evaluate(`sessionStorage.getItem("test.saidByCard")`), "at no moment did the sheet say 'by card'").toBeNull();
    await funder.context.close();
  });
});

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
    await expect(sheet(page).getByText(/takes your card and asks for .+\. By paying you are 18 or older/)).toBeVisible();
    await expect(sheet(page).locator("summary", { hasText: "How it works" })).toHaveCount(0);
    await shot(page, "1-signed-in");
    // The one fold, opened: three short lines, a label and its value, and no paragraph (the founder, 4 Oct 2026).
    await sheet(page).locator("summary", { hasText: "What happens to my money" }).click();
    await page.waitForTimeout(400);
    const fold = sheet(page).locator("[data-what-happens]");
    await expect(fold.locator("dl > div")).toHaveCount(3);
    await expect(fold.locator("dt")).toHaveText(["A missed day", "Not opened in 14 days", "Card fee"]);
    const folded = await fold.locator("dd").allInnerTexts();
    expect(folded.slice(0, 2)).toEqual(["back to you", "back to you"]);
    expect(folded[2], "the service's name and its fee, in a few characters").toMatch(/^\S+, (up to )?\d+(\.\d+)? %( \+ €\d+\.\d{2})?$|^\S+, €\d+\.\d{2}$/);
    await expect(fold.locator("p")).toHaveCount(0);
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

  test("no name: the field shows its example, and the fold says nothing of names", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 10_000_000n, signedIn: true, gifts: [] });
    const { page } = funder;
    const name = sheet(page).getByLabel("Your name, as Boo knows you");
    await expect(name).toHaveValue("");
    await expect(name).toHaveAttribute("placeholder", "Sam");
    await shot(page, "3-name-empty");
    await sheet(page).locator("summary", { hasText: "What happens to my money" }).click();
    await expect(sheet(page).locator("[data-what-happens] dt")).toHaveText(["A missed day", "Not opened in 14 days", "Card fee"]);
    await expect(sheet(page).getByText(/show(s)? on the gift/)).toHaveCount(0);
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
    const mine = { giftId: "1000", role: "recipient", funderName: "Mom", recipientName: "Boo", fundedAt: 1, takeable: "30000000" };
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
    // The wait: two short lines, the gift as it was typed and the account in the same money. No dollar on the screen.
    const lines = page.locator("main dl.said-lines").first();
    await expect(lines.locator("dt")).toHaveText(["Your gift", "In your account"]);
    await expect(lines.locator("dd").first()).toHaveText("€19.00 for Boo, 30 days");
    await expect(lines.locator("dd").nth(1)).toHaveText(/^€\d+\.\d{2}$/);
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

/**
 * The code first (the founder, 9 Oct 2026): three cases and one of them drawn. This walks the second, the judges'
 * path, and the key that leads to it from the third.
 *
 * The judge credit is answered here as the server would: open, one code, three dollars, once, and the account's
 * balance changed by it. Everything else is the built app: the account is made by the code's press, with a passkey
 * the browser holds for the test.
 *
 * VIKY_PAY_SHEET_CAPTURES=<folder> photographs each state at 390 by 844 and at 1440 by 900.
 */
const THE_CODE = "JUDGE-TEST";
const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function answerTheCode(funder: Profile, holdings: Holdings, over: Readonly<{ open?: boolean; credited?: boolean }> = {}): Promise<string[]> {
  let credited = over.credited ?? false;
  const sent: string[] = [];
  await funder.page.route("**/api/judge/credit", async (route) => {
    if (route.request().method() === "GET") return route.fulfill(json({ open: over.open ?? true, credited, untouchedCredit: credited ? "3000000" : null }));
    const code = (JSON.parse(route.request().postData() ?? "{}") as { code?: string }).code ?? "";
    sent.push(code);
    if (code !== THE_CODE) return route.fulfill(json({ error: "That is not the judge code.", code: "JUDGE_CODE_WRONG" }, 403));
    credited = true;
    holdings.ausd += 3_000_000n;
    return route.fulfill(json({ units: "3000000" }));
  });
  return sent;
}

async function shotAt(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()?.width}.png` });
}

/**
 * Keeps whether the open sheet ever offered a card, at any moment: its button, its fee or its line of terms. The line
 * that tells a judge how a funder pays by card is not an offer, and is not counted.
 */
const WATCH_FOR_A_CARD_OFFERED = `(() => {
  const look = () => {
    const open = document.querySelector("dialog.sheet[open]");
    if (!open) return;
    const button = open.querySelector('[data-pays="card"]');
    const line = open.innerText.match(/[^\\n]*(Card fee|takes your card|You pay)[^\\n]*/);
    if (button || line) sessionStorage.setItem("test.cardOffered", button ? "button: " + button.textContent : line[0]);
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();`;
const cardOffered = (page: Page) => page.evaluate(() => sessionStorage.getItem("test.cardOffered"));

test.describe("the code first on the pay sheet (9 Oct 2026)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  // The phone always; the computer when the states are photographed.
  for (const size of SHOTS ? SIZES : SIZES.slice(0, 1)) {
    test(`a judge by the portal's link, with no account: the sheet opens on the code, one press makes the account and uses it, and the credit pays (${size.width})`, async ({ browser, baseURL }) => {
      const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
      let sent: string[] = [];
      const funder = await toTheSheet(browser, baseURL, {
        ausd: 0n,
        holdings,
        signedIn: false,
        currency: "USD",
        amount: "10",
        at: `/?code=${THE_CODE}`,
        size,
        beforeTheSheet: async (judge) => {
          sent = await answerTheCode(judge, holdings);
          // Whatever the sheet offers of a card, at any moment from its first image on, is kept.
          await judge.page.evaluate(WATCH_FOR_A_CARD_OFFERED);
        },
      });
      const { page } = funder;
      // The code is the first choice: its field open with what the link carried, and its button the one action.
      await expect(sheet(page).getByLabel("Code", { exact: true })).toHaveValue(THE_CODE);
      const use = sheet(page).getByRole("button", { name: "Use the code", exact: true });
      await expect(use).toBeVisible();
      await expect(sheet(page).locator("[data-pays]")).toHaveCount(0);
      // The gift and what Viky takes, and nothing of a card: no fee, no total, no line of terms.
      await expect(sheet(page).locator("[data-pay-lines] > div > span:first-child")).toHaveText(["Boo's gift", "Viky takes"]);
      await expect(sheet(page).locator("[data-pay-total]")).toHaveCount(0);
      await expect(sheet(page).getByText(/takes your card/)).toHaveCount(0);
      // What that press makes is said before it: the account, and that it is an adult's.
      await expect(sheet(page).getByText("Your face or your fingerprint creates your account when you use the code.")).toBeVisible();
      await expect(sheet(page).locator("[data-adult]")).toBeVisible();
      await expect(sheet(page).getByRole("button", { name: "Pay without a code", exact: true })).toBeVisible();
      await expect(sheet(page).locator("[data-have-a-code]")).toHaveCount(0);
      await shotAt(page, "B1-the-code-from-the-link");

      await use.click();
      // The account is made, the code sent as the link carried it, and the credit said; the gift, more than the
      // credit, is brought to it.
      await expect(sheet(page).getByText("$3.00 from your judge credit is in your account.")).toBeVisible({ timeout: 60_000 });
      expect(sent).toEqual([THE_CODE]);
      await expect(sheet(page).getByText("Your gift is now $3.00, what your account holds.")).toBeVisible();
      const pay = sheet(page).getByRole("button", { name: "Pay $3.00 with your credit", exact: true });
      await expect(pay).toBeVisible({ timeout: 30_000 });
      await expect(sheet(page).getByText(/^Paid from your judge credit\./)).toBeVisible();
      await expect(sheet(page).getByLabel("Code", { exact: true })).toHaveCount(0);
      await expect(sheet(page).locator("[data-pay-total]")).toHaveText("$3.00");
      // The card under the sheet says the gift as it now is, and no longer the 10 that was typed.
      await expect(card(page).getByLabel("how much")).toHaveValue("3.00");
      // From the first image to this one, the sheet never offered a card, and the code is not kept once it is used.
      expect(await cardOffered(page)).toBeNull();
      expect(await page.evaluate(() => sessionStorage.getItem("viky.judge-code"))).toBeNull();
      await shotAt(page, "B2-the-credit-pays");

      await pay.click();
      await expect(page).toHaveURL(/\/fund\?step=paying/, { timeout: 30_000 });
      await funder.context.close();
    });

    test(`without the link: the card, and a small 'Have a code?' under its button that puts the code in the card's place (${size.width})`, async ({ browser, baseURL }) => {
      const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
      let sent: string[] = [];
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, holdings, signedIn: true, gifts: [], size, beforeTheSheet: async (judge) => void (sent = await answerTheCode(judge, holdings)) });
      const { page } = funder;
      const card = sheet(page).locator('[data-pays="card"]');
      await expect(card).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      // The key is small, and under the card's button and its line.
      const key = sheet(page).locator("[data-have-a-code]");
      await expect(key).toHaveText("Have a code?");
      const terms = sheet(page).getByText(/takes your card/);
      expect((await key.boundingBox())!.y).toBeGreaterThan((await terms.boundingBox())!.y);
      await shotAt(page, "C-the-key-under-the-card");

      await key.click();
      // The code in the card's place: an empty field, a button that waits for it, and nothing of the card.
      await expect(sheet(page).getByLabel("Code", { exact: true })).toHaveValue("");
      await expect(card).toHaveCount(0);
      await expect(sheet(page).locator("[data-pay-lines] > div > span:first-child")).toHaveText(["Boo's gift", "Viky takes"]);
      await expect(sheet(page).locator("[data-pay-total]")).toHaveCount(0);
      await expect(sheet(page).getByText(/takes your card/)).toHaveCount(0);
      await shotAt(page, "B3-opened-by-the-key");
      // A code that is not the one: the server's own sentence under the button, and the field stays.
      await sheet(page).getByLabel("Code", { exact: true }).fill("NOT-THE-CODE");
      await sheet(page).getByRole("button", { name: "Use the code", exact: true }).click();
      await expect(sheet(page).getByText("That is not the judge code.")).toBeVisible();
      expect(sent).toEqual(["NOT-THE-CODE"]);
      await expect(sheet(page).getByLabel("Code", { exact: true })).toHaveValue("NOT-THE-CODE");
      await shotAt(page, "B4-a-code-refused");
      // And back to the card, by the key that says what the person then does.
      await sheet(page).getByRole("button", { name: "Pay without a code", exact: true }).click();
      await expect(card).toBeVisible();
      await expect(sheet(page).getByLabel("Code", { exact: true })).toHaveCount(0);
      await funder.context.close();
    });
  }

  test("no code is offered once credits are closed or the account has had one, whatever the link carried", async ({ browser, baseURL }) => {
    for (const over of [{ open: false }, { credited: true }]) {
      const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, holdings, signedIn: true, gifts: [], at: `/?code=${THE_CODE}`, beforeTheSheet: async (judge) => void (await answerTheCode(judge, holdings, over)) });
      const { page } = funder;
      await expect(sheet(page).locator('[data-pays="card"]')).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      await expect(sheet(page).getByLabel("Code", { exact: true })).toHaveCount(0);
      await expect(sheet(page).locator("[data-have-a-code]")).toHaveCount(0);
      await funder.context.close();
    }
  });
});
