import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * The one who reads its book on the landing, and the app's icon after dark (the founder, 10 Oct 2026, on an animated
 * mockup and its board of six images).
 *
 * The reader reads by itself while it is on the screen: its eyes go down to the book, along the three lines of the
 * left page, the third shorter, across to the right page and along its two, then up to whoever reads the landing. The
 * mouth follows a third of the way. Each line of the book darkens along its length as the eyes pass over it, and the
 * five are back to their grey before the eyes go down again. It blinks now and then with the drawings in view. Off the
 * screen nothing of the turn is left on the page; with less motion asked for, nothing reads and no line is drawn over.
 *
 * The turn is put at its instants as the mockup takes its stills: every animation of it paused and set to one time.
 *
 * And after dark the icon is drawn in the page's own colours for the hour, as the reader is.
 *
 * VIKY_LANDING_ALIVE_CAPTURES=<folder> also photographs the six images of the board, the reader alone at three times
 * the density, and the icon after dark, at 390 by 844 and at 1440 by 900.
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
/** Whether the turn is running: the eyes, the mouth and the five lines, every one of them. */
const READING_RUNS = `(() => { const turn = ${TURN}; return turn.length === 7 && turn.every((one) => one.playState === "running"); })()`;
/** Puts the turn at one instant: every animation of it, kept in hand once taken, paused and set there. */
const setReadingAt = (page: Page, ms: number) => page.evaluate(`(window.__turn = window.__turn || ${TURN}).forEach((one) => { one.pause(); one.currentTime = ${ms}; })`);
/** Where a part of the drawing has been moved to, in the drawing's own units. */
const MOVED = (part: string) => `(() => { const style = getComputedStyle(${READER}.querySelector('[data-part="${part}"]')).transform; if (!style || style === "none") return { x: 0, y: 0 }; const m = new DOMMatrix(style); return { x: m.e, y: m.f }; })()`;
/** For each line of the book, how much of it is still to darken (1: all of it, 0: none), and how much it shows. */
const LINES = `[...${READER}.querySelectorAll('[data-part="read"]')].map((mark) => ({ left: Math.round(parseFloat(getComputedStyle(mark).strokeDashoffset) * 100) / 100, shown: Number(getComputedStyle(mark).opacity) }))`;

type Where = Readonly<{ x: number; y: number }>;
type Line = Readonly<{ left: number; shown: number }>;

async function landing(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("data-moves", "");
  await expect(page.locator(STORY)).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
}

/** The reader alone, as the board shows it: its own box, at the density the page was opened at. */
async function closeUp(page: Page, size: string, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.locator(`${STORY} [data-reads]`).screenshot({ path: join(SHOTS, `${name}-${size}.png`) });
}

test.describe("the one who reads its book, and the icon after dark", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`it reads by itself, line by line, each line darkening as its eyes pass, then it looks up (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      // The board's close-ups are enlarged three times: the page is opened at three times the density when they are taken.
      const context = SHOTS ? await browser.newContext({ baseURL: device.baseURL, viewport: size.viewport, deviceScaleFactor: 3, serviceWorkers: "block" }) : device.context;
      if (SHOTS) await device.context.close();
      const page = SHOTS ? await context.newPage() : device.page;
      await landing(page);
      await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
      // In front of somebody: the turn is running, and the book's five lines are drawn over, to be darkened.
      await expect.poll(() => page.evaluate(READING_RUNS)).toBe(true);
      expect(await page.evaluate(`${READER}.querySelectorAll('[data-prop="book"] [data-part="read"]').length`)).toBe(5);

      // Within the longest gap between two blinks, and a little: it blinks, with the drawings in view and no other.
      const blink = (await page.evaluate(
        `new Promise((done) => { const from = performance.now(); const tick = () => { const moving = [...${READER}.querySelectorAll('[data-part="lid"]')].flatMap((lid) => lid.getAnimations()); if (moving.length) { const hero = document.querySelector(".hero-stage"); done({ hero: ${HERO_LIDS}.flatMap((lid) => lid.getAnimations()).length, heroSeen: hero ? hero.getBoundingClientRect().bottom > 0 : false }); } else if (performance.now() - from > 12000) done(null); else requestAnimationFrame(tick); }; tick(); })`,
      )) as { hero: number; heroSeen: boolean } | null;
      expect(blink, "it blinked within twelve seconds").not.toBeNull();
      expect(blink!.hero > 0, "the hero blinks with it only when it can be seen").toBe(blink!.heroSeen);

      const at = async (ms: number) => {
        await setReadingAt(page, ms);
        return { eyes: (await page.evaluate(MOVED("gaze"))) as Where, mouth: (await page.evaluate(MOVED("mouth"))) as Where, lines: (await page.evaluate(LINES)) as Line[] };
      };
      const near = (got: number, wanted: number, what: string) => expect(Math.abs(got - wanted), `${what}: ${got} for ${wanted}`).toBeLessThanOrEqual(0.03);
      // The ends of each stretch, to the hundredth: down to the book, the left page and its short third line, across,
      // the right page, and up. The mouth is a third of the eyes' way, wherever they are.
      const ends: ReadonlyArray<readonly [number, number, number]> = [[260, -3.6, 1.5], [1_140, -0.6, 1.5], [1_290, -3.6, 1.95], [2_170, -0.6, 1.95], [2_320, -3.6, 2.4], [3_076.8, -1.14, 2.4], [3_276.8, 0.6, 1.5], [4_156.8, 3.6, 1.5], [4_306.8, 0.6, 1.95], [5_186.8, 3.6, 1.95], [5_506.8, 0, 0]];
      for (const [ms, x, y] of ends) {
        const { eyes, mouth } = await at(ms);
        near(eyes.x, x, `eyes across at ${ms} ms`);
        near(eyes.y, y, `eyes down at ${ms} ms`);
        near(mouth.x, x * 0.35, `mouth across at ${ms} ms`);
        near(mouth.y, y * 0.35, `mouth down at ${ms} ms`);
      }
      // The six images of the board. A line being read is partly dark; those before it wholly; those after it not at all.
      const board: ReadonlyArray<readonly [string, number, number]> = [["1-left-page-line-1", 700, 0], ["2-left-page-line-2", 1_730, 1], ["3-left-page-line-3", 2_700, 2], ["4-right-page-line-1", 3_716, 3], ["5-right-page-line-2", 4_746, 4]];
      for (const [name, ms, reading] of board) {
        const { lines } = await at(ms);
        lines.forEach((line, index) => {
          if (index < reading) expect(line.left, `${name}: line ${index + 1} is read`).toBe(0);
          else if (index > reading) expect(line.left, `${name}: line ${index + 1} is not read yet`).toBe(1);
          else {
            expect(line.left, `${name}: its own line is being read`).toBeGreaterThan(0);
            expect(line.left).toBeLessThan(1);
          }
          expect(line.shown).toBe(1);
        });
        await closeUp(page, size.name, `reader-${name}`);
      }
      // It looks up at you: the eyes back where they rest, the five lines dark.
      const up = await at(5_700);
      near(up.eyes.x, 0, "eyes up");
      near(up.eyes.y, 0, "eyes up");
      expect(up.lines.map((line) => line.left)).toEqual([0, 0, 0, 0, 0]);
      expect(Math.min(...up.lines.map((line) => line.shown))).toBe(1);
      await closeUp(page, size.name, "reader-6-it-looks-up-at-you");
      await shot(page, size.name, "reader-in-its-page");
      // And before the eyes go down again, the five are back to their grey.
      expect(Math.max(...(await at(7_200)).lines.map((line) => line.shown))).toBeLessThan(0.1);

      // Only in front of somebody: off the screen nothing of the turn is left on the page, no animation and no dark
      // line, so a page that waits for every movement to end finds none; it starts again once the drawing is back.
      await page.evaluate(`(window.__turn || []).forEach((one) => one.play())`);
      await expect.poll(() => page.evaluate(READING_RUNS)).toBe(true);
      await page.evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
      await expect.poll(() => page.evaluate(`${TURN}.length + ${READER}.querySelectorAll('[data-part="read"]').length`)).toBe(0);
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

  test("with less motion asked for, nothing reads and no line of the book is drawn over", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 }, { passkey: false });
    const { page } = device;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
    await page.waitForTimeout(600);
    expect(await page.evaluate(`${READER}.getAnimations({ subtree: true }).length`)).toBe(0);
    expect(await page.evaluate(`${READER}.querySelectorAll('[data-part="read"]').length`)).toBe(0);
    expect(await page.evaluate(MOVED("gaze"))).toEqual({ x: 0, y: 0 });
    await device.context.close();
  });
});
