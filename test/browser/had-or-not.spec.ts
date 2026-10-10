import { expect, test, type Page } from "@playwright/test";
import { DAY, gift, json, makeAnAccount, neverAskedToBeTold, now, profile, shot as capture, sizesFor, type Who } from "./gift-kit";

/**
 * A gift had or not, as its two people read it (the audit of 1 Oct 2026). Its target on the contract is 1, and the
 * pages printed it: "Reach 1 on their university", "Target 1. Not read yet.", a flag marked 1 on a trail. And once a
 * proof was held, refused, waited for or late, the title stayed "Show it".
 *
 * The gift is the test's own, answered as the gift route answers it; the pages, the sign-in and every press are real.
 *
 * VIKY_HAD_OR_NOT_CAPTURES=<folder> also photographs each state, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_HAD_OR_NOT_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

const GIFT = "1999993";
const LAST_DAY_MS = (now() + 20 * DAY) * 1000;

/** An enrolment gift, opened, with no proof yet: what the contract holds is a target of 1. */
const enrolment = (who: Who, over: Record<string, unknown> = {}) =>
  gift(GIFT, who, { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", deadlineMs: LAST_DAY_MS, ...over });

async function answer(page: Page, status: () => unknown) {
  await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(status())));
  await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
    route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your enrolment" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
  );
  await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
}

const title = (page: Page) => page.locator("main h1, main h2").first();

test.describe("a gift had or not, as its two people read it", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the person it is for never reads the contract's 1, and reads where their proof stands (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let state: Record<string, unknown> = {};
      await answer(page, () => enrolment("recipient", state));
      await neverAskedToBeTold(device.context);
      await makeAnAccount(device);

      // Nothing shown yet: the gesture, and what was agreed in the register's words.
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Show it from your own university account, and it is yours.")).toBeVisible();
      // Being told is offered in the open, under the card, never inside a fold (the founder, 1 Oct 2026): a round
      // button, and what it is for in the sheet it opens.
      await expect(page.locator("details [data-decide]")).toHaveCount(0);
      await page.locator('[data-decide="messages"]').click();
      const messages = page.getByRole("dialog", { name: "Notifications" });
      await expect(messages.getByText("Get a message when it is yours, or when the time is up.")).toBeVisible();
      await expect(messages.getByRole("button", { name: "Turn on" })).toBeVisible();
      await shot(page, size.name, "3a0-yours-told-under-the-card");
      await messages.getByRole("button", { name: "Close" }).click();
      await page.getByText("What was agreed").click();
      // What was agreed is lines (the founder, 4 Oct 2026): what it is for, when, and where it goes if not.
      const agreed = page.locator("details.gift-fold").filter({ hasText: "What was agreed" }).locator("dl.said-lines > div");
      await expect(agreed.nth(0)).toHaveText("Forenrolled at that university");
      await expect(agreed.nth(1)).toHaveText(/^Whenby .+/);
      await expect(agreed.nth(2)).toHaveText("If notback to Mom, two weeks later");
      await page.getByText("How this is checked").click();
      // The rule it pays by is said once, in what was agreed: how it is checked does not repeat it.
      await expect(page.getByText(/It is yours when it is proved/)).toHaveCount(0);
      await expect(page.getByText(/Reach 1 on|reach 1,|Target 1/)).toHaveCount(0);
      await shot(page, size.name, "3a-yours-what-was-agreed");

      // Held for review.
      state = { review: { status: "pending" } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Shown. Viky is checking it.").first()).toBeVisible();
      await expect(page.getByText("Show it from your own university account, and it is yours.")).toHaveCount(0);
      // While it is checked, the answer is the one thing to be told, and it is offered once.
      await page.locator('[data-decide="messages"]').click();
      await expect(page.getByRole("dialog", { name: "Notifications" }).getByText("Get a message when it is checked.")).toBeVisible();
      await expect(page.locator("[data-told]")).toHaveCount(1);
      await shot(page, size.name, "3b-yours-held-for-review");
      await page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Close" }).click();

      // Refused by the review.
      state = { review: { status: "refused" } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("It was checked and did not show what the gift asks.")).toBeVisible();
      await shot(page, size.name, "3c-yours-refused");

      // The university's page still being built.
      // Said by what the person will be able to do, with the day: two days after the gift was made, here today.
      state = { review: { status: "building" }, createdAtChain: now() };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText(/^Your university is being set up\. You can show your page here from \d{1,2} [A-Z][a-z]{2} at the latest\.$/)).toBeVisible();
      // The card says it once: the block under it, which said "within two days", draws nothing.
      await expect(page.getByText(/within two days/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toHaveCount(0);
      await shot(page, size.name, "3d-yours-being-built");
      // Past the day named (this gift was made five days ago): the sentence stays and the day goes.
      state = { review: { status: "building" } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Your university is being set up. The money waits in your name.", { exact: true })).toBeVisible();
      await expect(page.getByText(/at the latest/)).toHaveCount(0);
      await shot(page, size.name, "3d2-yours-being-built-past-the-day");

      // The last day has passed. An enrolment is dated the day it is shown, so nothing shown now can pay: no gesture
      // is offered, and the page says when it goes back.
      state = { phase: "overdue", deadlineMs: (now() - 3 * DAY) * 1000 };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("The last day passed without it.", { exact: true })).toBeVisible();
      await expect(page.getByText(/^It goes back to Mom after .+\.$/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Show it$/ })).toHaveCount(0);
      await shot(page, size.name, "3e-yours-past-the-last-day");
      await device.context.close();
    });

    test(`the funder reads what the person did, and when it comes back (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      let state: Record<string, unknown> = {};
      await answer(page, () => enrolment("funder", state));
      // The card of Gifts: no trail, no flag marked 1, and where the proof stands.
      await page.unroute("**/api/gifts/mine");
      await page.route("**/api/gifts/mine", (route) =>
        route.fulfill(
          json({
            account: "",
            gifts: [
              { giftId: GIFT, role: "funder", goalType: 40, goalUsername: null, usernameSource: null, recipientName: "Boo", funderName: "Mom", catchUpSeconds: 108_000, days: [], fundedAt: now() - 5 * DAY, startDay: 0, endDay: 0, amountDisplay: "$25.00", perDayDisplay: "$0.00", durationDays: 30, creditedDays: 0, missedDays: 0, opened: true, counting: true, finished: false, cancelled: false, earnedDisplay: "$0.00", theirsDisplay: "$0.00", returnedDisplay: "$0.00", milestone: enrolment("funder", state) },
            ],
          }),
        ),
      );
      await makeAnAccount(device);
      await page.goto("/gifts");
      const card = page.locator(`a[href="/g/${GIFT}"]`);
      await expect(card.getByText("Not proved yet.")).toBeVisible();
      await expect(card.getByText(/Target 1/)).toHaveCount(0);
      await expect(card.locator(".had-or-not")).toHaveCount(1);
      await shot(page, size.name, "3f-the-card-in-gifts");

      await neverAskedToBeTold(device.context);
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Boo has not shown it yet.")).toBeVisible();
      // The funder is offered it too: the day it is theirs, or the day it comes back, without opening Viky.
      await page.locator('[data-decide="messages"]').click();
      await expect(page.getByRole("dialog", { name: "Notifications" }).getByText("Get a message when it is theirs, or when the time is up.")).toBeVisible();
      await page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: "Close" }).click();
      await page.getByText("What was agreed").click();
      const agreed = page.locator("details.gift-fold").filter({ hasText: "What was agreed" }).locator("dl.said-lines > div");
      await expect(agreed.nth(0)).toHaveText("Forenrolled at that university");
      await expect(agreed.nth(1)).toHaveText(/^Whenby .+/);
      await expect(agreed.nth(2)).toHaveText("If notback to you, two weeks later");
      await expect(page.getByText(/Reach 1 on|reach 1,|Target 1/)).toHaveCount(0);
      await shot(page, size.name, "3g-theirs-what-was-agreed");

      // The university's page still being set up, said by what the person will be able to do, with the day.
      state = { review: { status: "building" }, createdAtChain: now() };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText(/^Their university is being set up\. They can show their page from \d{1,2} [A-Z][a-z]{2} at the latest\.$/)).toBeVisible();
      await shot(page, size.name, "3g2-theirs-being-built");
      state = { review: { status: "building" } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Their university is being set up.", { exact: true })).toBeVisible();
      await expect(page.getByText(/at the latest/)).toHaveCount(0);
      await shot(page, size.name, "3g3-theirs-being-built-past-the-day");

      state = { review: { status: "pending" } };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("Boo showed it. Viky is checking it.")).toBeVisible();
      await expect(page.getByText("Boo has not shown it yet.")).toHaveCount(0);
      await shot(page, size.name, "3h-theirs-held-for-review");

      state = { phase: "overdue", deadlineMs: (now() - 3 * DAY) * 1000 };
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByText("The last day passed without it.", { exact: true })).toBeVisible();
      await expect(page.getByText(/^It comes back to you after .+\.$/)).toBeVisible();
      await shot(page, size.name, "3i-theirs-past-the-last-day");
      expect(await title(page).count()).toBeGreaterThan(0);
      await device.context.close();
    });
  }
});
