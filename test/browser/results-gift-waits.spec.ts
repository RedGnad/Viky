import { expect, test, type Page } from "@playwright/test";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now, profile, shot as capture, sizesFor, type Who } from "./gift-kit";

/**
 * A gift on a year's results waits (the founder's mockup of 10 Oct 2026), as its two people read it. The page offered
 * "Show it" the day the gift was opened, while the year's results did not exist yet. Now the card says the wait, the
 * one press is "My results are out" in the secondary look, it opens today's "Show it" block unchanged, and "Not yet"
 * puts the wait back. The funder reads the same wait. Enrolment is not a wait.
 *
 * The gift is the test's own, answered as the gift route answers it; the pages, the sign-in and every press are real.
 *
 * VIKY_RESULTS_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900, one after dark.
 */
const SHOTS = process.env.VIKY_RESULTS_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

const GIFT = "1999989";
const LAST_DAY_MS = (now() + 300 * DAY) * 1000;

/** A gift on the year passed, opened, with no proof yet. */
const results = (who: Who, over: Record<string, unknown> = {}) =>
  gift(GIFT, who, { conditionId: "university-year-passed-shown", target: 1, asked: "passed the year at that university", deadlineMs: LAST_DAY_MS, ...over });

async function answer(page: Page, status: () => unknown) {
  await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(status())));
  await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
    route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your results" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
  );
  await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
  // No verification open for this gift.
  await page.route(/\/api\/proof\/session(\?.*)?$/, (route) => route.fulfill(json({ open: null })));
}

const WAIT_YOURS = "Waiting for your results.";
const WAIT_LINE = "This gift is for the year under way. Your university publishes its results at the end of the year: show them here that day.";
const SHOW_HEADLINE = "Show it from your own university account, and it is yours.";

test.describe("a gift on a year's results waits", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the person it is for reads the wait, presses once that the results are out, and can come back to the wait (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let state: Record<string, unknown> = {};
      await answer(page, () => results("recipient", state));
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);

      // The wait is the headline, with when to come back under it; the one press is in the secondary look, and
      // nothing of "Show it" is on the page.
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText(WAIT_YOURS)).toBeVisible();
      await expect(page.getByText(WAIT_LINE)).toBeVisible();
      const resultsOut = page.locator("[data-results-out]");
      await expect(resultsOut).toHaveText("My results are out");
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);
      await expect(page.getByText(SHOW_HEADLINE)).toHaveCount(0);
      await expect(page.getByText("In your name", { exact: true })).toBeVisible();
      await shot(page, size.name, "1-waiting-for-your-results");
      await page.emulateMedia({ colorScheme: "dark" });
      await shot(page, size.name, "1-waiting-for-your-results-after-dark");
      await page.emulateMedia({ colorScheme: "light" });

      // The press opens today's block, unchanged, with "Not yet" under it: the card then says the gesture, as it does
      // on every gift had or not.
      await resultsOut.click();
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toBeVisible();
      await expect(page.getByText("Show it from your university account")).toBeVisible();
      await expect(page.getByText(SHOW_HEADLINE)).toBeVisible();
      await expect(page.getByText(WAIT_YOURS)).toHaveCount(0);
      await expect(resultsOut).toHaveCount(0);
      const notYet = page.locator("[data-results-not-yet]");
      await expect(notYet).toHaveText("Not yet");
      await shot(page, size.name, "2-my-results-are-out-pressed");

      // Back to the wait.
      await notYet.click();
      await expect(page.getByText(WAIT_YOURS)).toBeVisible();
      await expect(resultsOut).toBeVisible();
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);

      // A proof held for review, or refused: where it stands is said, and the wait is over.
      state = { review: { status: "pending" } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Shown. Viky is checking it.")).toBeVisible();
      await expect(resultsOut).toHaveCount(0);
      await expect(notYet).toHaveCount(0);
      state = { review: { status: "refused", message: "This university's page did not show what this gift is for." } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("It was checked and did not show what the gift asks.")).toBeVisible();
      await expect(resultsOut).toHaveCount(0);
      await expect(notYet).toHaveCount(0);
      await device.context.close();
    });

    test(`the one who pays reads the same wait, and has nothing to press (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await answer(page, () => results("funder"));
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Waiting for their results.")).toBeVisible();
      await expect(page.getByText("In their name", { exact: true })).toBeVisible();
      await expect(page.locator("[data-results-out]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);
      await expect(page.getByText("Boo has not shown it yet.")).toHaveCount(0);
      await shot(page, size.name, "3-waiting-for-their-results");
      await device.context.close();
    });
  }

  test("enrolment does not wait: Show it, the day the gift is opened", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 });
    const { page } = device;
    await answer(page, () => gift(GIFT, "recipient", { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", deadlineMs: LAST_DAY_MS }));
    await neverAskedToBeTold(device.context);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await expect(page.getByText(SHOW_HEADLINE)).toBeVisible();
    await expect(page.getByRole("button", { name: "Show it", exact: true })).toBeVisible();
    await expect(page.locator("[data-results-out]")).toHaveCount(0);
    await expect(page.locator("[data-results-not-yet]")).toHaveCount(0);
    await device.context.close();
  });
});
