import { expect, test, type Page } from "@playwright/test";
import { answerTheChain, DAY, json, makeAnAccount, needsAContract, now, profile, type Profile } from "./gift-kit";

/**
 * A page closed while the gift was being made (the final audit of 9 Oct 2026, A4).
 *
 * The screen that makes a gift says "You can close this page". The gift was made, and for three days the device went
 * on saying it was "set up on this device and not made yet", over a button that made a second gift when the account
 * still held the amount: the signed request was kept for the tab and went with it.
 *
 * Walked here, twice. The account's list holds the gift that was made: Home says nothing of a gift to finish, and the
 * device forgets it. And the person opens the wait again before the list is read: the same signed request is sent
 * again, first, the server says the gift is made, and the device forgets it as that is read, with nothing pressed.
 *
 * That second walk failed from the day the card became a store the page reads (11 Oct 2026, found on a build that
 * names a contract, which no pass of the CI was): a page loaded again holds the starting card at its first image, and
 * the wait looked at once. The account held fifty dollars, so it signed a gift of thirty for nobody named, wrote that
 * request over the one it kept, and then signed the real gift a second time: three different requests. The wait now
 * makes only the gift whose payment this device started (src/pending-gift.ts), which the third walk holds from the
 * other side: a wait opened with nothing started makes nothing, whatever the account holds.
 *
 * What is real: the product's pages against the server under test, a real account and its passkey, every press. What
 * is stood in for: the chain, the creation and the list of gifts, as in ./card-payment-wait.spec.ts; and the tab being
 * closed, which a test cannot do to the page that holds the passkey: its own storage is emptied and it leaves, which
 * is what closing it loses. On a build that names no gift contract the creation is never sent, and the test says so
 * and stops.
 */
const sheet = (page: Page) => page.locator("dialog.sheet[open]").last();
const card = (page: Page) => page.locator('section[aria-labelledby="offer-card"]');
const toFinish = (page: Page) => page.locator("[data-finish-gift]");
const keptOnTheDevice = (page: Page) => page.evaluate(`localStorage.getItem("viky.pendingGift")`) as Promise<string | null>;

/** The gift the kept one became, as the list of gifts answers it: paid by this account, after it was written down. */
function made(kept: { recipientName: string; dollars: string; days: string }) {
  const today = Math.floor(now() / DAY);
  const days = Number(kept.days);
  return {
    giftId: "77",
    role: "funder",
    goalType: 1,
    goalUsername: null,
    usernameSource: null,
    recipientName: kept.recipientName,
    funderName: null,
    catchUpSeconds: 108_000,
    days: [],
    fundedAt: now() + 30,
    startDay: 0,
    endDay: today + days,
    amountDisplay: `$${Number(kept.dollars).toFixed(2)}`,
    perDayDisplay: `$${(Number(kept.dollars) / days).toFixed(2)}`,
    durationDays: days,
    creditedDays: 0,
    missedDays: 0,
    opened: false,
    counting: false,
    finished: false,
    cancelled: false,
    earnedDisplay: "$0.00",
    theirsDisplay: "$0.00",
    returnedDisplay: "$0.00",
    takeable: "0",
  };
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

/** The tab is closed: what it alone kept is gone, and the page with it. */
async function closeThePage(page: Page): Promise<void> {
  await page.evaluate(`sessionStorage.clear()`);
  await page.goto("about:blank");
}

test.describe("a page closed while the gift was being made", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(180_000);

  test("the gift is in the account's list: Home says nothing of a gift to finish, and the device forgets it", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    const sent: string[] = [];
    // The creation is on its way and does not answer while the page stands.
    await page.route("**/api/gift/create", (route) => void sent.push(route.request().postData() ?? ""));
    const reached = await untilTheCreationIsSent(funder, sent);
    needsAContract(reached);
    const kept = JSON.parse((await keptOnTheDevice(page)) ?? "null") as { recipientName: string; dollars: string; days: string } | null;
    expect(kept?.recipientName).toBe("Boo");
    await closeThePage(page);

    // Nothing in the list yet: the device says a gift is to finish, as it should.
    await page.goto("/");
    await expect(toFinish(page)).toHaveCount(1);
    // The gift was made after all, and the list holds it: nothing is said, and nothing is kept.
    await page.unroute("**/api/gifts/mine");
    await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: [made(kept!)] })));
    await page.reload();
    await expect(toFinish(page)).toHaveCount(0);
    await expect.poll(() => keptOnTheDevice(page)).toBeNull();
    // And it stays so on the list of gifts.
    await page.goto("/gifts");
    await expect(toFinish(page)).toHaveCount(0);
    await context.close();
  });

  test("the wait opened again sends the same signed request first, and a gift read as made is forgotten at once", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    const sent: string[] = [];
    let went = false;
    await page.route("**/api/gift/create", (route) => {
      sent.push(route.request().postData() ?? "");
      // The first one went through and its answer never reached the page; sent again, the server says so.
      if (!went) return;
      return route.fulfill(json({ error: "This gift is already made. It is in your gifts.", code: "ALREADY_MADE" }, 409));
    });
    const reached = await untilTheCreationIsSent(funder, sent);
    needsAContract(reached);
    const first = sent.length;
    await closeThePage(page);
    went = true;

    // Opened again from Home's own button: the wait, which asks first with the request this device kept.
    await page.goto("/fund?step=paying");
    await expect(page.getByText("This gift is already made. It is in your gifts.", { exact: true })).toBeVisible({ timeout: 60_000 });
    expect(sent.length, "it was sent again").toBeGreaterThan(first);
    expect(new Set(sent).size, "the same signed request, never a second signature").toBe(1);
    // And it is the gift that was set up: nineteen dollars for Boo, never the starting card's thirty for nobody.
    for (const one of sent) expect(JSON.parse(one)).toMatchObject({ recipientName: "Boo", amount: "19000000" });
    // Forgotten as it was read, with nothing pressed: Home says nothing of a gift to finish.
    await expect.poll(() => keptOnTheDevice(page)).toBeNull();
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Sign in$/ })).toHaveCount(0);
    await expect(toFinish(page)).toHaveCount(0);
    await context.close();
  });

  test("a wait opened where no payment was started makes nothing, though the account holds more than the starting card", async ({ browser, baseURL }) => {
    const funder = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page, context } = funder;
    const sent: string[] = [];
    await page.route("**/api/gift/create", (route) => {
      sent.push(route.request().postData() ?? "");
      return route.fulfill(json({ error: "This gift is already made. It is in your gifts.", code: "ALREADY_MADE" }, 409));
    });
    await answerTheChain(context, { ausd: 50_000_000n, mon: 0n, usdc: 0n });
    await page.route("**/api/rails/where**", (route) =>
      route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: {}, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: null, cardSmallest: null } })),
    );
    await makeAnAccount(funder);
    expect(await keptOnTheDevice(page), "nothing is set up on this device").toBeNull();

    // The wait's own address, loaded whole, by an account that could pay for the starting card: thirty dollars for
    // nobody named, which nobody set up. Longer than the wait's own look at the account (eight seconds).
    await page.goto("/fund?step=paying");
    await page.waitForTimeout(12_000);
    expect(sent, "no creation for a card nobody started paying for").toEqual([]);
    // The same again once the card is only filled in: written on the device, and no pay press behind it.
    await page.goto("/");
    await card(page).getByLabel("Their first name").fill("Boo");
    await card(page).getByLabel("how much").fill("19");
    await expect.poll(() => keptOnTheDevice(page)).not.toBeNull();
    await page.goto("/fund?step=paying");
    await page.waitForTimeout(12_000);
    expect(sent, "no creation for a card that was only filled in").toEqual([]);

    // And this build does make a gift when one is paid for, so the silence above is the rule's: the pay press, then
    // one creation, for the card as it was filled.
    await page.goto("/");
    await card(page).locator("[data-card-action]").click();
    await sheet(page).getByRole("button", { name: /^Put .+ in Boo's name$/ }).click();
    await page.waitForURL(/\/fund\?step=paying/, { timeout: 60_000 });
    const reached = await expect.poll(() => sent.length, { timeout: 25_000 }).toBeGreaterThan(0).then(() => true, () => false);
    needsAContract(reached);
    expect(JSON.parse(sent[0])).toMatchObject({ recipientName: "Boo", amount: "19000000" });
    await context.close();
  });
});
