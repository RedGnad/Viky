import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, makeAnAccount, profile, type Holdings, type Profile } from "./gift-kit";

/**
 * The pay sheet after the founder's mockup of 3 Oct 2026: the name first, lines that add up to what the card pays, in
 * the one money the gift was typed in, the code's small key above the one button, one line under it, and one fold.
 *
 * The reader counts in euros here (the currency's own cookie) and types 19 for a gift; the account holds $10.00. Which
 * card service stands depends on the build's settings, so the sum is read off the screen and checked as a sum.
 *
 * VIKY_PAY_SHEET_CAPTURES=<folder> also photographs the six states the founder asked for, at 390 by 844.
 */
const SHOTS = process.env.VIKY_PAY_SHEET_CAPTURES;
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const sheetCard = card;
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

/** The one line under the card's button, read back as figures: "€8.00 gift, €1.04 card fee, €0.08 stays yours." */
async function theCardSum(page: Page): Promise<{ gift: number; part: boolean; fee: number; stays: number; text: string }> {
  const text = (await sheet(page).locator("[data-card-sum]").innerText()).trim();
  const read = text.match(/^[€$](\d+\.\d{2}) (gift|of the gift), (?:up to )?[€$](\d+\.\d{2}) card fee(?:, [€$](\d+\.\d{2}) stays yours)?\.$/);
  expect(read, text).not.toBeNull();
  return { gift: Number(read![1]), part: read![2] === "of the gift", fee: Number(read![3]), stays: Number(read![4] ?? 0), text };
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
    // The gift, what the account puts in, and that Viky takes nothing: the fee and what stays are not lines any more.
    expect(labels).toEqual(["Boo's gift", "From your Viky money", "Viky takes"]);
    const total = (await sheet(page).locator("[data-pay-total]").innerText()).trim();
    // One money format: every figure is written in euros, to the cent, and nothing is "about": a reader in euros is
    // asked in euros, by Rampnow's rule as by any other.
    for (const value of [...values.slice(0, -1), total]) expect(value).toMatch(/^(− )?€\d+\.\d{2}$/);
    // One line under the button: the part of the gift the card pays, the fee, what stays. They add up to the card's
    // figure, to the cent, and the part is the gift less what the account puts in.
    const said = await theCardSum(page);
    expect(said.part).toBe(true);
    expect(Math.round((said.gift + said.fee + said.stays) * 100)).toBe(Math.round(figure(total) * 100));
    const rest = values.slice(0, -1).reduce((running, value) => running + figure(value), 0);
    expect(Math.round(said.gift * 100)).toBe(Math.round(rest * 100));
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
 * A judge's code on the pay sheet (the founder, 9 Oct 2026): visible, and never put forward in the card's place. The
 * card stays the sheet's one action. When the link carried a code, its field comes first, above the total, small;
 * otherwise a small "Have a code?" stands under the price, right above the card's button, and opens the field there.
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

async function answerTheCode(funder: Profile, holdings: Holdings, over: Readonly<{ open?: boolean; credited?: boolean; slowMs?: number }> = {}): Promise<string[]> {
  let credited = over.credited ?? false;
  const sent: string[] = [];
  await funder.page.route("**/api/judge/credit", async (route) => {
    if (route.request().method() === "GET") {
      if (over.slowMs) await new Promise((done) => setTimeout(done, over.slowMs));
      return route.fulfill(json({ open: over.open ?? true, credited, untouchedCredit: credited ? "3000000" : null }));
    }
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
 * Keeps whether the sheet ever offered a card once the credit was said to be in the account: the second between the
 * credit and the reading that shows it used to say "Pay … by card" to somebody who had just been given the money.
 */
const WATCH_FOR_A_CARD_AFTER_THE_CREDIT = `(() => {
  const look = () => {
    const open = document.querySelector("dialog.sheet[open]");
    if (!open || !open.innerText.includes("is in your account")) return;
    const button = open.querySelector('[data-pays="card"]');
    if (button) sessionStorage.setItem("test.cardAfterTheCredit", button.textContent || "a card button");
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();`;

/** How tall and how wide a thing is drawn, and where: to say which of two is the larger call. */
const drawn = async (page: Page, name: string | RegExp) => (await sheet(page).getByRole("button", { name, exact: typeof name === "string" }).boundingBox())!;

test.describe("a judge's code on the pay sheet: visible, and small beside the card (9 Oct 2026)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  // The phone always; the computer when the states are photographed.
  for (const size of SHOTS ? SIZES : SIZES.slice(0, 1)) {
    test(`a judge by the portal's link, with no account: the code first and small, the card still the one action, and one press of the code makes the account and the credit pay (${size.width})`, async ({ browser, baseURL }) => {
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
          await judge.page.evaluate(WATCH_FOR_A_CARD_AFTER_THE_CREDIT);
        },
      });
      const { page } = funder;
      // The code is there from the first image, in its field, under the question as its name.
      const field = sheet(page).getByLabel("Have a code?", { exact: true });
      await expect(field).toHaveValue(THE_CODE);
      // The card is still the sheet's one action, with its figure, its line and its total.
      const card = sheet(page).locator('[data-pays="card"]');
      if (process.env.VIKY_RAMPNOW_FRAME_BUILD) {
        // The sheet counts in dollars and Rampnow's page is opened in dollars for it: the figure is what the card is
        // charged, on the total and on the button.
        await expect(card).toHaveText(/^Pay \$\d+\.\d{2} by card$/);
        await expect(sheet(page).locator("[data-pay-total]")).toHaveText(/^\$\d+\.\d{2}$/);
      } else {
        // The sheet counts in dollars and the card is charged in euros: the total is said about, and the button says
        // the euros really charged.
        await expect(card).toHaveText(/^Pay €\d+\.\d{2} by card$/);
        await expect(sheet(page).locator("[data-pay-total]")).toHaveText(/^about \$\d+\.\d{2}$/);
      }
      // The button says what the card is charged, so no other line says it.
      await expect(sheet(page).locator("[data-card-charged]")).toHaveCount(0);
      await expect(sheet(page).getByText(/takes your card/)).toBeVisible();
      // First, and small: the code's field and its button stand above the card's button, and the button is the
      // smaller of the two, in height and in width.
      const use = await drawn(page, "Use the code");
      const pay = (await card.boundingBox())!;
      expect((await field.boundingBox())!.y).toBeLessThan(pay.y);
      expect(use.y).toBeLessThan(pay.y);
      expect(use.height).toBeLessThan(pay.height);
      expect(use.width).toBeLessThan(pay.width / 2);
      // Nothing leads back to the card: it never left.
      await expect(sheet(page).getByText(/without a code/i)).toHaveCount(0);
      // What either press makes is said before it: the account, and that it is an adult's.
      await expect(sheet(page).getByText("Your face or your fingerprint creates your account when you press pay or use the code.")).toBeVisible();
      await shotAt(page, "B1-the-code-from-the-link");

      await sheet(page).getByRole("button", { name: "Use the code", exact: true }).click();
      // The account is made, the code sent as the link carried it, and the credit said; the gift, more than the
      // credit, is brought to it.
      await expect(sheet(page).getByText("$3.00 from your judge credit is in your account.")).toBeVisible({ timeout: 60_000 });
      expect(sent).toEqual([THE_CODE]);
      await expect(sheet(page).getByText("Your gift is now $3.00, what your account holds.")).toBeVisible();
      const withCredit = sheet(page).getByRole("button", { name: "Pay $3.00 with your credit", exact: true });
      await expect(withCredit).toBeVisible({ timeout: 30_000 });
      await expect(sheet(page).getByText(/^Paid from your judge credit\./)).toBeVisible();
      await expect(field).toHaveCount(0);
      await expect(sheet(page).locator("[data-pay-total]")).toHaveText("$3.00");
      // The card under the sheet says the gift as it now is, and no longer the 10 that was typed.
      await expect(sheetCard(page).getByLabel("how much")).toHaveValue("3.00");
      // Once the credit was said, the sheet never offered a card again; and the code is not kept once it is used.
      expect(await page.evaluate(() => sessionStorage.getItem("test.cardAfterTheCredit"))).toBeNull();
      expect(await page.evaluate(() => sessionStorage.getItem("viky.judge-code"))).toBeNull();
      await shotAt(page, "B2-the-credit-pays");

      await withCredit.click();
      await expect(page).toHaveURL(/\/fund\?step=paying/, { timeout: 30_000 });
      await funder.context.close();
    });

    test(`without the link: the card, and a small 'Have a code?' under the price and right above the card's button, which opens the code's field there (${size.width})`, async ({ browser, baseURL }) => {
      const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
      let sent: string[] = [];
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, holdings, signedIn: true, gifts: [], size, beforeTheSheet: async (judge) => void (sent = await answerTheCode(judge, holdings)) });
      const { page } = funder;
      const card = sheet(page).locator('[data-pays="card"]');
      await expect(card).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      // The key is small, under the price and right above the card's button: nothing stands between the two. Under
      // the button, the card service's line.
      const key = sheet(page).locator("[data-have-a-code]");
      await expect(key).toHaveText("Have a code?");
      const total = sheet(page).locator("[data-pay-total]");
      const terms = sheet(page).getByText(/takes your card/);
      const keyAt = (await key.boundingBox())!;
      const totalAt = (await total.boundingBox())!;
      const cardAt = (await card.boundingBox())!;
      expect(keyAt.y).toBeGreaterThanOrEqual(totalAt.y + totalAt.height);
      expect(keyAt.y + keyAt.height).toBeLessThanOrEqual(cardAt.y);
      expect(cardAt.y - (keyAt.y + keyAt.height), "right above the button").toBeLessThan(40);
      expect(cardAt.y).toBeLessThan((await terms.boundingBox())!.y);
      expect(keyAt.height).toBeLessThan(cardAt.height);
      await shotAt(page, "C-the-key-above-the-button");

      await key.click();
      // The field opens where the key stood, between the price and the card's button, which is still the one action.
      // Read against its neighbours as they now stand: a sheet that grew for the field moved up with all it holds.
      const field = sheet(page).getByLabel("Code", { exact: true });
      await expect(field).toHaveValue("");
      await expect(card).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      const use = await drawn(page, "Use the code");
      const totalNow = (await total.boundingBox())!;
      expect((await field.boundingBox())!.y).toBeGreaterThanOrEqual(totalNow.y + totalNow.height);
      expect(use.y + use.height).toBeLessThanOrEqual((await card.boundingBox())!.y);
      expect(use.height).toBeLessThan((await card.boundingBox())!.height);
      await expect(sheet(page).getByText(/without a code/i)).toHaveCount(0);
      await shotAt(page, "B3-opened-by-the-key");
      // A code that is not the one: the server's own sentence under its button, and the field stays.
      await field.fill("NOT-THE-CODE");
      await sheet(page).getByRole("button", { name: "Use the code", exact: true }).click();
      await expect(sheet(page).getByText("That is not the judge code.")).toBeVisible();
      expect(sent).toEqual(["NOT-THE-CODE"]);
      await expect(field).toHaveValue("NOT-THE-CODE");
      await expect(card).toBeVisible();
      await shotAt(page, "B4-a-code-refused");
      await funder.context.close();
    });
  }

  test("the key's place is kept while the server has not said a code can be used: the card's button does not move when the key is drawn", async ({ browser, baseURL }) => {
    const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
    const funder = await toTheSheet(browser, baseURL, { ausd: 0n, holdings, signedIn: true, gifts: [], beforeTheSheet: async (judge) => void (await answerTheCode(judge, holdings, { slowMs: 4000 })) });
    const { page } = funder;
    const card = sheet(page).locator('[data-pays="card"]');
    await expect(card).toHaveText(/^Pay €\d+\.\d{2} by card$/);
    // The answer has not come: nothing of a code is drawn, and its place is held.
    await expect(sheet(page).locator("[data-code-place]")).toHaveCount(1);
    await expect(sheet(page).locator("[data-have-a-code]")).toHaveCount(0);
    const before = (await card.boundingBox())!.y;
    const key = sheet(page).locator("[data-have-a-code]");
    await expect(key).toBeVisible({ timeout: 15_000 });
    await expect(sheet(page).locator("[data-code-place]")).toHaveCount(0);
    expect((await card.boundingBox())!.y).toBe(before);
    await funder.context.close();
  });

  test("no code is offered once credits are closed or the account has had one, whatever the link carried", async ({ browser, baseURL }) => {
    for (const over of [{ open: false }, { credited: true }]) {
      const holdings: Holdings = { ausd: 0n, mon: 0n, usdc: 0n };
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, holdings, signedIn: true, gifts: [], at: `/?code=${THE_CODE}`, beforeTheSheet: async (judge) => void (await answerTheCode(judge, holdings, over)) });
      const { page } = funder;
      await expect(sheet(page).locator('[data-pays="card"]')).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      await expect(sheet(page).locator("#gift-code")).toHaveCount(0);
      await expect(sheet(page).locator("[data-have-a-code]")).toHaveCount(0);
      await expect(sheet(page).locator("[data-code-place]")).toHaveCount(0);
      await funder.context.close();
    }
  });
});

/**
 * The third case, the card (the founder, 9 Oct 2026): asked to the cent where its service takes cents, said in one
 * line under the button that adds up to what the button says, and not offered under the service's smallest payment.
 *
 * Which card service stands depends on the build's settings, so the figures are read off the screen and checked as a
 * sum. A build with Rampnow's settings (VIKY_RAMPNOW_FRAME_BUILD=1) is also held to the founder's own example: a gift
 * of 8 euros, its fee of 1.04, and a few cents that stay. With no key of Rampnow's set, which is how these builds run,
 * its page is opened in dollars by the rule (9 Oct 2026): a sheet read in euros says the card's figure "about", and
 * the dollars the card is charged under the line. The figure moves by a cent with the day's rate.
 */
const RAMPNOW_BUILD = Boolean(process.env.VIKY_RAMPNOW_FRAME_BUILD);

test.describe("the card on the pay sheet: one line that adds up, and no card under the floor (9 Oct 2026)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  for (const size of SHOTS ? SIZES : SIZES.slice(0, 1)) {
    test(`the card: one line under its button, which adds up to the cent to what the button says (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], amount: RAMPNOW_BUILD ? "8" : "19", size });
      const { page } = funder;
      const button = sheet(page).locator('[data-pays="card"]');
      await expect(button).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      const pays = figure((await button.innerText()).replace(/^Pay | by card$/g, ""));
      const said = await theCardSum(page);
      expect(said.part).toBe(false);
      expect(Math.round((said.gift + said.fee + said.stays) * 100)).toBe(Math.round(pays * 100));
      // The gift and what Viky takes above; no line for the fee, and none for what stays.
      await expect(sheet(page).locator("[data-pay-lines] > div > span:first-child")).toHaveText(["Boo's gift", "Viky takes"]);
      await expect(sheet(page).getByText("Change, kept in your account")).toHaveCount(0);
      // Under the button, and above the line that says who takes the card.
      const line = (await sheet(page).locator("[data-card-sum]").boundingBox())!;
      expect(line.y).toBeGreaterThan((await button.boundingBox())!.y);
      expect(line.y).toBeLessThan((await sheet(page).getByText(/takes your card/).boundingBox())!.y);
      if (RAMPNOW_BUILD) {
        // To the cent: what stays is the part in a hundred a rate needs, and no longer the rest of a whole euro.
        expect([said.gift, said.fee]).toEqual([8, 1.04]);
        expect(said.stays).toBeGreaterThan(0);
        expect(said.stays).toBeLessThanOrEqual(0.1);
        // A reader in euros is asked in euros, with no key of Rampnow's as with one: the figure is what the card is
        // charged, and nothing is "about".
        await expect(sheet(page).locator("[data-pay-total]")).toHaveText(/^€\d+\.\d{2}$/);
        await expect(sheet(page).locator("[data-card-charged]")).toHaveCount(0);
      }
      await shotAt(page, "C1-the-card-and-its-line");
      await funder.context.close();
    });

    test(`under the card service's smallest payment: no card, the floor said, and one press makes the gift an amount a card can pay for (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], amount: RAMPNOW_BUILD ? "3" : "2", size });
      const { page } = funder;
      await expect(sheet(page).locator("[data-card-floor]")).toHaveText(/^Card payments start at [€$]\d+\.\d{2}\.$/);
      const raise = sheet(page).locator('[data-pays="floor"]');
      await expect(raise).toHaveText(/^Make the gift €\d+\.00$/);
      await expect(sheet(page).locator('[data-pays="card"]')).toHaveCount(0);
      await expect(sheet(page).locator("[data-card-sum]")).toHaveCount(0);
      await expect(sheet(page).locator("[data-pay-total]")).toHaveCount(0);
      await expect(sheet(page).getByText(/takes your card/)).toHaveCount(0);
      if (RAMPNOW_BUILD) {
        await expect(sheet(page).locator("[data-card-floor]")).toHaveText("Card payments start at €5.00.");
        await expect(raise).toHaveText("Make the gift €4.00");
      }
      const proposed = (await raise.innerText()).replace("Make the gift ", "");
      await shotAt(page, "C2-under-the-floor");

      await raise.click();
      // The gift is what the button said, on the sheet and on the card under it, and the card now pays for it.
      await expect(sheet(page).locator("[data-pay-lines] > div > span:last-child").first()).toHaveText(proposed);
      const button = sheet(page).locator('[data-pays="card"]');
      await expect(button).toHaveText(/^Pay €\d+\.\d{2} by card$/);
      await expect(sheet(page).locator("[data-card-floor]")).toHaveCount(0);
      const said = await theCardSum(page);
      expect(Math.round(said.gift * 100)).toBe(Math.round(figure(proposed) * 100));
      expect(Math.round((said.gift + said.fee + said.stays) * 100)).toBe(Math.round(figure((await button.innerText()).replace(/^Pay | by card$/g, "")) * 100));
      expect(Number(await card(page).getByLabel("how much").inputValue())).toBe(figure(proposed));
      if (RAMPNOW_BUILD) {
        expect([said.gift, said.fee]).toEqual([4, 1]);
        expect(said.stays).toBeLessThanOrEqual(0.06);
      }
      await shotAt(page, "C3-the-gift-raised");
      await funder.context.close();
    });
  }
});

/**
 * Rampnow in the reader's currency, by its own quote (the founder, 9 Oct 2026). The quote is asked of our own route,
 * which is answered here as Rampnow's answer would make it answer; the page is told quotes are asked on this
 * deployment, which the server says on the page itself when the key is set. Only a build with Rampnow's settings
 * offers Rampnow, so these run on one (VIKY_RAMPNOW_FRAME_BUILD=1).
 */
type Quote = Readonly<Record<string, unknown>>;

async function answerTheQuote(funder: Profile, answer: Quote | null, waitMs = 0): Promise<string[]> {
  const asked: string[] = [];
  await funder.page.route("**/api/rails/card-quote**", async (route) => {
    asked.push(new URL(route.request().url()).search);
    if (waitMs) await new Promise((done) => setTimeout(done, waitMs));
    if (answer === null) return route.abort();
    return route.fulfill(json(answer));
  });
  await funder.page.evaluate(() => {
    document.body.dataset.cardQuotes = "on";
  });
  return asked;
}

test.describe("Rampnow's own quote on the pay sheet, in the money the sheet is read in (9 Oct 2026)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.skip(!RAMPNOW_BUILD, "Rampnow is offered only on a build with its settings");
  test.setTimeout(150_000);

  for (const size of SHOTS ? SIZES : SIZES.slice(0, 1)) {
    test(`a quote in euros: the figure is the quote's, said exactly, and its line adds up to it (${size.width})`, async ({ browser, baseURL }) => {
      let asked: string[] = [];
      const funder = await toTheSheet(browser, baseURL, {
        ausd: 0n,
        signedIn: true,
        gifts: [],
        amount: "8",
        size,
        beforeTheSheet: async (payer) => void (asked = await answerTheQuote(payer, { state: "quoted", quote: { currency: "EUR", amount: 9.12, fee: 1.0435, arrives: 9.07 } })),
      });
      const { page } = funder;
      const button = sheet(page).locator('[data-pays="card"]');
      await expect(button).toHaveText("Pay €9.12 by card");
      // Exactly: no "about", and no line of what the card is charged, since the figure is what it is charged.
      await expect(sheet(page).locator("[data-pay-total]")).toHaveText("€9.12");
      await expect(sheet(page).locator("[data-card-sum]")).toHaveText("€8.00 gift, €1.04 card fee, €0.08 stays yours.");
      await expect(sheet(page).locator("[data-card-charged]")).toHaveCount(0);
      await expect(sheet(page).getByText("Working out your total.")).toHaveCount(0);
      // Asked once, for the sheet's money and the USDC the gift needs, and nothing of a person.
      expect(asked.length).toBe(1);
      expect(asked[0]).toMatch(/^\?currency=EUR&units=\d+$/);
      await shotAt(page, "Q1-the-quote-in-the-readers-money");
      await funder.context.close();
    });

    test(`while the quote is asked: no figure, the button waits and says so, and stays in its place when the figure lands (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, {
        ausd: 0n,
        signedIn: true,
        gifts: [],
        amount: "8",
        size,
        beforeTheSheet: async (payer) => void (await answerTheQuote(payer, { state: "quoted", quote: { currency: "EUR", amount: 9.12, fee: 1.0435, arrives: 9.07 } }, 2_400)),
      });
      const { page } = funder;
      const button = sheet(page).locator('[data-pays="card"]');
      await expect(sheet(page).getByText("Working out your total.")).toBeVisible();
      await expect(button).toBeDisabled();
      await expect(sheet(page).locator("[data-pay-total]")).toHaveCount(0);
      await expect(sheet(page).locator("[data-pay-total-awaited]")).toHaveCount(1);
      await expect(sheet(page).locator("[data-card-sum]")).toHaveCount(0);
      expect(await sheet(page).innerText()).not.toMatch(/by card/i);
      const before = (await button.boundingBox())!.y;
      await shotAt(page, "Q2-the-quote-being-asked");
      await expect(button).toHaveText("Pay €9.12 by card", { timeout: 15_000 });
      await expect(button).toBeEnabled();
      // The total's place was kept, so the button stays where it was: within the pixel or two by which the line that
      // adds up, under it, is shorter than the line that says the wait.
      expect(Math.abs((await button.boundingBox())!.y - before)).toBeLessThan(2);
      await funder.context.close();
    });

    test(`a reader in euros whose quote does not answer in three seconds is asked in euros by the rule, exactly as before (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], amount: "8", size, beforeTheSheet: async (payer) => void (await answerTheQuote(payer, { state: "quoted", quote: { currency: "EUR", amount: 9.5, fee: 1.0435, arrives: 9.07 } }, 7_000)) });
      const { page } = funder;
      const button = sheet(page).locator('[data-pays="card"]');
      await expect(button).toHaveText(/^Pay €\d+\.\d{2} by card$/, { timeout: 15_000 });
      // The sheet of today: euros to the cent, said exactly, and never a dollar.
      await expect(sheet(page).locator("[data-pay-total]")).toHaveText(/^€\d+\.\d{2}$/);
      const said = await theCardSum(page);
      expect([said.gift, said.fee]).toEqual([8, 1.04]);
      expect(Math.round((said.gift + said.fee + said.stays) * 100)).toBe(Math.round(figure((await button.innerText()).replace(/^Pay | by card$/g, "")) * 100));
      expect(await sheet(page).innerText()).not.toMatch(/\$/);
      const settled = await button.innerText();
      await shotAt(page, "Q3-no-answer-a-reader-in-euros-stays-in-euros");
      // The answer that comes after it changes nothing: the figure the person may be pressing does not move.
      await page.waitForTimeout(5_000);
      await expect(button).toHaveText(settled);
      expect(settled).not.toBe("Pay €9.50 by card");
      await funder.context.close();
    });

    test(`a reader in euros with no quote to say: the rule in euros at once, and the address of today (${size.width})`, async ({ browser, baseURL }) => {
      for (const none of [{ state: "none", because: "off" }, { state: "none", because: "silent" }, { state: "none", because: "not-understood" }, null] as const) {
        const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], amount: "8", size, beforeTheSheet: async (payer) => void (await answerTheQuote(payer, none)) });
        const { page } = funder;
        await expect(sheet(page).locator('[data-pays="card"]')).toHaveText(/^Pay €\d+\.\d{2} by card$/);
        await expect(sheet(page).locator("[data-pay-total]")).toHaveText(/^€\d+\.\d{2}$/);
        expect(await sheet(page).innerText()).not.toMatch(/\$|about/);
        await funder.context.close();
      }
    });

    test(`a reader in a money Rampnow gives no quote in: the total about, in that money; the button and its line in the dollars charged (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], currency: "XOF", amount: "6000", size, beforeTheSheet: async (payer) => void (await answerTheQuote(payer, { state: "none", because: "not-taken" })) });
      const { page } = funder;
      const button = sheet(page).locator('[data-pays="card"]');
      await expect(button).toHaveText(/^Pay \$\d+\.\d{2} by card$/);
      // The total in francs, said about; the gift's own line in francs, as typed.
      await expect(sheet(page).locator("[data-pay-total]")).toHaveText(/^about [\d\s\u00a0]+FCFA$/);
      await expect(sheet(page).locator("[data-pay-lines] > div > span:last-child").first()).toHaveText(/^6[\s\u00a0]000[\s\u00a0]FCFA$/);
      // The line under the button is in dollars and adds up to what the button says the card is charged.
      const said = await theCardSum(page);
      expect(said.text).toMatch(/^\$\d+\.\d{2} gift, \$\d+\.\d{2} card fee/);
      expect(Math.round((said.gift + said.fee + said.stays) * 100)).toBe(Math.round(figure((await button.innerText()).replace(/^Pay | by card$/g, "")) * 100));
      await expect(sheet(page).locator("[data-card-charged]")).toHaveCount(0);
      expect(await sheet(page).innerText()).not.toMatch(/Your card is charged/);
      await shotAt(page, "Q5-a-money-with-no-quote-the-dollars-charged");
      await funder.context.close();
    });

    test(`under the floor for that reader: the floor in their own money, said about, beside the gift the button proposes (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], currency: "XOF", amount: "2000", size, beforeTheSheet: async (payer) => void (await answerTheQuote(payer, { state: "none", because: "not-taken" })) });
      const { page } = funder;
      await expect(sheet(page).locator("[data-card-floor]")).toHaveText(/^Card payments start at about [\d\s\u00a0]+FCFA\.$/);
      await expect(sheet(page).locator('[data-pays="floor"]')).toHaveText(/^Make the gift [\d\s\u00a0]+FCFA$/);
      await expect(sheet(page).locator('[data-pays="card"]')).toHaveCount(0);
      expect(await sheet(page).innerText()).not.toMatch(/\$/);
      await shotAt(page, "Q6-under-the-floor-in-a-money-with-no-quote");
      await funder.context.close();
    });

    test(`under Rampnow's smallest payment, by its own answer: the floor in the sheet's money, and the gift a card pays for (${size.width})`, async ({ browser, baseURL }) => {
      const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], amount: "3", size, beforeTheSheet: async (payer) => void (await answerTheQuote(payer, { state: "under", currency: "EUR", smallest: 5 })) });
      const { page } = funder;
      await expect(sheet(page).locator("[data-card-floor]")).toHaveText("Card payments start at €5.00.");
      await expect(sheet(page).locator('[data-pays="floor"]')).toHaveText("Make the gift €4.00");
      await expect(sheet(page).locator('[data-pays="card"]')).toHaveCount(0);
      await expect(sheet(page).locator("[data-pay-total]")).toHaveCount(0);
      await shotAt(page, "Q4-under-the-floor-by-the-quote");
      await funder.context.close();
    });
  }

  test("the press opens Rampnow's frame on the amount and the currency the sheet said", async ({ browser, baseURL }) => {
    const funder = await toTheSheet(browser, baseURL, { ausd: 0n, signedIn: true, gifts: [], amount: "8", beforeTheSheet: async (payer) => void (await answerTheQuote(payer, { state: "quoted", quote: { currency: "EUR", amount: 9.12, fee: 1.0435, arrives: 9.07 } })) });
    const { page } = funder;
    // The frame's address is asked of our own route, which is answered here with a page that goes nowhere.
    const frames: string[] = [];
    await page.route("**/api/fund/rampnow-frame**", (route) => {
      frames.push(new URL(route.request().url()).search);
      return route.fulfill(json({ url: "about:blank" }));
    });
    const button = sheet(page).locator('[data-pays="card"]');
    await expect(button).toHaveText("Pay €9.12 by card");
    await button.click();
    await expect(page).toHaveURL(/\/fund\?step=paying/, { timeout: 30_000 });
    // Asked for the amount and the currency the press was made on, once what is left to pay has been read.
    await expect.poll(() => frames.includes("?currency=EUR&amount=9.12"), { timeout: 30_000 }).toBe(true);
    expect(frames.filter((asked) => asked !== "" && asked !== "?currency=EUR&amount=9.12")).toEqual([]);
    await funder.context.close();
  });
});
