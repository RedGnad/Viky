import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, climb, daily, endedDaily, photographer, serve } from "./gift-fixtures";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now } from "./gift-kit";

/**
 * The page of the person who offered a gift, and the screen of a gift just made with its link (the founder's six
 * rules of 1 Oct 2026, kit-rules.html): the same round controls as the person it is for has, the link's second
 * gesture and the taking back read in a sheet before they are made, a state said in a title and a line, and what
 * happens next folded under its name.
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

  test("a gift nobody opened: the link is the one action, its second gesture and the taking back are read in a sheet first", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const GIFT = "51";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
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
    await page.evaluate((link) => window.localStorage.setItem("viky.gift-link.51", link), `${device.baseURL}/g/51?t=AbCdEfGhIjKlMnOpQrStUv`);
    await page.goto(`/g/${GIFT}`);

    // The link this device kept: copying it is the sun, and the way to another is a small button beside it.
    const copy = page.getByRole("button", { name: "Copy the link again" });
    await expect(copy).toBeVisible();
    await expect(copy).toHaveCSS("background-color", "rgb(255, 197, 49)");
    const again = page.getByRole("button", { name: "Get the link again" });
    expect((await again.boundingBox())?.height, "the one small button is 40 high").toBe(40);
    // What pressing it does to the link already sent is no longer a paragraph on the page.
    await expect(page.getByText(/The link you had stops working the moment you do\./)).toBeHidden();
    // One round button, and no link under the card.
    await expect(controls(page).getByRole("button")).toHaveCount(1);
    await expect(act(page, "back")).toHaveText("Take backUnopened");
    await expect(page.getByRole("button", { name: "Take this gift back" })).toHaveCount(0);
    await shot(page, "01-unopened-link-kept");

    // The second gesture, read before it is made: nothing is asked of the server until the press in the sheet.
    await again.click();
    const sheet = page.getByRole("dialog", { name: "Get the link again" });
    await expect(sheet.getByText("Lost the link, or sent it from another device? Get a new one. The link you had stops working the moment you do.")).toBeVisible();
    expect(asked).toEqual([]);
    await shot(page, "01b-link-again-sheet", false);
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toBeHidden();
    expect(asked).toEqual([]);
    await again.click();
    await sheet.getByRole("button", { name: "Get the link again" }).click();
    await expect(page.getByText("Here is the new link. The one you had before no longer opens this gift.")).toBeVisible();
    expect(asked).toEqual(["link"]);
    await expect(page.getByText(/ZyXwVuTsRqPoNmLkJiHgFe/)).toBeVisible();
    await shot(page, "01c-new-link");

    // Taking it back: the reading before, in a sheet, with the amount on the press.
    await act(page, "back").click();
    const back = page.getByRole("dialog", { name: "Take back the gift for Boo" });
    await expect(back.getByText("$7.00 comes back to your account straight away. This cannot be undone.")).toBeVisible();
    await expect(back.getByText("Its link stops working, and nobody can open it after this.")).toBeVisible();
    await expect(back.getByRole("button", { name: "Take back $7.00" })).toBeVisible();
    await shot(page, "02-take-back-sheet", false);
    await back.getByRole("button", { name: "Not now" }).click();
    await expect(back).toBeHidden();
    expect(asked).toEqual(["link"]);
    await device.context.close();
  });

  test("on another device the one action is the way back to the link, and a gift of the second version finds the same one", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, "52", () => unopened("52"), TERMS.daily, null);
    await serve(page, "53", () => unopened("53", { version: 2 }), TERMS.daily, null);
    await makeAnAccount(device);
    await page.goto(`/g/52`);
    const again = page.getByRole("button", { name: "Get the link again" });
    await expect(again).toHaveCSS("background-color", "rgb(255, 197, 49)");
    await expect(page.getByRole("button", { name: /^Copy the link/ })).toHaveCount(0);
    await shot(page, "03-unopened-no-link");

    await page.goto(`/g/53`);
    const find = page.getByRole("button", { name: "Find the link again" });
    await expect(find).toBeVisible();
    await find.click();
    const sheet = page.getByRole("dialog", { name: "Find the link again" });
    await expect(sheet.getByText("Lost the link, or sent it from another device? Find it again here. It is the same link: the one you sent still works.")).toBeVisible();
    await shot(page, "04-second-version-find-sheet", false);

    // The press in the sheet finds it (the review of 2 Oct 2026, R-17). The server is asked for the gift's salt, which
    // is public, and is sent nothing else; the funder's own account signs it here, and the link is made in this browser.
    const asked: string[] = [];
    await page.route("**/api/gift/53/link", (route) => {
      asked.push(route.request().postData() ?? "");
      return route.fulfill(json({ salt: `0x${"07".repeat(32)}` }));
    });
    await sheet.getByRole("button", { name: "Find the link again" }).click();
    await expect(page.getByText("Here is the link. It is the one you had: it still opens this gift.")).toBeVisible();
    expect(asked).toEqual(['{"find":true}']);
    // The link as it is sent since R-01: a preview token where a server reads, the secret after the #, where none does.
    const link = await page.locator("p.select-all").innerText();
    expect(link).toMatch(new RegExp(`^${device.baseURL}/g/53\\?t=[A-Za-z0-9_-]{32}#[A-Za-z0-9_-]{32}$`));
    const found = new URL(link);
    expect(found.searchParams.get("t")).not.toBe(found.hash.slice(1));
    // The same account, the same salt: the same link, on any device. Kept by this one from now on.
    expect(await page.evaluate(() => window.localStorage.getItem("viky.gift-link.53"))).toBe(link);
    await expect(page.getByRole("button", { name: "Copy the link" })).toHaveCSS("background-color", "rgb(255, 197, 49)");
    await expect(page.getByRole("button", { name: "Find the link again" })).toHaveCount(0);
    await shot(page, "04b-second-version-link-found");
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
    await expect(running.page.getByText("Boo can end this gift at any time. What they have earned stays theirs, and the rest comes back to you.", { exact: true })).toBeVisible();
    await running.context.close();
  });

  test("a gift just made: two figures, the link, what happens next folded, and the messages as a round button", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await page.route("**/api/gift/7/notify", (route) => route.fulfill(json({ on: false, possible: false })));
    await makeAnAccount(device);
    const made = (over: Record<string, unknown>) =>
      page.evaluate((record) => window.sessionStorage.setItem("viky.giftMade", JSON.stringify(record)), { giftId: "7", claimUrl: `${device.baseURL}/g/7?t=AbCdEfGhIjKlMnOpQrStUv`, atMs: Date.now(), recipientName: "Boo", funderName: "Maman", conditionId: "duolingo-daily", amount: "7000000", days: 7, ...over });
    await made({});
    await page.goto("/fund?step=done");
    await expect(page.getByRole("button", { name: "Copy the link" })).toBeVisible();
    // The day's share and the days, side by side; the whole amount is the title's.
    await expect(page.locator("[data-made-figures] > div")).toHaveText(["$1.00A day", "7Days"]);
    await expect(page.getByText("First day counted the day after they connect Duolingo.")).toBeVisible();
    await expect(page.getByText(/over 7 days/)).toHaveCount(0);
    // What happens next is folded, with the way back to a lost link at its foot.
    const next = page.locator("[data-made-next]");
    await expect(next.getByText("Boo opens the link and connects their Duolingo.")).toBeHidden();
    await expect(controls(page).getByRole("button")).toHaveCount(1);
    await shot(page, "11-made-habit");
    await next.getByText("What happens next", { exact: true }).click();
    await expect(next.locator("li")).toHaveCount(3);
    await expect(next.getByText("Lose this link and the gift's page makes you a new one, as long as nobody has opened it.")).toBeVisible();
    await shot(page, "11b-made-habit-next-open");

    await made({ conditionId: "chess-rating", amount: "25000000", days: 30, goal: "1500 in rapid", target: 1500, namedByFunder: true });
    await page.goto("/fund?step=done");
    await expect(page.getByText("$25.00 when they reach 1500 in rapid, within 30 days of connecting Chess.com.")).toBeVisible();
    await expect(page.getByText("All of it, at once, or all of it back to you.", { exact: true })).toBeVisible();
    await expect(page.locator("[data-made-figures]")).toHaveCount(0);
    await shot(page, "12-made-climb");
    await device.context.close();
  });
});
