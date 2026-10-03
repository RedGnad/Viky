import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, daily, photographer, serve } from "./gift-fixtures";
import { KEY, json, makeAnAccount } from "./gift-kit";

/**
 * At the opening, the days wake (the founder, 3 Oct 2026; the motion roadmap, section 6). Before, the characters of
 * the row have their eyes closed; when the server answers that the gift is opened, their eyes open one by one from the
 * left, 40 ms apart, on the spring a day earned lands on, and the whole row has woken in 600 ms whatever its length;
 * then the sentence and the action that follow arrive. Nothing plays before the answer, nothing plays again on a page
 * opened later, and a device that asks for less motion draws the eyes open at once.
 *
 * Every movement the page starts is written down as it starts (`Element.animate`), so the test reads what was asked
 * for rather than racing a movement of half a second. VIKY_WAKE_CAPTURES=<folder> photographs the reduced-motion state.
 */
const shot = photographer(process.env.VIKY_WAKE_CAPTURES);

type Started = { part: string; day: number; delay: number; duration: number };

const RECORD = `(() => {
  window.__started = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const day = this.closest ? this.closest(".day-row-day") : null;
    const part = this.getAttribute("data-part") || (this.className && this.className.toString ? this.className.toString() : "");
    const timing = typeof options === "number" ? { duration: options } : options || {};
    window.__started.push({ part, day: day ? [...day.parentElement.children].indexOf(day) : -1, delay: timing.delay || 0, duration: timing.duration || 0 });
    return animate.call(this, frames, options);
  };
})();`;

const started = (page: Page) => page.evaluate(() => (window as unknown as { __started: Started[] }).__started);
/** The eyes of the row's own days: the character at the head of the page has eyes too, and they are its own affair. */
const rowEyes = (all: Started[]) => all.filter((one) => one.part === "eye" && one.day >= 0);

/** The gift before and after its opening, as the server answers it: nothing started, nothing counted. */
function gift(giftId: string, days: number, opened: boolean) {
  return daily(giftId, opened ? "recipient" : "recipient", {
    opened,
    youAreTheRecipient: opened,
    connected: false,
    durationDays: days,
    startDay: 0,
    endDay: 0,
    creditedDays: 0,
    daysLeft: days,
    earned: "0",
    earnedDisplay: "$0.00",
    alreadyTheirs: "0",
    alreadyTheirsDisplay: "$0.00",
    days: [],
    claimedAtChain: opened ? Math.floor(Date.now() / 1000) : 0,
    todayDayIndex: 0,
    version: 1,
    end: null,
  });
}

async function atTheLink(page: Page, giftId: string, days: number) {
  let opened = false;
  let answer: (() => void) | undefined;
  await serve(page, giftId, () => gift(giftId, days, opened), TERMS.daily, null);
  await page.route("**/api/gift/claim", async (route) => {
    await new Promise<void>((resolve) => (answer = resolve));
    opened = true;
    await route.fulfill(json({ giftId, claimed: true }));
  });
  return { answer: () => answer?.() };
}

test.describe("at the opening, the days wake", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const days of [7, 30, 90]) {
    test(`${days} days: asleep before, awake after, one by one, and the whole row inside 600 ms`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = `8${days}`;
      const device = await aWindow(browser, baseURL);
      const { page, context } = device;
      await context.addInitScript(RECORD);
      const server = await atTheLink(page, GIFT, days);
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}?t=${KEY}`);
      const row = page.locator(".day-row-days");
      await expect(row).toHaveAttribute("data-days", "asleep");
      await expect(row.locator(".day-row-day")).toHaveCount(days);
      await expect(row.locator("[data-awake]")).toHaveCount(0);

      // The press: the wait is the button's, and no day moves before the server has answered.
      await page.getByRole("button", { name: "Open my gift" }).click();
      await page.waitForTimeout(400);
      await expect(row).toHaveAttribute("data-days", "asleep");
      expect(rowEyes(await started(page))).toEqual([]);

      server.answer();
      await expect(row).toHaveAttribute("data-days", "awake");
      await expect(row.locator("[data-awake]")).toHaveCount(days);
      const eyes = rowEyes(await started(page));
      // Two eyes a day, every day of the row.
      expect(eyes).toHaveLength(days * 2);
      const duration = eyes[0].duration;
      expect(duration).toBeGreaterThan(300);
      expect(duration).toBeLessThan(600);
      for (const eye of eyes) {
        expect(eye.duration).toBe(duration);
        expect(eye.delay).toBe(Math.min(eye.day * 40, 600 - duration));
        expect(eye.delay + eye.duration, `day ${eye.day + 1} has woken by 600 ms`).toBeLessThanOrEqual(600);
      }
      expect(eyes.filter((eye) => eye.day < 4).map((eye) => eye.delay)).toEqual([0, 0, 40, 40, 80, 80, 120, 120]);
      // Then the sentence and the action that follow: they arrive once the whole row has woken.
      const after = (await started(page)).filter((one) => /gift-state|gift-next|gift-action/.test(one.part));
      expect(after.length).toBeGreaterThan(0);
      for (const block of after) expect(block.delay).toBe(600);
      // Open and still once it has played: the eyes keep the open shape.
      await page.waitForTimeout(900);
      const open = await row.locator('.day-row-day [data-part="eye"]').first().evaluate((eye) => getComputedStyle(eye).transform);
      expect(open).toBe("matrix(1, 0, 0, 2.8, 0, 0)");

      // A page opened again on the opened gift draws them awake and plays nothing.
      await page.reload();
      await expect(page.locator(".day-row-days")).toHaveAttribute("data-days", "awake");
      await page.waitForTimeout(600);
      expect(rowEyes(await started(page))).toEqual([]);
      await device.context.close();
    });
  }

  test("with less motion asked for, the eyes are open at once and nothing plays", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "899";
    const device = await aWindow(browser, baseURL);
    const { page, context } = device;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await context.addInitScript(RECORD);
    const server = await atTheLink(page, GIFT, 7);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}?t=${KEY}`);
    await page.getByRole("button", { name: "Open my gift" }).click();
    await page.waitForTimeout(300);
    server.answer();
    const row = page.locator(".day-row-days");
    await expect(row).toHaveAttribute("data-days", "awake");
    expect((await started(page)).filter((one) => (one.part === "eye" && one.day >= 0) || /gift-state|gift-next|gift-action/.test(one.part))).toEqual([]);
    expect(await row.locator('.day-row-day [data-part="eye"]').first().evaluate((eye) => getComputedStyle(eye).transform)).toBe("matrix(1, 0, 0, 2.8, 0, 0)");
    await shot(page, "reduced-motion-awake", false);
    await device.context.close();
  });
});
