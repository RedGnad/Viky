import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, daily, photographer, serve } from "./gift-fixtures";
import { KEY, json, makeAnAccount } from "./gift-kit";

/**
 * A day sleeps until it is done (the founder, 4 Oct 2026, in the place of "the days wake at the opening"). At the
 * opening the row does not move and its days keep their eyes closed: the gift's own character, at the head of the
 * page, answers it once, on the gift's spring. A day earned wakes in its jump, with one small turn in the air, and the
 * days done since the last visit play it on arrival, one after another, once. With less motion asked for, nothing
 * moves and the final state is there.
 *
 * Every movement the page starts is written down as it starts (`Element.animate`), so the test reads what was asked
 * for rather than racing a movement of half a second. VIKY_DAYS_CAPTURES=<folder> photographs the reduced-motion states.
 */
const shot = photographer(process.env.VIKY_DAYS_CAPTURES);

type Started = { part: string; day: number; delay: number; duration: number; from: string; fades: boolean; reacts: boolean; fill: string };

const RECORD = `(() => {
  window.__started = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const day = this.closest ? this.closest(".day-row-day") : null;
    const part = this.getAttribute("data-part") || (this.className && this.className.toString ? this.className.toString() : "") || this.tagName.toLowerCase();
    const timing = typeof options === "number" ? { duration: options } : options || {};
    const list = Array.isArray(frames) ? frames : [];
    window.__started.push({
      part,
      day: day ? [...day.parentElement.children].indexOf(day) : -1,
      delay: timing.delay || 0,
      duration: timing.duration || 0,
      from: list[0] && list[0].transform ? String(list[0].transform) : "",
      fades: list.some((frame) => frame && frame.opacity !== undefined),
      reacts: Boolean(this.closest && this.closest("[data-reacts]")),
      fill: timing.fill || "",
    });
    return animate.call(this, frames, options);
  };
})();`;

const started = (page: Page) => page.evaluate(() => (window as unknown as { __started: Started[] }).__started);
const forget = (page: Page) => page.evaluate(() => ((window as unknown as { __started: Started[] }).__started.length = 0));
/** What moved in the row's own days. */
const inTheRow = (all: Started[]) => all.filter((one) => one.day >= 0);
/**
 * The gift's movement of the character at the head of the page: its body, its shadow, its bow. Its face has a life of
 * its own (it looks at what is pressed, app/kit/mood.ts), which is not what the opening is answered with.
 */
const atTheHead = (all: Started[]) => all.filter((one) => one.reacts && ["figure", "shadow", "bow"].includes(one.part));

/** The gift before and after its opening, as the server answers it: nothing started, nothing counted. */
function unstarted(giftId: string, days: number, opened: boolean) {
  return daily(giftId, "recipient", {
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
  await serve(page, giftId, () => unstarted(giftId, days, opened), TERMS.daily, null);
  await page.route("**/api/gift/claim", async (route) => {
    await new Promise<void>((resolve) => (answer = resolve));
    opened = true;
    await route.fulfill(json({ giftId, claimed: true }));
  });
  return { answer: () => answer?.() };
}

test.describe("a day sleeps until it is done", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const days of [7, 30]) {
    test(`${days} days: at the opening the row stays asleep and still, and the gift's character answers once`, async ({ browser, baseURL }) => {
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

      // The press: the wait is the button's, and nothing answers before the server has.
      await page.getByRole("button", { name: "Open my gift" }).click();
      await page.waitForTimeout(400);
      expect(inTheRow(await started(page))).toEqual([]);
      expect(atTheHead(await started(page))).toEqual([]);

      server.answer();
      await expect(page.getByRole("button", { name: "Open my gift" })).toHaveCount(0);
      await page.waitForTimeout(700);
      // The days: still asleep, every one, named from the characters' file with its eyes closed, and nothing moved.
      await expect(row).toHaveAttribute("data-days", "asleep");
      await expect(row.locator("[data-awake]")).toHaveCount(0);
      await expect(row.locator(".day-row-day svg[data-character='toCome'] use")).toHaveCount(days);
      const all = await started(page);
      expect(inTheRow(all)).toEqual([]);
      // The gift's own character, at the head of the page: the gift's movement on its spring, once, and nothing fades
      // (it was already there: going out and coming back would be a blink).
      const head = atTheHead(all);
      expect(head.length).toBeGreaterThan(0);
      const figure = head.filter((one) => one.part === "figure");
      expect(figure).toHaveLength(1);
      expect(figure[0].from).toBe("translateY(12%) scale(0.55)");
      expect(figure[0].duration).toBeGreaterThan(300);
      expect(figure[0].duration).toBeLessThan(600);
      for (const one of head) expect(one.fades, `${one.part} does not fade`).toBe(false);

      // A page opened again on the opened gift: nothing plays, at the head or in the row.
      await page.reload();
      await expect(page.locator(".day-row-days")).toHaveAttribute("data-days", "asleep");
      await page.waitForTimeout(700);
      const again = await started(page);
      expect(inTheRow(again)).toEqual([]);
      expect(atTheHead(again)).toEqual([]);
      await device.context.close();
    });
  }

  test("with less motion asked for, the opening moves nothing", async ({ browser, baseURL }) => {
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
    await expect(page.getByRole("button", { name: "Open my gift" })).toHaveCount(0);
    await page.waitForTimeout(500);
    const all = await started(page);
    expect(inTheRow(all)).toEqual([]);
    expect(atTheHead(all)).toEqual([]);
    await expect(page.locator(".day-row-days")).toHaveAttribute("data-days", "asleep");
    await shot(page, "reduced-motion-opened-asleep", false);
    await device.context.close();
  });

  test("the days done since the last visit wake in their jump, one after another, once: eyes shut, one turn, eyes open", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "861";
    const device = await aWindow(browser, baseURL);
    const { page, context } = device;
    await context.addInitScript(RECORD);
    // Two days earned, and a device that last saw none of them.
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await makeAnAccount(device);
    await context.addCookies([{ name: "viky.seen", value: encodeURIComponent(JSON.stringify({ [`days.${GIFT}`]: 0 })), url: new URL(page.url()).origin }]);
    await forget(page);
    await page.goto(`/g/${GIFT}`);
    const row = page.locator(".day-row-days");
    await expect(row.locator("svg[data-character='earned']")).toHaveCount(2);
    await expect.poll(async () => inTheRow(await started(page)).filter((one) => one.part === "figure").length, { timeout: 10_000 }).toBe(2);
    const moved = inTheRow(await started(page));
    const of = (day: number, part: string) => moved.filter((one) => one.day === day && one.part === part);
    for (const day of [0, 1]) {
      // The jump of a day earned, and with it: both eyes held shut until the landing, the smile small, one whole turn.
      expect(of(day, "figure"), `day ${day + 1} jumps once`).toHaveLength(1);
      const eyes = of(day, "eye");
      expect(eyes).toHaveLength(2);
      for (const eye of eyes) {
        expect(eye.from).toBe("scaleY(0.36)");
        expect(eye.fill, "asleep through its wait").toBe("backwards");
        expect(eye.delay).toBe(of(day, "figure")[0].delay);
        expect(eye.duration).toBe(of(day, "figure")[0].duration);
      }
      expect(of(day, "mouth").map((one) => one.from)).toEqual(["scale(0.4)"]);
      expect(of(day, "whirl").map((one) => one.from)).toEqual(["rotate(-360deg)"]);
      // It is there from the first image, asleep: nothing holds it invisible until its turn.
      expect(moved.filter((one) => one.day === day && one.fades)).toEqual([]);
    }
    // One after the other: the second starts after the first, and before the arrival's two seconds are out.
    expect(of(1, "figure")[0].delay).toBeGreaterThan(of(0, "figure")[0].delay);
    expect(of(1, "figure")[0].delay + of(1, "figure")[0].duration).toBeLessThanOrEqual(2_000);
    // The days not done do not move.
    expect(moved.filter((one) => one.day > 1)).toEqual([]);
    // Once it has played, the eyes are open and nothing is left turned.
    await page.waitForTimeout(1_500);
    for (const part of ["eye", "mouth", "whirl"]) {
      expect(await row.locator(`svg[data-character='earned'] [data-part='${part}']`).first().evaluate((element) => getComputedStyle(element).transform), part).toBe("none");
    }
    await expect(row.locator(".arrival-pending")).toHaveCount(0);

    // Once only: the same page opened again plays nothing in the row.
    await page.reload();
    await expect(page.locator(".day-row-days svg[data-character='earned']")).toHaveCount(2);
    await page.waitForTimeout(900);
    expect(inTheRow(await started(page))).toEqual([]);
    await device.context.close();
  });

  test("with less motion asked for, the days done since the last visit are there, eyes open, and nothing plays", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "862";
    const device = await aWindow(browser, baseURL);
    const { page, context } = device;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await context.addInitScript(RECORD);
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await makeAnAccount(device);
    await context.addCookies([{ name: "viky.seen", value: encodeURIComponent(JSON.stringify({ [`days.${GIFT}`]: 0 })), url: new URL(page.url()).origin }]);
    await forget(page);
    await page.goto(`/g/${GIFT}`);
    const row = page.locator(".day-row-days");
    await expect(row.locator("svg[data-character='earned']")).toHaveCount(2);
    await page.waitForTimeout(700);
    expect(inTheRow(await started(page))).toEqual([]);
    expect(await row.locator("svg[data-character='earned'] [data-part='eye']").first().evaluate((element) => getComputedStyle(element).transform)).toBe("none");
    expect(await row.locator("svg[data-character='earned']").first().evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await shot(page, "reduced-motion-days-done", false);
    await device.context.close();
  });
});
