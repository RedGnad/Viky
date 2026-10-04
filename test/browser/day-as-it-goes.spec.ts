import { expect, test, type Page } from "@playwright/test";
import { TERMS, aWindow, daily, photographer, serve, type Who } from "./gift-fixtures";
import { DAY, json, makeAnAccount, neverAskedToBeTold, now } from "./gift-kit";

/**
 * The day on the third daily contract, read as its page opens (the founder's mockup of 3 Oct 2026, day-v3): four
 * states of the gift's page, for the person it is for and for the person who offered it. No button: opening the page
 * is the gesture. A look costs nothing and is asked as the page opens; the attested reading starts by itself for a
 * lesson seen; a day counted jumps, once, and the amount counts to its new value.
 *
 * What is real: the product's pages against the server under test, the sign-in with a passkey. What is stood in for:
 * the gift, which a new account does not have, so its page is answered here as the gift route answers it, and the
 * look and the count the page asks for.
 *
 * VIKY_DAY_CAPTURES=<folder> also photographs each state at 390 by 844, and VIKY_DECIDE_NIGHT=1 walks them after dark.
 */
const shot = photographer(process.env.VIKY_DAY_CAPTURES);

const card = (page: Page) => page.locator("section.gift-card-placed");
const today = () => Math.floor(now() / DAY);

/** Seven days at $2.40 from the day of the connection, yesterday: today is day 2, and day 1 is counted. */
function dayTwo(giftId: string, who: Who, over: Record<string, unknown> = {}) {
  return daily(giftId, who, {
    version: 3,
    readLive: true,
    amount: "16800000",
    amountDisplay: "$16.80",
    perDay: "2400000",
    perDayDisplay: "$2.40",
    creditedDays: 1,
    daysLeft: 6,
    earned: "2400000",
    earnedDisplay: "$2.40",
    alreadyTheirs: "2400000",
    alreadyTheirsDisplay: "$2.40",
    days: [{ day: today() - 1, outcome: "earned" }],
    startDay: today() - 1,
    endDay: today() + 5,
    todayDayIndex: 2,
    end: who === "recipient" ? { keep: "2400000", keepDisplay: "$2.40", giveBack: "14400000", giveBackDisplay: "$14.40", nonce: "0" } : null,
    ...over,
  });
}

/** The same gift once today is counted. */
const counted = (giftId: string, who: Who) =>
  dayTwo(giftId, who, {
    creditedDays: 2,
    daysLeft: 5,
    earned: "4800000",
    earnedDisplay: "$4.80",
    alreadyTheirs: "4800000",
    alreadyTheirsDisplay: "$4.80",
    days: [
      { day: today() - 1, outcome: "earned" },
      { day: today(), outcome: "earned" },
    ],
  });

/** Day 3, with day 1 counted and yesterday missed: yesterday is still inside its window. */
const yesterdayOpen = (giftId: string, who: Who) => dayTwo(giftId, who, { startDay: today() - 2, endDay: today() + 4, days: [{ day: today() - 2, outcome: "earned" }], daysLeft: 6, todayDayIndex: 3 });

type Asked = { looks: number; counts: number };

/** The look and the count as the count route answers them, each counted. `release` lets a count that is held answer. */
async function reading(page: Page, giftId: string, look: () => unknown, count: () => unknown = () => ({ kind: "already", giftId, reason: "read_recently" })) {
  const asked: Asked = { looks: 0, counts: 0 };
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(new RegExp(`/api/gift/${giftId}/count(\\?.*)?$`), async (route) => {
    if (new URL(route.request().url()).searchParams.get("look") === "1") {
      asked.looks += 1;
      return route.fulfill(json(look()));
    }
    asked.counts += 1;
    await held;
    return route.fulfill(json(count()));
  });
  return { asked, release };
}

const NOT_IN = (giftId: string) => ({ kind: "refused", giftId, code: "NOT_ENOUGH_PROGRESS", message: "Not enough yet for a full day. One more lesson and it counts.", looked: true });

for (const who of ["recipient", "funder"] as const) {
  const mine = who === "recipient";
  const label = mine ? "to the person it is for" : "to the person who offered it";
  const prefix = mine ? "" : "funder-";

  test.describe(`the day read as its page opens, ${label}`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

    test("1. today is open and the lesson is not in yet: the page looked as it opened, and nothing is pressed", async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = mine ? "51" : "61";
      const device = await aWindow(browser, baseURL);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      await serve(page, GIFT, () => dayTwo(GIFT, who), TERMS.daily);
      const { asked } = await reading(page, GIFT, () => NOT_IN(GIFT));
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);

      await expect(card(page).locator(".gift-state")).toHaveText("Today's lesson is not in yet.");
      await expect(card(page).locator(".day-row-where")).toHaveText("Day 2 of 7");
      await expect(card(page).locator(".gift-figures")).toContainText(mine ? "Yours so far" : "Theirs so far");
      await expect(card(page).locator(".gift-back")).toHaveText(/^(\d{1,2} h \d{2}|\d{1,2} min)$/);
      await expect(card(page).locator(".gift-figures")).toContainText("Left today");
      // The look left as the page opened; no proof was asked for, because no lesson was seen.
      await expect.poll(() => asked.looks).toBeGreaterThanOrEqual(1);
      expect(asked.counts).toBe(0);
      // Nothing announces a next reading, and nothing is offered to press.
      await expect(card(page)).not.toContainText("Next reading");
      await shot(page, `${prefix}1-lesson-not-in-yet`);
      await page.getByText("How this is checked").click();
      await expect(page.getByRole("button", { name: "Count now" })).toHaveCount(0);
      // When it is read is a line, the same to both people (the founder, 4 Oct 2026: a fold holds lines, never paragraphs).
      await expect(card(page).locator("dl.said-lines > div").filter({ hasText: /^Read/ })).toHaveText("Readwhen this page opens, and through the day");
    });

    test("2 and 3. the lesson is seen, the reading runs in the open, and the day counts: it jumps, and the amount counts up", async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = mine ? "52" : "62";
      const device = await aWindow(browser, baseURL);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      let isCounted = false;
      await serve(page, GIFT, () => (isCounted ? counted(GIFT, who) : dayTwo(GIFT, who)), TERMS.daily);
      const { asked, release } = await reading(
        page,
        GIFT,
        () => (isCounted ? { kind: "refused", giftId: GIFT, code: "NOTHING_TO_CREDIT", message: "", looked: true } : { kind: "seen", giftId: GIFT }),
        () => {
          isCounted = true;
          return { kind: "counted", giftId: GIFT, totalXp: 1_010, creditedDays: 1, hash: `0x${"c3".repeat(32)}` };
        },
      );
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);

      // 2. Seen: the state says so, and the wheel says what the reading is doing. The figures have not moved.
      await expect(card(page).locator(".gift-state")).toHaveText(mine ? "Your lesson is in." : "Boo's lesson is in.");
      const waiting = card(page).locator("p.gift-next[data-waiting]");
      await expect(waiting).toHaveText("Asking Duolingo, certifying its answer, then writing it down.");
      await expect(waiting.locator(".working-ring")).toHaveCount(1);
      await expect(card(page).locator(".gift-figures")).toContainText("$2.40");
      await expect(card(page).locator(".gift-figures")).toContainText("Left today");
      expect(asked.counts).toBe(1);
      await shot(page, `${prefix}2-lesson-seen-reading`);

      // 3. Counted: the state, the amount at its new value, and what today added where the time left was.
      release();
      await expect(card(page).locator(".gift-state")).toHaveText("Today counted.");
      await expect(card(page).locator("[data-count-settled='true']").first()).toHaveText("$4.80", { timeout: 15_000 });
      await expect(card(page).locator(".gift-back")).toHaveText("+ $2.40");
      await expect(card(page).locator(".gift-figures")).toContainText("Today");
      await expect(card(page).locator(".day-row-where")).toHaveText("Day 2 of 7");
      await expect(waiting).toHaveCount(0);
      // Today is counted: nothing more is looked for, and one proof was taken for it.
      const looksThen = asked.looks;
      await page.waitForTimeout(1_500);
      expect(asked.looks).toBe(looksThen);
      expect(asked.counts).toBe(1);
      await shot(page, `${prefix}3-today-counted`);
    });

    test("4. yesterday was missed and can still be caught up: the card says what the next lesson pays, and how long is left for it", async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const GIFT = mine ? "53" : "63";
      const device = await aWindow(browser, baseURL);
      const { page } = device;
      await neverAskedToBeTold(device.context);
      await serve(page, GIFT, () => yesterdayOpen(GIFT, who), TERMS.daily);
      const { asked } = await reading(page, GIFT, () => NOT_IN(GIFT));
      await makeAnAccount(device);
      await page.goto(`/g/${GIFT}`);

      await expect(card(page).locator(".gift-state")).toHaveText("Yesterday can still be caught up.");
      await expect(card(page).locator("p.gift-next")).toHaveText(mine ? "Your next lesson pays yesterday. One more pays today." : "Boo's next lesson pays yesterday. One more pays today.");
      await expect(card(page).locator(".day-row-where")).toHaveText("Day 3 of 7");
      await expect(card(page).locator(".gift-back")).toHaveText(/^(\d{1,2} h \d{2}|\d{1,2} min)$/);
      await expect(card(page).locator(".gift-figures")).toContainText("Left for yesterday");
      await expect.poll(() => asked.looks).toBeGreaterThanOrEqual(1);
      expect(asked.counts).toBe(0);
      await shot(page, `${prefix}4-yesterday-can-be-caught-up`);
    });
  });
}

test.describe("the day read as its page opens, when the reading fails on our side", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  test("the day stays open, and the page says until when it can still be counted", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "54";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => dayTwo(GIFT, "recipient"), TERMS.daily);
    const { asked, release } = await reading(
      page,
      GIFT,
      () => ({ kind: "seen", giftId: GIFT }),
      () => ({ kind: "refused", giftId: GIFT, code: "FETCH_FAILED", message: "Duolingo could not be read just now. Try again in a minute." }),
    );
    release();
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    // Under the state, never beside the figures: a sentence of that length would push the time left out of its column.
    const failure = card(page).locator("p.gift-next");
    // In the page's own words: the answer's were written for a press, and nothing is pressed here.
    await expect(failure).toHaveText(/^Duolingo could not be read just now\. The day stays open: it can still be counted until (tomorrow, \d{1,2} [A-Z][a-z]{2}, at|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} at) \d{1,2}:\d{2}\.$/);
    await expect(card(page).locator(".gift-state")).toHaveText("Today's lesson is not in yet.");
    await expect(card(page).locator(".gift-back")).toHaveText(/^(\d{1,2} h \d{2}|\d{1,2} min)$/);
    expect(asked.counts).toBe(1);
    await shot(page, "5-reading-failed-day-stays-open");
  });
});

/** Whether the wheel of a look was ever drawn, kept by the page itself from before its first paint. A string: a function sent to the page loses its name on the way. */
const WATCH_THE_WHEEL = "window.__wheelSeen = false; new MutationObserver(function () { if (document.querySelector('[data-looking]')) window.__wheelSeen = true; }).observe(document, { subtree: true, childList: true });";

test.describe("the look taken as the page opens, said only when it is slow", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  /** The look held until it is let go, with the moment it was asked. Nothing else is asked of the count route. */
  async function heldLook(page: Page, giftId: string) {
    const asked = { looks: 0, counts: 0, firstAtMs: 0 };
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(new RegExp(`/api/gift/${giftId}/count(\\?.*)?$`), async (route) => {
      if (new URL(route.request().url()).searchParams.get("look") !== "1") {
        asked.counts += 1;
        return route.fulfill(json({ kind: "already", giftId, reason: "read_recently" }));
      }
      asked.looks += 1;
      if (asked.looks === 1) {
        asked.firstAtMs = Date.now();
        await held;
      }
      return route.fulfill(json(NOT_IN(giftId)));
    });
    return { asked, release };
  }

  test("a look that answers within a second is never seen", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "55";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => dayTwo(GIFT, "recipient"), TERMS.daily);
    const { asked, release } = await heldLook(page, GIFT);
    await makeAnAccount(device);
    await page.addInitScript(WATCH_THE_WHEEL);
    await page.goto(`/g/${GIFT}`);
    await expect(card(page).locator(".gift-state")).toHaveText("Today's lesson is not in yet.");
    await expect.poll(() => asked.looks).toBe(1);
    // Answered four tenths of a second after it was asked, then left well past the second: no wheel was ever drawn.
    await page.waitForTimeout(Math.max(0, 400 - (Date.now() - asked.firstAtMs)));
    release();
    await page.waitForTimeout(1_500);
    expect(await page.evaluate("window.__wheelSeen")).toBe(false);
    await expect(card(page).locator("[data-looking]")).toHaveCount(0);
    expect(asked.counts).toBe(0);
  });

  test("past a second the wheel turns beside the state, without a word, and the card waits for nothing", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "56";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await neverAskedToBeTold(device.context);
    await serve(page, GIFT, () => dayTwo(GIFT, "recipient"), TERMS.daily);
    const { asked, release } = await heldLook(page, GIFT);
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    const state = card(page).locator(".gift-state");
    const wheel = card(page).locator("[data-looking]");
    const figures = card(page).locator(".gift-figures");
    // The card is drawn at once, whole, while the look has not answered: the state, the days, the money.
    await expect(state).toHaveText("Today's lesson is not in yet.");
    await expect(card(page).locator(".day-row-where")).toHaveText("Day 2 of 7");
    await expect(figures).toContainText("Yours so far");
    // Past the second, the wheel: on the state's own line, turning, and with no word on the screen.
    await expect(wheel).toBeVisible();
    expect(Date.now() - asked.firstAtMs, "silent for a second first").toBeGreaterThanOrEqual(900);
    await expect(wheel).toHaveText("");
    await expect(wheel).toHaveAttribute("aria-label", "Looking for today's lesson");
    await expect(card(page).locator(".gift-state [data-looking]")).toHaveCount(1);
    // In a place of no width: it can take no room on the state's line, however full the line is.
    expect((await card(page).locator(".gift-state-wheel-place").boundingBox())?.width).toBe(0);
    await expect(state).toHaveText("Today's lesson is not in yet.");
    await expect(card(page).locator("[data-waiting]")).toHaveCount(0);
    // Where the money stands while the wheel turns, the page's arrival long over: measured again once it is gone.
    const during = await figures.boundingBox();
    await shot(page, "6-look-still-under-way");
    // And nothing waits for it: a fold opens, and what the person decides is theirs to press.
    await page.getByText("What was agreed").click();
    await expect(card(page).locator("details.gift-fold[open]")).not.toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Stop/ })).toBeEnabled();
    await page.getByText("What was agreed").click();
    // Answered: the wheel goes, the state stays, and no proof was taken for a lesson that is not in.
    release();
    await expect(wheel).toHaveCount(0);
    await expect(state).toHaveText("Today's lesson is not in yet.");
    // Nothing on the card moved when it went: it took no room on the state's line.
    expect(await figures.boundingBox()).toEqual(during);
    expect(asked.counts).toBe(0);
  });
});
