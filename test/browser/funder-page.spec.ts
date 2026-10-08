import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, climb, daily, endedDaily, photographer, serve } from "./gift-fixtures";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now, profile } from "./gift-kit";

/**
 * The page of the person who offered a gift, which is also the screen of a gift just made, with its link (the
 * founder's six rules of 1 Oct 2026, kit-rules.html, and the UI pass of 8 Oct 2026, screen 3): the same round
 * controls as the person it is for has, the taking back read in a sheet before it is made, a state said in a title
 * and a line, and the link in the card with one button.
 *
 * What is real: the product's pages against the server under test, its sign-in with a passkey, every press. What is
 * stood in for: the gift, answered here as the server would answer it, and the routes that make a link or take a
 * gift back, which are never called for real.
 *
 * VIKY_FUNDER_CAPTURES=<folder> also photographs each state at 390 by 844: a page whole, a sheet as the screen shows it.
 */
const shot = photographer(process.env.VIKY_FUNDER_CAPTURES);
const controls = (page: Page) => page.locator("section.you-decide");
const act = (page: Page, which: "messages" | "back") => page.locator(`[data-decide="${which}"]`);

/** A habit nobody has opened yet, as its funder reads it. */
const unopened = (giftId: string, over: Record<string, unknown> = {}) =>
  daily(giftId, "funder", {
    opened: false,
    connected: false,
    creditedDays: 0,
    days: [],
    startDay: 0,
    endDay: 0,
    earned: "0",
    earnedDisplay: "$0.00",
    alreadyTheirs: "0",
    alreadyTheirsDisplay: "$0.00",
    claimedAtChain: 0,
    version: 1,
    end: null,
    goalAccount: { username: "boo_learns", source: "funder", bound: false, code: null, codeExpiresAt: null },
    ...over,
  });

test.describe("the funder's page", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  test("a gift nobody opened, on the device that holds its link: the card says to send it, and the link is one field and one button", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "51";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await device.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await serve(page, GIFT, () => unopened(GIFT), TERMS.daily, null);
    const asked: string[] = [];
    await page.route(`**/api/gift/${GIFT}/link`, (route) => {
      asked.push("link");
      return route.fulfill(json({ claimUrl: `${device.baseURL}/g/${GIFT}?t=ZyXwVuTsRqPoNmLkJiHgFe` }));
    });
    await page.route(`**/api/gift/${GIFT}/cancel`, (route) => {
      asked.push("cancel");
      return route.fulfill(json({ code: "TEST", message: "Not walked here." }, 409));
    });
    await makeAnAccount(device);
    const link = `${device.baseURL}/g/51?t=AbCdEfGhIjKlMnOpQrStUv`;
    await page.evaluate((kept) => window.localStorage.setItem("viky.gift-link.51", kept), link);
    await page.goto(`/g/${GIFT}`);

    // The screen after paying is this page (the UI pass of 8 Oct 2026, screen 3): the state is what there is to do.
    await expect(page.getByText("Send it to Boo.", { exact: true })).toBeVisible();
    await expect(page.getByText("Whoever opens the link takes the gift.", { exact: true })).toBeVisible();
    await expect(page.getByText("$7.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("In their name", { exact: true }).first()).toBeVisible();
    // The link in its field, and copying it is the sun. Nothing is titled, framed, "again", or said of where it is kept.
    const field = page.locator("[data-gift-link]");
    await expect(field).toHaveText(link);
    const copy = page.getByRole("button", { name: "Copy the link", exact: true });
    await expect(copy).toHaveCSS("background-color", "rgb(255, 197, 49)");
    await expect(page.getByRole("heading", { name: "The link" })).toHaveCount(0);
    await expect(page.getByText("Only this device kept it: the link carries the key that opens the gift.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /again/i })).toHaveCount(0);
    expect((await field.boundingBox())!.y, "the field is above its button").toBeLessThan((await copy.boundingBox())!.y);
    // A press on the field copies, as the button does, and the button says so for a moment.
    await field.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await expect(page.locator('button[data-copy-the-link][data-state="done"]')).toHaveText("Copied");
    // Two round controls under the card: being told, as it was offered under the link of a gift just made, and taking back.
    await expect(controls(page).getByRole("button")).toHaveCount(2);
    await expect(act(page, "back")).toHaveText("Take backUnopened");
    await expect(page.getByRole("button", { name: "Take this gift back" })).toHaveCount(0);
    await shot(page, "01-unopened-link-kept");

    // The date and the number are a line of what was agreed, and nowhere in the open.
    await page.getByText("What was agreed", { exact: true }).click();
    await expect(page.locator("dl.said-lines > div").filter({ hasText: /^Made/ })).toHaveText(/^Made.+, gift 51$/);
    await shot(page, "01a-unopened-agreed-open");

    // Taking it back: the reading before, in a sheet, with the amount on the press.
    await act(page, "back").click();
    const back = page.getByRole("dialog", { name: "Take back the gift for Boo" });
    await expect(back.getByText("$7.00 comes back to your account straight away. This cannot be undone.")).toBeVisible();
    await expect(back.getByText("Its link stops working, and nobody can open it after this.")).toBeVisible();
    await expect(back.getByRole("button", { name: "Take back $7.00" })).toBeVisible();
    await shot(page, "02-take-back-sheet", false);
    await back.getByRole("button", { name: "Not now" }).click();
    await expect(back).toBeHidden();
    expect(asked).toEqual([]);
    await device.context.close();
  });

  test("on a device that does not hold the link: a gift of today finds the same one on one press, a gift of the first contract reads the sheet first", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, "52", () => unopened("52"), TERMS.daily, null);
    await serve(page, "53", () => unopened("53", { version: 2 }), TERMS.daily, null);
    await makeAnAccount(device);

    // A gift of today: where it stands, the day it comes back, and one button with what it gives under it.
    await page.goto(`/g/53`);
    await expect(page.getByText("Boo has not opened it yet.", { exact: true })).toBeVisible();
    await expect(page.getByText(/^By .+, or it comes back to you\.$/)).toBeVisible();
    const find = page.getByRole("button", { name: "Find the link", exact: true });
    await expect(find).toBeVisible();
    await expect(find).not.toHaveCSS("background-color", "rgb(255, 197, 49)");
    await expect(page.getByText("The same link you sent. It still works.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Copy the link/ })).toHaveCount(0);
    await shot(page, "03-second-version-no-link");

    // The press finds it (the review of 2 Oct 2026, R-17), with no sheet between: the server is asked for the gift's
    // salt, which is public, and is sent nothing else; the funder's own account signs it here, and the link is made
    // in this browser.
    const salts: string[] = [];
    await page.route("**/api/gift/53/link", (route) => {
      salts.push(route.request().postData() ?? "");
      return route.fulfill(json({ salt: `0x${"07".repeat(32)}` }));
    });
    await find.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Here is the link. It is the one you had: it still opens this gift.")).toBeVisible();
    expect(salts).toEqual(['{"find":true}']);
    // The link as it is sent since R-01: a preview token where a server reads, the secret after the #, where none does.
    const link = await page.locator("[data-gift-link]").innerText();
    expect(link).toMatch(new RegExp(`^${device.baseURL}/g/53\\?t=[A-Za-z0-9_-]{32}#[A-Za-z0-9_-]{32}$`));
    const found = new URL(link);
    expect(found.searchParams.get("t")).not.toBe(found.hash.slice(1));
    // The same account, the same salt: the same link, on any device. Kept by this one from now on, and the card says
    // what there is to do with it.
    expect(await page.evaluate(() => window.localStorage.getItem("viky.gift-link.53"))).toBe(link);
    await expect(page.getByText("Send it to Boo.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy the link", exact: true })).toHaveCSS("background-color", "rgb(255, 197, 49)");
    await expect(page.getByRole("button", { name: "Find the link" })).toHaveCount(0);
    await shot(page, "04-second-version-link-found");

    // A gift of the first contract: its link is replaced, which is a decision, read in a sheet before the press.
    const asked: string[] = [];
    await page.route("**/api/gift/52/link", (route) => {
      asked.push("link");
      return route.fulfill(json({ claimUrl: `${device.baseURL}/g/52?t=ZyXwVuTsRqPoNmLkJiHgFe` }));
    });
    await page.goto(`/g/52`);
    const again = page.getByRole("button", { name: "Get the link again" });
    await expect(again).toHaveCSS("background-color", "rgb(255, 197, 49)");
    await expect(page.getByRole("button", { name: /^Copy the link/ })).toHaveCount(0);
    await expect(page.getByText(/The link you had stops working the moment you do\./)).toBeHidden();
    await shot(page, "05-first-contract-no-link");
    await again.click();
    const sheet = page.getByRole("dialog", { name: "Get the link again" });
    await expect(sheet.getByText("Lost the link, or sent it from another device? Get a new one. The link you had stops working the moment you do.")).toBeVisible();
    expect(asked).toEqual([]);
    await shot(page, "05b-link-again-sheet", false);
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toBeHidden();
    expect(asked).toEqual([]);
    await again.click();
    await sheet.getByRole("button", { name: "Get the link again" }).click();
    await expect(page.getByText("Here is the new link. The one you had before no longer opens this gift.")).toBeVisible();
    expect(asked).toEqual(["link"]);
    await expect(page.locator("[data-gift-link]")).toHaveText(/ZyXwVuTsRqPoNmLkJiHgFe/);
    await shot(page, "05c-new-link");
    await device.context.close();
  });

  test("a habit and a climb under way: one round button, and what the phone refuses said after the press", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, "54", () => daily("54", "funder", { missedDays: 1, creditedDays: 2, returned: "1000000", returnedDisplay: "$1.00" }), TERMS.daily);
    await serve(page, "1999954", () => climb("1999954", "funder", { end: null }), TERMS.climb);
    await makeAnAccount(device);
    await page.goto(`/g/54`);
    // What came back has the second column, so the next reading stays a dated sentence.
    await expect(page.locator(".gift-figures")).toHaveText(/\$2\.00Theirs so far\$1\.00Back to you/);
    await expect(page.getByText(/^Next reading: /)).toBeVisible();
    await expect(controls(page).getByRole("button")).toHaveCount(1);
    await expect(act(page, "messages")).toHaveText("NotificationsOff");
    await expect(page.getByRole("button", { name: "Tell me each morning" })).toHaveCount(0);
    await expect(page.getByText("Check this day yourself")).toBeHidden();
    await shot(page, "05-habit-under-way");
    await act(page, "messages").click();
    const messages = page.getByRole("dialog", { name: "Notifications" });
    await expect(messages.getByRole("button", { name: "Tell me each morning" })).toBeEnabled();
    await shot(page, "05b-habit-messages-sheet", false);
    await messages.getByRole("button", { name: "Close" }).click();
    await page.getByText("What was agreed", { exact: true }).click();
    await page.getByText("How this is checked", { exact: true }).click();
    await expect(page.locator("details.gift-fold").nth(1).getByText("Check this day yourself")).toBeVisible();
    await shot(page, "06-habit-folds-open");

    await page.goto(`/g/1999954`);
    await expect(act(page, "messages")).toHaveText("NotificationsOff");
    await expect(page.getByText(/^Get a message when they reach/)).toBeHidden();
    await shot(page, "07-climb-under-way");
    await act(page, "messages").click();
    await expect(page.getByRole("dialog", { name: "Notifications" }).getByText("Get a message when they reach 1500.")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Turn on" })).toBeEnabled();
    await shot(page, "07b-climb-messages-sheet", false);
    await device.context.close();

    const refuses = await aWindow(browser, baseURL);
    await refuses.context.addInitScript(`Object.defineProperty(Notification, "permission", { get: () => "denied" });`);
    await serve(refuses.page, "55", () => daily("55", "funder"), TERMS.daily);
    await makeAnAccount(refuses);
    await refuses.page.goto(`/g/55`);
    await expect(act(refuses.page, "messages")).toBeVisible();
    await expect(refuses.page.getByText(/Your phone is not letting Viky tell you/)).toBeHidden();
    await shot(refuses.page, "08-habit-phone-refuses");
    await act(refuses.page, "messages").click();
    await expect(refuses.page.getByRole("dialog", { name: "Notifications" }).getByText("Your phone is not letting Viky tell you. Turn notifications on for Viky in your phone's settings.")).toBeVisible();
    await expect(refuses.page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Tell me each morning" })).toBeDisabled();
    await shot(refuses.page, "08b-phone-refuses-sheet", false);
    await refuses.context.close();
  });

  test("a state is a title and a line: past the last day, a start above the most allowed, and a gift its person ended", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, "1999956", () => gift("1999956", "funder", { conditionId: "duolingo-english-test", deadlineMs: (now() - 2 * DAY) * 1000 }), TERMS.shown);
    await serve(page, "1999957", () => climb("1999957", "funder", { end: null, connected: false, phase: "opened", startReading: null, todayReading: null, startAboveCap: 1480, maximumStart: 1460 }), TERMS.climb, null);
    await serve(page, "43", () => endedDaily("43", "funder", Date.now()), TERMS.daily);
    await makeAnAccount(device);

    await page.goto(`/g/1999956`);
    await expect(page.locator(".gift-state")).toHaveText("The last day has passed.");
    await expect(page.locator(".gift-next")).toHaveText(/^If nothing from before it is proved by .+, it comes back to you\.$/);
    await shot(page, "09-one-thing-late");

    await page.goto(`/g/1999957`);
    await expect(page.locator(".gift-state-closed")).toHaveText(["Boo is at 1480, above the 1460 you set as the most it may start from.", "Nothing was recorded and it has not started."]);
    // The day it comes back is said once, in the dated line under the state, and no longer in the state's own lines.
    await expect(page.locator(".gift-next")).toHaveText(/^If not by .+, it comes back to you\.$/);
    await expect(page.locator(".gift-state-closed").filter({ hasText: "comes back" })).toHaveCount(0);
    await shot(page, "10-climb-start-above");

    await page.goto(`/g/43`);
    await expect(page.getByText("Boo ended this gift.", { exact: true })).toBeVisible();
    await expect(page.locator(".gift-when")).toHaveText(/^Ended \d{1,2} \w{3} \d{4}$/);
    await expect(page.locator(".gift-figures")).toHaveText(/\$2\.00Theirs\$5\.00Back to you/);
    await expect(controls(page)).toHaveCount(0);
    await shot(page, "10b-habit-ended");
    await page.getByText("What was agreed", { exact: true }).click();
    await device.context.close();

    // While it runs, the funder reads in the agreement that its person can end it.
    const running = await aWindow(browser, baseURL);
    await neverAskedToBeTold(running.context);
    await serve(running.page, "44", () => daily("44", "funder"), TERMS.daily);
    await makeAnAccount(running);
    await running.page.goto(`/g/44`);
    await running.page.getByText("What was agreed", { exact: true }).click();
    await expect(running.page.locator("dl.said-lines > div").filter({ hasText: "Boo can end it" })).toHaveText("Boo can end itthe rest comes back to you");
    await running.context.close();
  });

  test("on a computer the gift's card is 440 wide, in the middle of the window", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const device = await profile(browser, baseURL, { width: 1440, height: 900 });
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, "8", () => unopened("8"), TERMS.daily, null);
    await makeAnAccount(device);
    const link = `${device.baseURL}/g/8?t=AbCdEfGhIjKlMnOpQrStUv`;
    await page.evaluate((kept) => window.localStorage.setItem("viky.gift-link.8", kept), link);
    await page.goto("/g/8");
    const card = page.locator("section.gift-card-width");
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(Math.round(box.width), "the card's own width: it stood at 432 in a task's column").toBe(440);
    expect(Math.abs(box.x + box.width / 2 - 720), "in the middle of a window of 1440").toBeLessThanOrEqual(1);
    // What is in the card is as wide as the card allows, and no wider: the button never runs across the window.
    const copy = (await page.getByRole("button", { name: "Copy the link", exact: true }).boundingBox())!;
    expect(copy.width).toBeLessThanOrEqual(440);
    expect(copy.x).toBeGreaterThanOrEqual(box.x);
    if (process.env.VIKY_FUNDER_CAPTURES) await page.screenshot({ path: `${process.env.VIKY_FUNDER_CAPTURES}/13-after-paying-1440.png` });
    await device.context.close();
  });

  test("the screen of a gift just made is the gift's own page, and an address kept from before leads there", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, "7", () => unopened("7"), TERMS.daily, null);
    await makeAnAccount(device);
    const link = `${device.baseURL}/g/7?t=AbCdEfGhIjKlMnOpQrStUv`;
    // What the pay screen kept of a gift it made, before 8 Oct 2026, and the link the device keeps.
    await page.evaluate(
      ([record, kept]) => {
        window.sessionStorage.setItem("viky.giftMade", record);
        window.localStorage.setItem("viky.gift-link.7", kept);
      },
      [JSON.stringify({ giftId: "7", claimUrl: link, atMs: Date.now(), recipientName: "Boo", funderName: "Mom", conditionId: "duolingo-daily", amount: "7000000", days: 7 }), link],
    );
    await page.goto("/fund?step=done");
    await expect(page).toHaveURL(/\/g\/7$/);
    await expect(page.getByText("Send it to Boo.", { exact: true })).toBeVisible();
    await expect(page.locator("[data-gift-link]")).toHaveText(link);
    await expect(page.getByRole("button", { name: "Copy the link", exact: true })).toBeVisible();
    // Nothing of the screen that stood here: no title that says the amount again, no reference, no fold of its own.
    await expect(page.getByText(/is in Boo's name\./)).toHaveCount(0);
    await expect(page.getByText(/Reference: gift/)).toHaveCount(0);
    await expect(page.getByText("What happens next", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "See this gift" })).toHaveCount(0);
    await shot(page, "11-after-paying-is-the-gift-page");
    // With nothing kept, the address leads to the pay screen, which says there is nothing to pay for.
    await page.evaluate(() => window.sessionStorage.removeItem("viky.giftMade"));
    await page.goto("/fund?step=done");
    await expect(page).toHaveURL(/\/fund\?step=pay$/);
    await device.context.close();
  });
});
