import { expect, test, type Page } from "@playwright/test";
import { DAY, KEY, gift, json, makeAnAccount, neverAskedToBeTold, now, profile, shot as capture, sizesFor, type Who } from "./gift-kit";

/**
 * The small line at the head of a gift's card, read by each of its people (the founder, 10 Oct 2026). "Your gift" is
 * said to the one who made the gift and to nobody else. When the funder gave no name, a card said "Your gift" to the
 * person the gift is for, right above "For you": the same thing twice, in the words of the funder's own card. It now
 * says "A gift", on the gift's page, on the link before it is opened, and on the lists. The moment keeps "A gift for
 * you".
 *
 * The gift is the test's own, answered as the gift route answers it; the pages, the sign-in and every press are real.
 *
 * VIKY_WHOSE_GIFT_CAPTURES=<folder> also photographs each card, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_WHOSE_GIFT_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

const GIFT = "1999967";
const TERMS = { conditionId: "university-enrollment-shown", target: 1, asked: "enrolled at that university", amount: "5000000", amountDisplay: "$5.00" };
/** The funder wrote no name of their own: the gift carries the name of the person it is for and nothing else. */
const UNSIGNED = { recipientName: "Boo", funderName: null };
const SIGNED = { recipientName: "Boo", funderName: "Mom" };

const enrolment = (who: Who, names: typeof UNSIGNED | typeof SIGNED, over: Record<string, unknown> = {}) => gift(GIFT, who, { ...TERMS, names, deadlineMs: (now() + 20 * DAY) * 1000, ...over });
const unopened = (names: typeof UNSIGNED | typeof SIGNED) => gift(GIFT, "link", { ...TERMS, names, opened: false, connected: false, claimedAtChain: 0, phase: "unopened", deadlineMs: null });

/** The gift as a list holds it. */
const listed = (role: "recipient" | "funder", names: typeof UNSIGNED | typeof SIGNED) => ({
  giftId: GIFT,
  role,
  goalType: 40,
  goalUsername: null,
  usernameSource: null,
  ...names,
  catchUpSeconds: 108_000,
  days: [],
  fundedAt: now() - 5 * DAY,
  startDay: 0,
  endDay: 0,
  amountDisplay: "$5.00",
  perDayDisplay: "$0.00",
  durationDays: 30,
  creditedDays: 0,
  missedDays: 0,
  opened: true,
  counting: true,
  finished: false,
  cancelled: false,
  earnedDisplay: "$0.00",
  theirsDisplay: "$0.00",
  returnedDisplay: "$0.00",
  milestone: enrolment(role, names),
});

async function answer(page: Page, status: () => unknown, reachedSeen = true) {
  await page.route(new RegExp(`/api/gift/${GIFT}(\\?.*)?$`), (route) => route.fulfill(json(status())));
  await page.route(`**/api/gift/${GIFT}/consent`, (route) =>
    route.fulfill(json({ giftId: GIFT, state: null, reading: "no_agreement", opened: true, finished: false, terms: { what: "your enrolment" }, until: "the gift's last day", texts: { yes: "yes", stop: "stop" } })),
  );
  await page.route(`**/api/gift/${GIFT}/journal`, (route) => route.fulfill(json({ giftId: GIFT, kind: "milestone", readings: [] })));
  await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => route.fulfill(json({ seen: reachedSeen })));
  await page.route(/\/api\/proof\/session(\?.*)?$/, (route) => route.fulfill(json({ open: null })));
}

async function lists(page: Page, role: "recipient" | "funder", names: typeof UNSIGNED | typeof SIGNED) {
  await page.unroute("**/api/gifts/mine");
  await page.route("**/api/gifts/mine", (route) => route.fulfill(json({ account: "", gifts: [listed(role, names)] })));
}

const pageCard = (page: Page) => page.locator("section.gift-card-placed");
const head = (page: Page) => pageCard(page).locator(".gift-eyebrow");
const who = (page: Page) => pageCard(page).locator(".gift-who");
const listCard = (page: Page) => page.locator(`a[href="/g/${GIFT}"]`);
/** The two lines at the head of a list's card, as they are read: the label, then the title. */
const listHead = async (page: Page) => (await listCard(page).locator("span.block").first().textContent()) ?? "";

test.describe("whose gift a card says it is", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`with no name from the funder, the person it is for reads "A gift" above "For you", never "Your gift" (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await profile(browser, baseURL, size.viewport);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      let status: () => unknown = () => unopened(UNSIGNED);
      await answer(page, () => status());

      // The link, before it is opened: whoever holds it is the person it is for.
      await page.goto(`/g/${GIFT}?t=${KEY}`);
      await expect(page.getByRole("button", { name: "Open my gift", exact: true })).toBeVisible();
      await expect(head(page)).toHaveText("A gift");
      await expect(who(page)).toHaveText("For you");
      await expect(page.getByText("Your gift", { exact: true })).toHaveCount(0);
      await shot(page, size.name, "1-the-link-no-name-from-the-funder");

      // Opened, on the gift's own page.
      status = () => enrolment("recipient", UNSIGNED);
      await lists(page, "recipient", UNSIGNED);
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);
      await expect(page.getByRole("button", { name: "Show it", exact: true })).toBeVisible();
      await expect(head(page)).toHaveText("A gift");
      await expect(who(page)).toHaveText("For you");
      await expect(page.getByText("Your gift", { exact: true })).toHaveCount(0);
      await shot(page, size.name, "2-the-gift-page-no-name-from-the-funder");

      // On the lists: Gifts, then Home.
      await page.goto("/gifts");
      await expect(listCard(page)).toBeVisible();
      expect(await listHead(page)).toBe("A gift");
      await expect(listCard(page).getByText("For you", { exact: true })).toBeVisible();
      await expect(page.getByText("Your gift", { exact: true })).toHaveCount(0);
      await shot(page, size.name, "3-gifts-no-name-from-the-funder");
      await page.goto("/");
      await expect(listCard(page)).toBeVisible();
      expect(await listHead(page)).toBe("A gift");
      await expect(listCard(page).getByText("For you", { exact: true })).toBeVisible();
      await expect(page.getByText("Your gift", { exact: true })).toHaveCount(0);
      await shot(page, size.name, "4-home-no-name-from-the-funder");

      // The moment keeps its own words: a whole sentence, standing alone.
      status = () => enrolment("recipient", UNSIGNED, { reached: true, reachedAtMs: Date.now(), finished: true, earned: "5000000", earnedDisplay: "$5.00", phase: "reached" });
      await page.unroute(`**/api/gift/${GIFT}/reached-seen`);
      await page.route(`**/api/gift/${GIFT}/reached-seen`, (route) => route.fulfill(json({ seen: false })));
      await page.goto(`/g/${GIFT}`);
      const moment = page.locator("dialog.reached-moment");
      await expect(moment).toBeVisible();
      await expect(moment.getByText("A gift for you", { exact: true })).toBeVisible();
      await shot(page, size.name, "5-the-moment-no-name-from-the-funder");
      await device.context.close();
    });

    test(`a name from the funder is said as before, and "Your gift" stays the funder's (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      // The person it is for, the funder named.
      const theirs = await profile(browser, baseURL, size.viewport);
      await neverAskedToBeTold(theirs.context);
      await answer(theirs.page, () => enrolment("recipient", SIGNED));
      await lists(theirs.page, "recipient", SIGNED);
      await makeAnAccount(theirs);
      await theirs.page.goto(`/g/${GIFT}`);
      await expect(head(theirs.page)).toHaveText("A gift from Mom");
      await expect(who(theirs.page)).toHaveText("For you");
      await theirs.page.goto("/gifts");
      await expect(listCard(theirs.page)).toBeVisible();
      expect(await listHead(theirs.page)).toBe("A gift from Mom");
      await theirs.context.close();

      // The one who made it, who wrote no name of their own: the gift is theirs to call "your".
      const funder = await profile(browser, baseURL, size.viewport);
      await neverAskedToBeTold(funder.context);
      await answer(funder.page, () => enrolment("funder", UNSIGNED));
      await lists(funder.page, "funder", UNSIGNED);
      await makeAnAccount(funder);
      await funder.page.goto(`/g/${GIFT}`);
      await expect(head(funder.page)).toHaveText("Your gift");
      await expect(who(funder.page)).toHaveText("For Boo");
      await shot(funder.page, size.name, "6-the-gift-page-as-the-funder-reads-it");
      await funder.page.goto("/gifts");
      await expect(listCard(funder.page)).toBeVisible();
      expect(await listHead(funder.page)).toBe("Your gift");
      await expect(listCard(funder.page).getByText("For Boo", { exact: true })).toBeVisible();
      await shot(funder.page, size.name, "7-gifts-as-the-funder-reads-it");
      await funder.context.close();
    });
  }
});
