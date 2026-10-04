import { expect, test } from "@playwright/test";
import { TERMS, aWindow, daily, photographer, serve, type Who } from "./gift-fixtures";
import { DAY, makeAnAccount, now } from "./gift-kit";

/**
 * The row of days on a gift's page (the founder, 3 Oct 2026): what one day is worth is written small under each
 * character, as on the card being filled in (D304), for the person the gift is for as for the one who offered it; and
 * at thirty and ninety days the row scrolls sideways and fades at the edge that still hides a day, as the card's does.
 *
 * The gift is answered here as the server would answer it: a new account has none.
 * VIKY_DAY_ROW_CAPTURES=<folder> also photographs each length at 390 by 844.
 */
const shot = photographer(process.env.VIKY_DAY_ROW_CAPTURES);

/** A gift of this many days, on its third, two counted: its days are worth a round figure each. */
function ofDays(giftId: string, who: Who, days: number) {
  const today = Math.floor(now() / DAY);
  const each = days === 7 ? 240 : days === 30 ? 150 : 50;
  const cents = each * days;
  const money = (value: number) => `$${(value / 100).toFixed(2)}`;
  return daily(giftId, who, {
    durationDays: days,
    amount: String(cents * 10_000),
    amountDisplay: money(cents),
    perDay: String(each * 10_000),
    perDayDisplay: money(each),
    earned: String(2 * each * 10_000),
    earnedDisplay: money(2 * each),
    alreadyTheirs: String(2 * each * 10_000),
    alreadyTheirsDisplay: money(2 * each),
    daysLeft: days - 2,
    endDay: today - 2 + days - 1,
    end: null,
  });
}

test.describe("the row of days on a gift's page", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const who of ["recipient", "funder"] as const) {
    test(`to the ${who}: a day's worth under each character, and thirty and ninety days scroll under a fade`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const device = await aWindow(browser, baseURL);
      const { page } = device;
      await makeAnAccount(device);
      for (const days of [7, 30, 90]) {
        const GIFT = `${who === "recipient" ? 5 : 6}${days}`;
        await serve(page, GIFT, () => ofDays(GIFT, who, days), TERMS.daily);
        await page.goto(`/g/${GIFT}`);
        const row = page.locator(".day-row-days");
        await expect(row.locator(".day-row-day")).toHaveCount(days);
        const worth = row.locator(".day-row-worth");
        await expect(worth).toHaveCount(days);
        const each = days === 7 ? "$2.40" : days === 30 ? "$1.50" : "$0.50";
        expect(new Set(await worth.allInnerTexts())).toEqual(new Set([each]));
        // The day keeps its width, the figure stands under its character and inside its own day, on one line.
        const day = await row.locator(".day-row-day").nth(2).boundingBox();
        const figure = await worth.nth(2).boundingBox();
        expect(day?.width).toBe(48);
        expect(figure!.x).toBeGreaterThanOrEqual(day!.x);
        expect(figure!.x + figure!.width).toBeLessThanOrEqual(day!.x + day!.width + 0.5);
        expect(figure!.height).toBeLessThanOrEqual(19);
        // Said once to a reader of the screen, in "What was agreed", never under each of the days.
        await expect(worth.first()).toHaveAttribute("aria-hidden", "true");
        await expect(page.locator(".day-row-where")).toHaveText(`Day 3 of ${days}`);

        const scrolls = await row.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
        if (days === 7) {
          await shot(page, `${who}-07-days`, false);
          continue;
        }
        // Thirty and ninety: the row scrolls, opens on today with the days to come behind a fade on the right, and at
        // its end the fade has moved to the left, where the days already passed are.
        expect(scrolls, `${days} days scroll`).toBe(true);
        await expect(row).toHaveAttribute("data-more", /right|both/);
        const fade = () => row.evaluate((element) => [getComputedStyle(element).getPropertyValue("--fade-left"), getComputedStyle(element).getPropertyValue("--fade-right")].map((value) => parseFloat(value)));
        expect((await fade())[1], "the right edge fades").toBeGreaterThan(0);
        await shot(page, `${who}-${days}-days`, false);
        await row.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
        await expect(row).toHaveAttribute("data-more", "left");
        // Read once the browser has followed the scroll: on a busy machine the row said "left" a frame before its
        // fade had moved (4 Oct 2026, the suite run whole).
        await expect.poll(async () => (await fade())[0], { message: "the left edge fades at the end" }).toBeGreaterThan(0);
        await expect.poll(async () => (await fade())[1], { message: "and the right one is flat" }).toBe(0);
        await shot(page, `${who}-${days}-days-at-the-end`, false);
      }
      await device.context.close();
    });
  }
});
