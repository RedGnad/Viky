import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * The one who reads its book on the landing, and the app's icon after dark (the founder, 10 Oct 2026).
 *
 * The reader reads by itself while it is on the screen, calmly (his word on the page itself, after a first turn that
 * read the left page then the right, fast and wide, and darkened each line): its eyes go down to the book, drift along
 * three lines, each a little lower, coming back gently between two, then go up to whoever reads the landing and stay
 * there. The mouth follows a quarter of the way. The book is not touched: nothing is drawn over its lines. It blinks
 * now and then with the drawings in view. Off the screen no animation of the turn is left on the page; with less
 * motion asked for, nothing reads.
 *
 * The turn is put at its instants as a still is taken: its two animations paused and set to one time.
 *
 * And after dark the icon is drawn in the page's own colours for the hour, as the reader is.
 *
 * VIKY_LANDING_ALIVE_CAPTURES=<folder> also photographs four instants of the turn, the reader alone at three times the
 * density, and the icon after dark, at 390 by 844 and at 1440 by 900.
 */
const SHOTS = process.env.VIKY_LANDING_ALIVE_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);

const STORY = "[data-landing-story]";
const ICON = `document.querySelector('${STORY} svg[data-character="icon"]')`;
const READER = `document.querySelector('${STORY} [data-reads]')`;
const HERO_LIDS = `[...document.querySelectorAll('.hero-stage [data-part="lid"]')]`;
/** The animations of the reader's turn: the ones that repeat, which a blink's do not. */
const TURN = `${READER}.getAnimations({ subtree: true }).filter((one) => one.effect.getComputedTiming().iterations === Infinity)`;
/** Whether the turn is running: the eyes and the mouth, and nothing else. */
const READING_RUNS = `(() => { const turn = ${TURN}; return turn.length === 2 && turn.every((one) => one.playState === "running"); })()`;
/** Puts the turn at one instant: its animations, kept in hand once taken, paused and set there. */
const setReadingAt = (page: Page, ms: number) => page.evaluate(`(window.__turn = window.__turn || ${TURN}).forEach((one) => { one.pause(); one.currentTime = ${ms}; })`);
/** Where a part of the drawing has been moved to, in the drawing's own units. */
const MOVED = (part: string) => `(() => { const style = getComputedStyle(${READER}.querySelector('[data-part="${part}"]')).transform; if (!style || style === "none") return { x: 0, y: 0 }; const m = new DOMMatrix(style); return { x: m.e, y: m.f }; })()`;
/** The book as it is drawn: how many strokes it is made of, and how many were added to be drawn over its lines. */
const BOOK = `(() => { const book = ${READER}.querySelector('[data-prop="book"]'); return { strokes: book.querySelectorAll("path").length, drawnOver: book.querySelectorAll('[data-part="read"]').length }; })()`;

type Where = Readonly<{ x: number; y: number }>;

async function landing(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("data-moves", "");
  await expect(page.locator(STORY)).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
}

/** The reader alone: its own box, at the density the page was opened at. */
async function closeUp(page: Page, size: string, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.locator(`${STORY} [data-reads]`).screenshot({ path: join(SHOTS, `${name}-${size}.png`) });
}

test.describe("the one who reads its book, and the icon after dark", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`it reads by itself, calmly: the eyes go down, drift along three lines and come up, and the book is not touched (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      // The close-ups are enlarged three times: the page is opened at three times the density when they are taken.
      const context = SHOTS ? await browser.newContext({ baseURL: device.baseURL, viewport: size.viewport, deviceScaleFactor: 3, serviceWorkers: "block" }) : device.context;
      if (SHOTS) await device.context.close();
      const page = SHOTS ? await context.newPage() : device.page;
      await landing(page);
      // The book before anything reads it: the strokes it is drawn with.
      const drawn = (await page.evaluate(BOOK)) as { strokes: number; drawnOver: number };
      expect(drawn).toEqual({ strokes: 7, drawnOver: 0 });
      await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
      // In front of somebody: the turn is running, the eyes and the mouth and nothing else, and the book is as it was.
      await expect.poll(() => page.evaluate(READING_RUNS)).toBe(true);
      expect(await page.evaluate(BOOK)).toEqual(drawn);

      // Within the longest gap between two blinks, and a little: it blinks, with the drawings in view and no other.
      const blink = (await page.evaluate(
        `new Promise((done) => { const from = performance.now(); const tick = () => { const moving = [...${READER}.querySelectorAll('[data-part="lid"]')].flatMap((lid) => lid.getAnimations()); if (moving.length) { const hero = document.querySelector(".hero-stage"); done({ hero: ${HERO_LIDS}.flatMap((lid) => lid.getAnimations()).length, heroSeen: hero ? hero.getBoundingClientRect().bottom > 0 : false }); } else if (performance.now() - from > 12000) done(null); else requestAnimationFrame(tick); }; tick(); })`,
      )) as { hero: number; heroSeen: boolean } | null;
      expect(blink, "it blinked within twelve seconds").not.toBeNull();
      expect(blink!.hero > 0, "the hero blinks with it only when it can be seen").toBe(blink!.heroSeen);

      const at = async (ms: number) => {
        await setReadingAt(page, ms);
        return { eyes: (await page.evaluate(MOVED("gaze"))) as Where, mouth: (await page.evaluate(MOVED("mouth"))) as Where };
      };
      const near = (got: number, wanted: number, what: string) => expect(Math.abs(got - wanted), `${what}: ${got} for ${wanted}`).toBeLessThanOrEqual(0.03);
      // The ends of each stretch, to the hundredth: down to the first line, along it, back and a little lower, twice
      // more, then up. The mouth is a quarter of the eyes' way, wherever they are.
      const ends: ReadonlyArray<readonly [number, number, number]> = [[600, -1, 1.1], [2_500, 1, 1.1], [3_100, -1, 1.35], [5_000, 1, 1.35], [5_600, -1, 1.6], [7_500, 1, 1.6], [8_200, 0, 0], [10_000, 0, 0]];
      for (const [ms, x, y] of ends) {
        const { eyes, mouth } = await at(ms);
        near(eyes.x, x, `eyes across at ${ms} ms`);
        near(eyes.y, y, `eyes down at ${ms} ms`);
        near(mouth.x, x * 0.25, `mouth across at ${ms} ms`);
        near(mouth.y, y * 0.25, `mouth down at ${ms} ms`);
      }
      // Calm, measured over the whole turn, a tenth of a second at a time: the eyes never go further than one unit to
      // either side nor lower than the last line, and never travel more than 0.7 units in a tenth of a second (the
      // first turn went 3.6 units to a side, and crossed three units in 150 ms).
      let before: Where | null = null;
      let fastest = 0;
      let widest = 0;
      let lowest = 0;
      for (let ms = 0; ms <= 10_800; ms += 100) {
        const { eyes } = await at(ms);
        widest = Math.max(widest, Math.abs(eyes.x));
        lowest = Math.max(lowest, eyes.y);
        if (before) fastest = Math.max(fastest, Math.hypot(eyes.x - before.x, eyes.y - before.y));
        before = eyes;
      }
      expect(widest, "no further than one unit to either side").toBeLessThanOrEqual(1.03);
      expect(lowest, "no lower than the last line").toBeLessThanOrEqual(1.63);
      expect(fastest, `the most the eyes travel in a tenth of a second: ${fastest.toFixed(2)}`).toBeLessThanOrEqual(0.7);
      // The book is still as it was drawn, wherever the turn is.
      expect(await page.evaluate(BOOK)).toEqual(drawn);
      // Four instants of it, for whoever judges on the image.
      for (const [name, ms] of [["1-down-on-the-first-line", 600], ["2-along-the-second-line", 4_050], ["3-the-end-of-the-third-line", 7_500], ["4-it-looks-up-at-you", 9_500]] as const) {
        await at(ms);
        await closeUp(page, size.name, `reader-${name}`);
      }
      await shot(page, size.name, "reader-in-its-page");

      // Only in front of somebody: off the screen no animation of the turn is left on the page, so a page that waits
      // for every movement to end finds none; it starts again once the drawing is back.
      await page.evaluate(`(window.__turn || []).forEach((one) => one.play())`);
      await expect.poll(() => page.evaluate(READING_RUNS)).toBe(true);
      await page.evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
      await expect.poll(() => page.evaluate(`${TURN}.length`)).toBe(0);
      await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
      await expect.poll(() => page.evaluate(READING_RUNS)).toBe(true);
      await context.close();
    });

    test(`after dark the icon is drawn in the page's colours for the hour, as the reader is (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(60_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      const { page } = device;
      await page.emulateMedia({ colorScheme: "dark" });
      await landing(page);
      await page.evaluate(`${ICON}.scrollIntoView({ block: "center", behavior: "instant" })`);
      await expect.poll(() => page.evaluate(`${ICON}.getAnimations().length`), { timeout: 20_000 }).toBe(0);
      // Each colour it is drawn in is the page's own after dark, the one the reader is drawn in: none is fixed on it.
      const named = ["--character-hero-from", "--character-hero-to", "--character-halftone", "--character-gloss", "--character-face"];
      const colours = (await page.evaluate(`[${ICON}, document.documentElement, ${READER}].map((one) => ${JSON.stringify(named)}.map((name) => getComputedStyle(one).getPropertyValue(name).trim()))`)) as string[][];
      expect(colours[0].every((colour) => colour !== ""), "each is set").toBe(true);
      expect(colours[0], "the icon's are the page's").toEqual(colours[1]);
      expect(colours[0], "and the reader's").toEqual(colours[2]);
      await shot(page, size.name, "icon-5-after-dark");
      await device.context.close();
    });
  }

  test("with less motion asked for, nothing reads and the book is as it is drawn", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 }, { passkey: false });
    const { page } = device;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
    await page.waitForTimeout(600);
    expect(await page.evaluate(`${READER}.getAnimations({ subtree: true }).length`)).toBe(0);
    expect(await page.evaluate(BOOK)).toEqual({ strokes: 7, drawnOver: 0 });
    expect(await page.evaluate(MOVED("gaze"))).toEqual({ x: 0, y: 0 });
    await device.context.close();
  });
});
