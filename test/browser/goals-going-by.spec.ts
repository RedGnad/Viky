import { expect, test, type Page } from "@playwright/test";
import { profile } from "./gift-kit";

/**
 * The phrase that goes by under the landing's card never stays unseen (10 Oct 2026). The founder found it gone on
 * viky.cash, "Their gift can wait for" with nothing after it, and it stayed gone. What caused it was not found: a
 * probe of several hundred manipulations did not make it happen again. So this holds the page to the thing itself,
 * whatever the cause: while the landing is handled as that probe handled it (the page scrolled, the theme changed,
 * a sheet of the card opened and closed, the tab put behind another), the phrase is never unseen for more than a
 * second, and it goes on changing, one loop and no second one.
 *
 * And the two things the loop is now built to survive, made to happen: an exit that is cancelled, and an exit that
 * ends with nothing answering it.
 *
 * What is real: the product's landing against the server under test, at the size and in the appearance the founder
 * had. What is not shown: the cause of that day, which is unknown.
 */
const SAID = `document.querySelector('[data-goal-said]')`;
/** Watches the phrase ten times a second: the longest it stayed unseen in front of somebody, and when it changed. */
const WATCH = `(() => {
  window.__goals = { longestUnseenMs: 0, changes: [], unseenSince: null };
  let text = ${SAID}.textContent;
  setInterval(() => {
    const said = ${SAID};
    if (!said) return;
    const now = performance.now();
    if (said.textContent !== text) { text = said.textContent; window.__goals.changes.push(Math.round(now)); }
    const box = said.getBoundingClientRect();
    const inFront = !document.hidden && box.bottom > 0 && box.top < window.innerHeight && getComputedStyle(said).visibility !== "hidden";
    if (inFront && Number(getComputedStyle(said).opacity) < 0.05) {
      if (window.__goals.unseenSince === null) window.__goals.unseenSince = now;
      window.__goals.longestUnseenMs = Math.max(window.__goals.longestUnseenMs, Math.round(now - window.__goals.unseenSince));
    } else window.__goals.unseenSince = null;
  }, 100);
})()`;
const seen = (page: Page) => page.evaluate(`JSON.stringify(window.__goals)`).then((said) => JSON.parse(said as string) as { longestUnseenMs: number; changes: number[] });
/** Waits for an exit of the phrase to be under way, does `then` to it at once, and says when. */
const atTheNextExit = (page: Page, then: string) =>
  page.evaluate(
    `new Promise((done) => { const tick = () => { const exit = ${SAID}.getAnimations().find((one) => one.effect.getComputedTiming().fill === "forwards" && one.playState === "running"); if (exit) { ${then}; done(Math.round(performance.now())); } else requestAnimationFrame(tick); }; tick(); })`,
  ) as Promise<number>;

async function landingAtNight(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForSelector("[data-goal-said]");
  await page.evaluate(`document.querySelector('[data-goals-going-by]').scrollIntoView({ block: "end", behavior: "instant" })`);
  await page.evaluate(WATCH);
}

test.describe("the phrase that goes by under the landing's card", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own window");

  test("handled as the founder's probe handled it, it is never unseen for more than a second, and one loop goes on", async ({ browser, baseURL }) => {
    test.setTimeout(150_000);
    const device = await profile(browser, baseURL, { width: 1440, height: 1250 }, { passkey: false });
    const { page, context } = device;
    await landingAtNight(page);
    const between = (low: number, high: number) => low + Math.random() * (high - low);
    const until = Date.now() + 50_000;
    while (Date.now() < until) {
      const pick = ["scroll", "scroll", "theme", "sheet", "tabs"][Math.floor(Math.random() * 5)];
      if (pick === "scroll") {
        const top = [0, 0, 0, 200, 500, 1200, 4000, 9000][Math.floor(Math.random() * 8)];
        await page.evaluate(`window.scrollTo({ top: ${top}, behavior: "instant" })`);
      } else if (pick === "theme") {
        await page.evaluate(`(() => { const control = [...document.querySelectorAll("button")].find((one) => /night|day|light|dark|theme/i.test(one.getAttribute("aria-label") || "")); if (control) control.click(); })()`);
      } else if (pick === "sheet") {
        await page.evaluate(`document.querySelector('[data-goals-going-by]').scrollIntoView({ block: "end", behavior: "instant" })`);
        await page.evaluate(`(() => { const card = document.querySelector("#offer"); if (!card) return; const controls = [...card.querySelectorAll("button")].filter((one) => !/send|pay|offer/i.test(one.textContent || "")); const one = controls[Math.floor(Math.random() * controls.length)]; if (one) one.click(); })()`);
        await page.waitForTimeout(between(300, 2_500));
        await page.keyboard.press("Escape");
      } else {
        const other = await context.newPage();
        await other.bringToFront();
        await page.waitForTimeout(between(200, 3_500));
        await other.close();
        await page.bringToFront();
      }
      await page.waitForTimeout(between(150, 2_200));
      expect((await seen(page)).longestUnseenMs, `unseen after "${pick}"`).toBeLessThanOrEqual(1_000);
    }
    // In front of somebody again, it goes on changing: the loop is alive.
    await page.keyboard.press("Escape");
    await page.evaluate(`document.querySelector('[data-goals-going-by]').scrollIntoView({ block: "end", behavior: "instant" })`);
    const before = (await seen(page)).changes.length;
    await expect.poll(async () => (await seen(page)).changes.length, { timeout: 12_000 }).toBeGreaterThan(before);
    const { changes, longestUnseenMs } = await seen(page);
    expect(longestUnseenMs).toBeLessThanOrEqual(1_000);
    // One loop: a phrase is held long enough to read before the next, so no two changes come close together.
    for (let at = 1; at < changes.length; at += 1) expect(changes[at] - changes[at - 1], "two changes close together are two loops").toBeGreaterThan(2_000);
    await context.close();
  });

  test("an exit that is cancelled, and an exit that ends with nothing answering it: the phrase is seen, and goes on", async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const device = await profile(browser, baseURL, { width: 1440, height: 1250 }, { passkey: false });
    const { page, context } = device;
    await landingAtNight(page);
    // Cancelled part way: the phrase stands as it was, and the loop goes on to its next change.
    let from = (await seen(page)).changes.length;
    await atTheNextExit(page, "exit.cancel()");
    await expect.poll(() => page.evaluate(`Number(getComputedStyle(${SAID}).opacity)`), { timeout: 2_000 }).toBeGreaterThan(0.9);
    await expect.poll(async () => (await seen(page)).changes.length, { timeout: 12_000 }).toBeGreaterThan(from);
    // Held at its end with nobody told: unseen, and nothing moving. The net shows the phrase within a second, and the loop goes on.
    from = (await seen(page)).changes.length;
    await atTheNextExit(page, "exit.pause(); exit.currentTime = exit.effect.getComputedTiming().duration");
    await expect.poll(() => page.evaluate(`Number(getComputedStyle(${SAID}).opacity)`), { timeout: 2_000 }).toBeGreaterThan(0.9);
    await expect.poll(async () => (await seen(page)).changes.length, { timeout: 12_000 }).toBeGreaterThan(from);
    expect((await seen(page)).longestUnseenMs).toBeLessThanOrEqual(1_000);
    await context.close();
  });
});
