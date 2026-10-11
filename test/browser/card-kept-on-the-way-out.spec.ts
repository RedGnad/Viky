import { expect, test, type Page } from "@playwright/test";
import { TERMS, daily, serve } from "./gift-fixtures";
import { answerTheChain, json, makeAnAccount, needsAContract, neverAskedToBeTold, profile, type Profile } from "./gift-kit";

/**
 * From the press that pays to the page that follows, the card never changes (the founder, 11 Oct 2026).
 *
 * Right after a payment the screen showed, for the moment the gift's page took to come, the starting card: thirty
 * dollars and no first name. The gift was made, the device forgot the card at once, and the screen that was still up
 * read the card on the device. The same at the two other places where the card is forgotten before the screen is left:
 * the way on from a gift read as made already, and "Set up a different gift instead".
 *
 * Shown by holding the screen between the two: the page that follows is kept from coming for ten seconds, and every
 * text the screen draws meanwhile is written down, image by image. Ten, because the screen that waits looks at the
 * account every eight seconds and makes the gift when it holds the amount: kept up with its card, it must make no second.
 *
 * What is real: the product's pages against the server under test, a real account and its passkey, every press. What
 * is stood in for: the chain, the creation and the gift's own page, as in ./card-payment-wait.spec.ts. On a build that
 * names no gift contract the creation is never sent, and the test says so and stops.
 */
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const GIFT = "77";
/** Longer than the wait's own look at the account (POLL_MS, src/funding-step.ts): a screen kept up must not make a second gift. */
const HELD_MS = 10_000;
/** The starting card, as any screen would say it: its amount, or a gift with nobody's name. */
const STARTING_CARD = /\$30\.00|in their name/;

/** Writes down every text the screen draws from now on, at each change and at each image, with the page it is on. */
const WATCH = `(() => {
  const seen = [];
  const read = () => {
    const now = location.pathname + " | " + (document.querySelector("main") ?? document.body).innerText.replace(/\\s+/g, " ").trim();
    if (seen[seen.length - 1] !== now) seen.push(now);
  };
  new MutationObserver(read).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const eachImage = () => { read(); requestAnimationFrame(eachImage); };
  eachImage();
  window.__seen = seen;
})()`;
const seenSoFar = (page: Page) => page.evaluate("window.__seen.slice()") as Promise<string[]>;

/** Keeps a page from coming for a while: its address is asked, and answered late. */
async function hold(page: Page, address: RegExp): Promise<{ asked: () => number }> {
  let asked = 0;
  await page.route(address, async (route) => {
    asked += 1;
    await new Promise((later) => setTimeout(later, HELD_MS));
    await route.fallback();
  });
  return { asked: () => asked };
}

/** Fills the card, pays from what the account holds, and waits for the creation to be sent; false where none ever is. */
async function untilTheCreationIsSent(funder: Profile, sent: string[]): Promise<boolean> {
  const { page, context } = funder;
  await answerTheChain(context, { ausd: 50_000_000n, mon: 0n, usdc: 0n });
  await page.route("**/api/rails/where**", (route) =>
    route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: {}, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: null, cardSmallest: null } })),
  );
  await makeAnAccount(funder);
  await page.goto("/");
  await card(page).getByLabel("Their first name").fill("Boo");
  await card(page).getByLabel("how much").fill("19");
  await card(page).locator("[data-card-action]").click();
  await sheet(page).getByRole("button", { name: /^Put .+ in Boo's name$/ }).click();
  await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
  return expect.poll(() => sent.length, { timeout: 25_000 }).toBeGreaterThan(0).then(() => true, () => false);
}

test.describe("the card never changes between the press that pays and the page that follows", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(180_000);

  test("a gift just made: the screen keeps the gift it was making until the gift's own page has come", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await neverAskedToBeTold(context);
    const sent: string[] = [];
    // The creation does not answer until the test lets it.
    let answer: (() => void) | null = null;
    await page.route("**/api/gift/create", async (route) => {
      sent.push(route.request().postData() ?? "");
      await new Promise<void>((made) => (answer = made));
      await route.fulfill(json({ giftId: GIFT, claimUrl: `${funder.baseURL}/g/${GIFT}?t=AbCdEfGhIjKlMnOpQrStUv`, funded: true }));
    });
    const reached = await untilTheCreationIsSent(funder, sent);
    needsAContract(reached);

    // The gift being made, with the gift itself under the ring.
    await expect(page.getByText("Putting $19.00 in Boo's name.", { exact: true })).toBeVisible();
    await serve(page, GIFT, () => daily(GIFT, "funder", { opened: false, connected: false, creditedDays: 0, days: [], startDay: 0, endDay: 0, claimedAtChain: 0, amount: "19000000", amountDisplay: "$19.00" }), TERMS.daily, null);
    const coming = await hold(page, new RegExp(`/g/${GIFT}(\\?|$)`));
    await page.evaluate(WATCH);

    // Made: the device forgets the card at once, and the gift's page is ten seconds away.
    answer!();
    await expect.poll(() => page.evaluate(`localStorage.getItem("viky.pendingGift")`), { timeout: 20_000 }).toBeNull();
    await page.waitForTimeout(HELD_MS / 2);
    expect(coming.asked(), "the gift's page was asked for, and has not come").toBeGreaterThan(0);
    expect(new URL(page.url()).pathname, "the screen that paid is still the one on the screen").toBe("/fund");
    await expect(page.getByText("Putting $19.00 in Boo's name.", { exact: true })).toBeVisible();

    await page.waitForURL(new RegExp(`/g/${GIFT}$`), { timeout: 30_000 });
    await expect(page.getByText("Send it to Boo.", { exact: true })).toBeVisible({ timeout: 20_000 });
    const seen = await seenSoFar(page);
    expect(seen.length, "the screen was read while it waited").toBeGreaterThan(0);
    expect(sent.length, "one creation, and no second one from the screen that was kept up").toBe(1);
    for (const text of seen) expect(text, "never the starting card, at any image").not.toMatch(STARTING_CARD);
    // While the screen that paid is up, it says the gift it made, whole: the amount and the name.
    const whilePaying = seen.filter((text) => text.startsWith("/fund | "));
    expect(whilePaying.length, "the screen that paid was read while the gift's page was held").toBeGreaterThan(0);
    for (const text of whilePaying) expect(text, "the gift made, from the press to its page").toContain("Putting $19.00 in Boo's name.");
    await context.close();
  });

  test("a gift read as made already: its screen stays as it is, and so does the way on to the gifts", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    await neverAskedToBeTold(context);
    const sent: string[] = [];
    await page.route("**/api/gift/create", (route) => {
      sent.push(route.request().postData() ?? "");
      return route.fulfill(json({ error: "This gift is already made. It is in your gifts.", code: "ALREADY_MADE" }, 409));
    });
    const reached = await untilTheCreationIsSent(funder, sent);
    needsAContract(reached);

    const said = page.getByText("This gift is already made. It is in your gifts.", { exact: true });
    await expect(said).toBeVisible({ timeout: 60_000 });
    // Read as made, so the device forgot it; the screen that says so does not turn into another one.
    await expect.poll(() => page.evaluate(`localStorage.getItem("viky.pendingGift")`), { timeout: 20_000 }).toBeNull();
    await page.evaluate(WATCH);
    await page.waitForTimeout(1_500);
    await expect(said).toBeVisible();

    const coming = await hold(page, /\/gifts(\?|$)/);
    await page.getByRole("link", { name: "Back to my gifts", exact: true }).last().click();
    await page.waitForTimeout(HELD_MS / 2);
    expect(coming.asked(), "the list of gifts was asked for, and has not come").toBeGreaterThan(0);
    await expect(said).toBeVisible();
    await page.waitForURL(/\/gifts$/, { timeout: 30_000 });
    const seen = await seenSoFar(page);
    for (const text of seen) expect(text, "never the starting card, nor a card with nothing on it").not.toMatch(/\$30\.00|in their name|Nothing to pay for yet/);
    await context.close();
  });
});
