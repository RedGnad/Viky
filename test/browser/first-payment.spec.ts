import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, json, neverAskedToBeTold, profile, shot, sizesFor, type Holdings } from "./gift-kit";
import { signedIn } from "./virtual-passkey";

/**
 * The first payment in one gesture, and the way back to it (the audit of 1 Oct 2026, findings P-01, P-03, F-20, P-31).
 *
 * What was measured before this: a first funder pressed "Pay", the system asked for a passkey that did not exist, the
 * sheet said "That did not go through", "Create my account" shut the sheet, and they had to find the card's action and
 * press it again: seven presses and two system sheets. Then, having paid and closed the tab as the waiting screen
 * invites, Home said nothing of the gift. And a conversion that failed was tried again without a pause, 596 times in
 * twelve seconds.
 *
 * The account is a virtual passkey with nothing on it, so the press has to make one. The chain is answered here: what
 * the account holds is this test's to say, and nothing is ever sent to it.
 *
 * VIKY_FIRST_PAYMENT_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_FIRST_PAYMENT_CAPTURES;
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');

/** Counts the system sheets the page asks for, and notes whether Home was ever drawn for an account. */
const WATCH = `(() => {
  const count = (name) => {
    const real = navigator.credentials[name].bind(navigator.credentials);
    navigator.credentials[name] = (options) => {
      const seen = JSON.parse(localStorage.getItem("test.ceremonies") || '{"create":0,"get":0}');
      seen[name] += 1;
      localStorage.setItem("test.ceremonies", JSON.stringify(seen));
      return real(options);
    };
  };
  count("create");
  count("get");
  new MutationObserver(() => {
    const forAnAccount = Array.prototype.some.call(document.querySelectorAll("h2"), (title) => title.textContent === "What's moving");
    if (location.pathname === "/" && forAnAccount) localStorage.setItem("test.homeForAnAccount", "seen");
  }).observe(document, { subtree: true, childList: true });
})();`;

async function fillTheCard(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Offer a gift" }).first().click();
  await card(page).getByLabel("Their first name").fill("Boo");
}

test.describe("the first payment, and the way back to it", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  for (const size of sizesFor(SHOTS)) {
    test(`pay makes the account, the sheet stands until the wait, and Home leads back to it (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      const holdings: Holdings = { ausd: 0n, mon: 0n };
      await answerTheChain(context, holdings);
      await context.addInitScript(WATCH);
      let quotes = 0;
      await page.route("**/api/fund/quote", (route) => {
        quotes += 1;
        return route.fulfill(json({ error: "The price is not answering" }, 502));
      });

      // Press one: the way to the card. Then the one field nobody can guess.
      await fillTheCard(page);
      // Press two: the card's own action opens the sheet that pays.
      await card(page).locator("[data-card-action]").click();
      await expect(sheet(page).getByText("Your face or your fingerprint creates your account when you press pay. Nothing was asked of you until now.")).toBeVisible();
      // Somebody whose passkey lives on another device is given their own way in, under that sentence.
      const existing = sheet(page).getByRole("button", { name: "Sign in", exact: true });
      await expect(existing).toBeVisible();
      await existing.scrollIntoViewIfNeeded();
      await shot(SHOTS, page, size.name, "1a-pay-sheet-before-the-press");

      // Press three: pay. One system sheet, which makes the passkey; the terms are kept; the wait takes over.
      await sheet(page).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first().click();
      await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: /^Waiting for your/ })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("test.ceremonies")), "one system sheet, and it made a passkey").toBe('{"create":1,"get":0}');
      expect(await signedIn(context), "and the server knows the account").toBe(true);
      expect(await page.evaluate(() => localStorage.getItem("test.homeForAnAccount")), "Home was never drawn for the account between the passkey and the wait").toBeNull();
      const keptGift = await page.evaluate(() => JSON.parse(localStorage.getItem("viky.pendingGift") ?? "{}") as { wayIn?: string; account?: string; recipientName?: string });
      expect(keptGift.wayIn, "the terms were kept by the same press, with the way in it opened").toBeTruthy();
      expect(keptGift.account).toMatch(/^0x[0-9a-f]{40}$/);
      await shot(SHOTS, page, size.name, "1b-the-wait-after-one-press");

      // The tab closed while waiting, then the address opened again: Home says a gift is waiting, and leads to it.
      await page.evaluate(() => window.sessionStorage.clear());
      await page.goto("/");
      const finish = page.locator("[data-finish-gift]");
      await expect(finish.getByRole("link", { name: "Finish the gift you set up" })).toBeVisible();
      await expect(finish).toContainText("for Boo, set up on this device and not made yet.");
      await shot(SHOTS, page, size.name, "2a-home-with-a-gift-waiting");
      await page.goto("/gifts");
      await expect(page.locator("[data-finish-gift]").getByRole("link", { name: "Finish the gift you set up" })).toBeVisible();
      await shot(SHOTS, page, size.name, "2b-gifts-with-a-gift-waiting");
      await page.locator("[data-finish-gift]").getByRole("link").click();
      await page.waitForURL(/\/fund\?step=paying/);
      await expect(page.getByRole("heading", { name: /^Waiting for your/ })).toBeVisible();

      // The payment arrives as the chain's coin and the price does not answer: one try a look, never hundreds.
      quotes = 0;
      holdings.mon = 60_000_000_000_000_000_000n;
      await expect.poll(() => quotes, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.getByText("The price changed and nothing was changed. Viky will try again in a moment.")).toBeVisible();
      const startedAt = Date.now();
      const atStart = quotes;
      await page.waitForTimeout(12_000);
      const tried = quotes - atStart;
      expect(tried, `${tried} conversions tried in ${Date.now() - startedAt} ms after the first failure`).toBeLessThanOrEqual(2);
      holdings.mon = 0n;

      // The session over, twelve hours on: nobody is signed in, and the page for nobody still says a gift is waiting.
      await context.clearCookies();
      await page.goto("/");
      await expect(page.locator("[data-finish-gift]").getByRole("link", { name: "Finish the gift you set up" })).toBeVisible();
      await shot(SHOTS, page, size.name, "2c-home-for-nobody-with-a-gift-waiting");
      await page.locator("[data-finish-gift]").getByRole("link").click();
      await expect(page.getByRole("heading", { name: "A gift is waiting for your payment" })).toBeVisible();

      // A card merely filled in is not a gift waiting for its payment: nothing is said of it.
      await page.evaluate(() => {
        const keptNow = JSON.parse(localStorage.getItem("viky.pendingGift") ?? "{}") as Record<string, unknown>;
        delete keptNow.wayIn;
        localStorage.setItem("viky.pendingGift", JSON.stringify(keptNow));
      });
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Offer a gift" }).first()).toBeVisible();
      await expect(page.locator("[data-finish-gift]")).toHaveCount(0);
      await context.close();
    });

    test(`an account made on another device signs in from the sheet, and the sheet stays (${size.name})`, async ({ browser, baseURL }) => {
      // The account exists, and this browser has forgotten which passkey is its own: what a second device looks like.
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await answerTheChain(context, { ausd: 0n, mon: 0n });
      await page.goto("/");
      await page.getByRole("button", { name: /^Sign in$/ }).first().click();
      await page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
      await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
      await context.clearCookies();
      await page.evaluate(() => window.localStorage.removeItem("viky.credential"));
      await context.addInitScript(WATCH);

      await fillTheCard(page);
      await card(page).locator("[data-card-action]").click();
      await sheet(page).getByRole("button", { name: "Sign in", exact: true }).click();
      await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
      // Signed in, and the sheet is still what the person is looking at: nothing to find and press again.
      // Signed in, the phone's own prompt says what the passkey does, and the sheet says nothing about it (3 Oct 2026).
      await expect(sheet(page).getByText(/^Your face or your fingerprint/)).toHaveCount(0);
      await expect(sheet(page).getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("test.ceremonies")), "the passkey was asked for, and none was made").toBe('{"create":0,"get":1}');
      await shot(SHOTS, page, size.name, "1c-signed-in-from-the-sheet");
      await sheet(page).getByRole("button", { name: /^(Pay \S+ by card|Pay)$/ }).first().click();
      await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
      await context.close();
    });

    test(`the funder is offered the messages under the link they were just given (${size.name})`, async ({ browser, baseURL }) => {
      const funder = await profile(browser, baseURL, size.viewport);
      const { page, context } = funder;
      await answerTheChain(context, { ausd: 0n, mon: 0n });
      await neverAskedToBeTold(context);
      await page.goto("/");
      await page.getByRole("button", { name: /^Sign in$/ }).first().click();
      await page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
      await expect.poll(() => signedIn(context), { timeout: 30_000 }).toBe(true);
      // The gift as this screen keeps it once made: the creation itself is the server's and the chain's, not walked here.
      const made = (over: Record<string, unknown>) =>
        page.evaluate(
          (record) => window.sessionStorage.setItem("viky.giftMade", JSON.stringify(record)),
          { giftId: "7", claimUrl: `${funder.baseURL}/g/7?t=AbCdEfGhIjKlMnOpQrStUv`, atMs: Date.now(), recipientName: "Boo", funderName: "Mom", conditionId: "duolingo-daily", amount: "30000000", days: 30, ...over },
        );
      await made({});
      await page.goto("/fund?step=done");
      await expect(page.getByRole("button", { name: "Copy the link" })).toBeVisible();
      // A browser that can be told: a round button in the open, under the link's card, and one press in its sheet.
      const messages = page.locator('[data-decide="messages"]');
      await expect(messages).toHaveText("NotificationsOff");
      const linkCard = page.getByRole("button", { name: "Copy the link" });
      expect((await messages.boundingBox())!.y, "under the link").toBeGreaterThan((await linkCard.boundingBox())!.y);
      await messages.click();
      const told = page.locator("[data-told]");
      await expect(told).toHaveAttribute("data-told", "ask");
      await expect(page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Tell me each morning" })).toBeEnabled();
      await shot(SHOTS, page, size.name, "3a-link-screen-messages-offered");
      await context.close();

      // An iPhone in Safari, outside the Home Screen: nothing can be granted there, so what to do first is said in full.
      const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1";
      const iphone = await profile(browser, baseURL, size.viewport, { userAgent: SAFARI });
      await answerTheChain(iphone.context, { ausd: 0n, mon: 0n });
      await iphone.page.goto("/");
      await iphone.page.getByRole("button", { name: /^Sign in$/ }).first().click();
      await iphone.page.getByRole("button", { name: /^Create (your|my) account$/ }).first().click();
      await expect.poll(() => signedIn(iphone.context), { timeout: 30_000 }).toBe(true);
      await iphone.page.evaluate(
        (record) => window.sessionStorage.setItem("viky.giftMade", JSON.stringify(record)),
        { giftId: "7", claimUrl: `${iphone.baseURL}/g/7?t=AbCdEfGhIjKlMnOpQrStUv`, atMs: Date.now(), recipientName: "Boo", funderName: "Mom", conditionId: "duolingo-daily", amount: "30000000", days: 30 },
      );
      await iphone.page.goto("/fund?step=done");
      await iphone.page.locator('[data-decide="messages"]').click();
      const first = iphone.page.locator("[data-told]");
      await expect(first).toHaveAttribute("data-told", "install");
      await expect(first.getByText("Add Viky to your Home Screen first. Then Viky can tell you each morning.")).toBeVisible();
      await expect(first.getByText("On iPhone: tap Share, then Add to Home Screen.")).toBeVisible();
      // No button that could grant nothing: the sheet has its way out and nothing else to press.
      await expect(iphone.page.getByRole("dialog", { name: "Notifications" }).getByRole("button")).toHaveCount(1);
      await shot(SHOTS, iphone.page, size.name, "3b-link-screen-iphone-install-first");
      await iphone.context.close();
    });
  }
});
