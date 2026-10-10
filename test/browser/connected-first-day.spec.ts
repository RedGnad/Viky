import { expect, test } from "@playwright/test";
import { aWindow, daily, photographer, serve } from "./gift-fixtures";
import { json, makeAnAccount } from "./gift-kit";

/**
 * What a connected source says of its first day is true of the contract the gift is on (the audit of 9 Oct 2026).
 *
 * On the third daily contract the day counting starts is the gift's first day, and its page is read the next
 * morning. The screen said "From tomorrow" there: somebody who connected Strava one evening and did not move lost the
 * first day without a word. The first two contracts start the day after, and keep their sentence. A press on
 * "Count now" that day, and a day that did not reach its target, are answered in the source's own words; the page
 * prints the server's sentence as it comes, which is what is held here.
 *
 * VIKY_CONNECTED_CAPTURES=<folder> photographs each state, at 390 by 844, or at 1440 by 900 with VIKY_CAPTURE_DESK=1,
 * and after dark with VIKY_DECIDE_NIGHT=1.
 */
const shot = photographer(process.env.VIKY_CONNECTED_CAPTURES);

const GIFT = "872";
const STRAVA = 4;
const UTC_DAY = () => Math.floor(Date.now() / 86_400_000);
const TERMS = { reads: "your activities on Strava, each morning, for the day before: whether they add up to the kilometres", funderSees: "for each day, whether it counted", what: "your activities", things: 1 } as const;
const NOT_STARTED = { goalType: STRAVA, dailyTarget: 3, connected: false, startDay: 0, endDay: 0, creditedDays: 0, daysLeft: 7, days: [], earned: "0", earnedDisplay: "$0.00", alreadyTheirs: "0", alreadyTheirsDisplay: "$0.00", todayDayIndex: 0, goalAccount: { username: null, source: "funder", bound: false, code: null, codeExpiresAt: null } };

const DAY_ONE = "Today is day one. Its kilometres are read tomorrow morning.";
const FROM_TOMORROW = "From tomorrow, every day with your kilometres is yours, counted each morning.";

test.describe("a connected source, and the first day of its gift", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(120_000);

  for (const [version, sentence, name] of [
    [3, DAY_ONE, "the third contract: the day counting starts is day one"],
    [2, FROM_TOMORROW, "the second contract: the first day is the day after"],
  ] as const) {
    test(`${name}, said once Strava is connected and on the way back from it`, async ({ browser, baseURL }) => {
      const device = await aWindow(browser, baseURL);
      const { page } = device;
      await serve(page, GIFT, () => daily(GIFT, "recipient", { ...NOT_STARTED, version }), TERMS as never);
      await page.route("**/api/connect/strava/status*", (route) => route.fulfill(json({ connected: true, since: new Date().toISOString(), bound: false, configured: true })));
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);
      const says = page.locator("[data-connected-says]");
      await expect(says).toHaveText(sentence);
      // The card's title says it is connected, nothing on the card still asks to connect, and the button starts.
      await expect(page.getByText("Strava is connected.", { exact: true })).toHaveCount(1);
      await expect(page.getByText("Connect Strava and it starts.")).toHaveCount(0);
      await expect(page.getByText("Connect your Strava")).toHaveCount(0);
      await expect(page.getByText(/^Start by \d+ \w+ \d{4}, or it goes back to Mom\.$/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Start counting" })).toBeVisible();
      await shot(page, `1-connected-on-contract-${version}`);
      // On the way back from Strava's own page the same is said, from the first image.
      await page.goto(`/g/${GIFT}?connect=done`);
      await expect(says).toHaveText(sentence);
      await expect(page.getByText("Strava is connected.", { exact: true })).toHaveCount(1);
      await device.context.close();
    });
  }

  test("not connected yet, the card still asks to connect, by its title and by its block", async ({ browser, baseURL }) => {
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await serve(page, GIFT, () => daily(GIFT, "recipient", { ...NOT_STARTED, version: 3 }), TERMS as never);
    await page.route("**/api/connect/strava/status*", (route) => route.fulfill(json({ connected: false, since: null, bound: false, configured: true })));
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(page.getByText("Connect Strava and it starts.")).toBeVisible();
    await expect(page.getByText("Connect your Strava")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect Strava" })).toBeVisible();
    await expect(page.getByText("Strava is connected.")).toHaveCount(0);
    await shot(page, "0-not-connected-yet");
    await device.context.close();
  });

  for (const [code, message, name] of [
    ["NOT_STARTED", "Today is day one. It is read tomorrow morning.", "2-count-now-on-day-one"],
    ["NOT_ENOUGH_PROGRESS", "Yesterday's kilometres did not reach your target. Nothing was counted.", "3-a-day-not-reached"],
  ] as const) {
    test(`a press on "Count now" prints the server's sentence as it comes: ${message}`, async ({ browser, baseURL }) => {
      const device = await aWindow(browser, baseURL);
      const { page } = device;
      const counting = { ...NOT_STARTED, version: 3, connected: true, startDay: UTC_DAY(), endDay: UTC_DAY() + 6, todayDayIndex: 1, goalAccount: { ...NOT_STARTED.goalAccount, bound: true } };
      await serve(page, GIFT, () => daily(GIFT, "recipient", counting), TERMS as never);
      await page.route("**/api/connect/strava/status*", (route) => route.fulfill(json({ connected: true, since: new Date().toISOString(), bound: true, configured: true })));
      await page.route(new RegExp(`/api/gift/${GIFT}/count(\\?.*)?$`), (route) => route.fulfill(json({ kind: "refused", giftId: GIFT, code, message, looked: true })));
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);
      // "Count now" lives with the rest of how the gift is checked, under its fold.
      const count = page.getByRole("button", { name: "Count now" });
      if (!(await count.isVisible())) await page.locator("summary").filter({ hasText: /checked|counted/i }).first().click();
      await count.click();
      await expect(page.getByText(message)).toBeVisible();
      await shot(page, name);
      await device.context.close();
    });
  }
});
