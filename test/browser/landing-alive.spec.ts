import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { profile, shot as capture, sizesFor } from "./gift-kit";

/**
 * What lives on the landing outside the posters' own movement (the founder, 10 Oct 2026, on an animated mockup, and
 * one thing in his own words).
 *
 * The app's icon arrives once, when its card enters the screen: under the screen it waits at its starting state, it
 * lands, its face settles, it blinks, it glances at its button wherever the button stands, and it never arrives a
 * second time. The one who reads its book blinks now and then, by the rule every drawing blinks by, and a drawing off
 * the screen does not. And its eyes go along the lines of its book as the page is scrolled. With less motion asked
 * for, the icon is simply there and nothing reads.
 *
 * Every animation the icon's page starts is slowed, so the test has the time to look, and each instant of the mockup is
 * set: every animation of the arrival paused and put at that time, as the mockup takes its own stills.
 *
 * VIKY_LANDING_ALIVE_CAPTURES=<folder> also photographs those instants at 390 by 844 and at 1440 by 900, and measures
 * what the arrival costs a processor slowed four times, at a phone's size and density, into a file beside them.
 */
const SHOTS = process.env.VIKY_LANDING_ALIVE_CAPTURES;
const SIZES = sizesFor(SHOTS);
const shot = (page: Page, size: string, name: string) => capture(SHOTS, page, size, name);
const SLOW = 8;
const SLOWED = `(() => { const animate = Element.prototype.animate; Element.prototype.animate = function (...given) { const made = animate.apply(this, given); made.playbackRate = ${1 / SLOW}; return made; }; })()`;

const STORY = "[data-landing-story]";
const ICON = `document.querySelector('${STORY} svg[data-character="icon"]')`;
const READER = `document.querySelector('${STORY} [data-blinks]')`;
const HERO_LIDS = `[...document.querySelectorAll('.hero-stage [data-part="lid"]')]`;
/**
 * Puts the icon's arrival at one instant, as the founder's mockup takes its stills: every animation of the icon, the
 * ones inside it too, paused and set to that time. They are started together and each counts its own wait, so one
 * time is one image of the arrival, whatever the browser's own pace. Says how many animations it set.
 *
 * The animations are taken in hand the first time and kept: one that has run to its end is no longer among those the
 * browser lists for the drawing, and a still asked for after it would silently set nothing of it.
 */
const setIconAt = (page: Page, ms: number) =>
  page.evaluate(`(() => { window.__iconArrival = window.__iconArrival || ${ICON}.getAnimations({ subtree: true }); window.__iconArrival.forEach((one) => { one.pause(); one.currentTime = ${ms}; }); return window.__iconArrival.length; })()`) as Promise<number>;
/** Lets the arrival go on from the instant it was put at. */
const letTheIconGo = (page: Page) => page.evaluate(`(window.__iconArrival || []).forEach((one) => one.play())`);
/** How tall a lid of the icon is drawn, of what it is when open, with the arrival put at an instant. */
const lidAt = async (page: Page, ms: number) => {
  await setIconAt(page, ms);
  return figuresOf((await page.evaluate(`getComputedStyle(${ICON}.querySelector('[data-part="lid"]')).transform`)) as string)[3];
};
/** Lets every animation that was paused go on from where it is. */
const letGo = (page: Page) => page.evaluate(`document.getAnimations().forEach((one) => { if (one.playState === "paused") one.play(); })`);
/** Where a part of a drawing has been moved to, in the drawing's own units, however it was moved. */
const MOVED = (part: string) =>
  `(() => { const one = ${part}; const said = one.getAttribute("transform") || ""; const matrix = /matrix\\(([^)]+)\\)/.exec(said); if (matrix) { const n = matrix[1].split(/[ ,]+/).map(Number); return { x: n[4], y: n[5] }; } const moved = /translate\\(([^)]+)\\)/.exec(said); if (moved) { const n = moved[1].split(/[ ,]+/).map(Number); return { x: n[0] || 0, y: n[1] || 0 }; } const style = getComputedStyle(one).transform; if (!style || style === "none") return { x: 0, y: 0 }; const m = new DOMMatrix(style); return { x: m.e, y: m.f }; })()`;

/** The six figures of a transform as the browser says it ("matrix(a, b, c, d, e, f)"), or those of no transform. */
const figuresOf = (said: string) => (said.startsWith("matrix(") ? said.slice(7, -1).split(",").map(Number) : [1, 0, 0, 1, 0, 0]);

async function landing(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("data-moves", "");
  await expect(page.locator(STORY)).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
}

test.describe("the landing's drawings, outside the posters' own movement", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each test opens its own windows");

  for (const size of SIZES) {
    test(`the icon arrives once as its card enters the screen: it lands, blinks, glances at its button (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      const { page } = device;
      await page.addInitScript(SLOWED);
      await landing(page);
      const icon = page.locator(`${STORY} svg[data-character="icon"]`);
      // Under the screen when the page is drawn: it waits there at its starting state, out of sight.
      await expect(icon).toHaveAttribute("data-arrives", "");
      expect(await page.evaluate(`getComputedStyle(${ICON}).opacity`)).toBe("0");

      // Its card enters the screen.
      await page.evaluate(`${ICON}.scrollIntoView({ block: "center", behavior: "instant" })`);
      await expect(icon).not.toHaveAttribute("data-arrives", /.*/);
      // It lands: smaller than it is, on its way in.
      // Its size, its opacity, its eyes, its mouth and its two lids at least: all of the arrival is in hand from here.
      expect(await setIconAt(page, 40), "the arrival is under way").toBeGreaterThanOrEqual(6);
      expect(figuresOf((await page.evaluate(`getComputedStyle(${ICON}).transform`)) as string)[0], "its width, of what it will be").toBeLessThan(1);
      await shot(page, size.name, "icon-1-it-lands");
      await letTheIconGo(page);
      // It blinks, once, 480 ms in, for 150 ms: open before, open after, and closed in between. Where it is most
      // closed is measured, not supposed, and the picture is taken there.
      expect(await lidAt(page, 470), "open before its blink").toBeCloseTo(1, 2);
      let closed = { at: 480, tall: 1 };
      for (let at = 480; at <= 630; at += 5) {
        const tall = await lidAt(page, at);
        if (tall < closed.tall) closed = { at, tall };
      }
      expect(closed.tall, `a lid's height at its lowest, ${closed.at} ms in`).toBeLessThan(0.2);
      expect(await lidAt(page, 629), "open again as its blink ends").toBeGreaterThan(0.9);
      await setIconAt(page, closed.at);
      expect(await page.evaluate(`getComputedStyle(${ICON}).opacity`)).toBe("1");
      await shot(page, size.name, "icon-2-it-blinks");
      await letTheIconGo(page);
      // It glances at its button, wherever the button stands: below it on a phone, beside it on a computer.
      const towards = (await page.evaluate(
        `(() => { const icon = ${ICON}; const button = icon.parentElement.querySelector("button, a"); if (!button) return null; const a = icon.getBoundingClientRect(); const b = button.getBoundingClientRect(); return { dx: b.left + b.width / 2 - (a.left + a.width / 2), dy: b.top + b.height / 2 - (a.top + a.height / 2) }; })()`,
      )) as { dx: number; dy: number } | null;
      if (towards) {
        await setIconAt(page, 1_160);
        const eyes = (await page.evaluate(MOVED(`${ICON}.querySelector('[data-part="gaze"]')`))) as { x: number; y: number };
        expect(Math.hypot(eyes.x, eyes.y)).toBeCloseTo(1.1, 1);
        expect(eyes.x * towards.dx + eyes.y * towards.dy, "towards the button").toBeGreaterThan(0);
        // Below on a phone, beside on a computer: the larger part of the glance says which.
        if (size.name === "390") expect(Math.abs(eyes.y)).toBeGreaterThan(Math.abs(eyes.x));
        else expect(Math.abs(eyes.x)).toBeGreaterThan(Math.abs(eyes.y));
        await shot(page, size.name, "icon-3-it-glances-at-its-button");
        await letTheIconGo(page);
      }
      // At rest: whole, where it is, with nothing left on it but a lid now and then.
      await expect.poll(() => page.evaluate(`${ICON}.getAnimations().length`), { timeout: 30_000 }).toBe(0);
      expect(await page.evaluate(`getComputedStyle(${ICON}).opacity`)).toBe("1");
      expect(await page.evaluate(`getComputedStyle(${ICON}).transform`)).toBe("none");
      await shot(page, size.name, "icon-4-at-rest");
      // Once: gone from the screen and back, it does not arrive again.
      await page.evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
      await page.waitForTimeout(400);
      await page.evaluate(`${ICON}.scrollIntoView({ block: "center", behavior: "instant" })`);
      await page.waitForTimeout(600);
      expect(await page.evaluate(`${ICON}.getAnimations().length`), "no second arrival").toBe(0);
      await expect(icon).not.toHaveAttribute("data-arrives", /.*/);
      await device.context.close();
    });

    test(`the one who reads its book blinks now and then, and reads as the page is scrolled (${size.name})`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const device = await profile(browser, baseURL, size.viewport, { passkey: false });
      const { page } = device;
      await landing(page);
      await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
      expect((await page.evaluate(`${READER}.querySelectorAll('[data-part="lid"]').length`)) as number).toBe(2);
      // Within the longest gap between two blinks, and a little: it blinks. Held where its lids are closed.
      const blink = (await page.evaluate(
        `new Promise((done) => { const from = performance.now(); const tick = () => { const moving = [...${READER}.querySelectorAll('[data-part="lid"]')].flatMap((lid) => lid.getAnimations()); if (moving.length) { const others = ${HERO_LIDS}.flatMap((lid) => lid.getAnimations()).length; const hero = document.querySelector(".hero-stage"); const heroSeen = hero ? hero.getBoundingClientRect().bottom > 0 : false; moving.forEach((one) => { one.pause(); one.currentTime = 30; }); done({ after: performance.now() - from, hero: others, heroSeen }); } else if (performance.now() - from > 12000) done(null); else requestAnimationFrame(tick); }; tick(); })`,
      )) as { after: number; hero: number; heroSeen: boolean } | null;
      expect(blink, "it blinked within twelve seconds").not.toBeNull();
      // The drawings in view blink together, and one that is off the screen does not blink at all.
      expect(blink!.hero > 0, "the hero blinks with it only when it can be seen").toBe(blink!.heroSeen);
      await shot(page, size.name, "reader-1-it-blinks");
      await letGo(page);

      // It reads: its two eyes go along a line, and each line is a little lower than the one before.
      const title = `${READER}`;
      const seen: Array<{ x: number; y: number }> = [];
      for (const at of [0.95, 0.8, 0.65, 0.5, 0.35, 0.2, 0.05]) {
        await page.evaluate(`window.scrollBy({ top: ${title}.getBoundingClientRect().top - window.innerHeight * ${at}, behavior: "instant" })`);
        await page.waitForTimeout(900);
        seen.push((await page.evaluate(MOVED(`${READER}.querySelector('[data-part="gaze"]')`))) as { x: number; y: number });
        if (at === 0.65) await shot(page, size.name, "reader-2-it-reads-a-line");
        if (at === 0.2) await shot(page, size.name, "reader-3-it-reads-a-line-further-down");
      }
      expect(new Set(seen.map((eyes) => eyes.x.toFixed(2))).size, "its eyes move along the lines").toBeGreaterThan(2);
      for (const eyes of seen) expect(Math.abs(eyes.x)).toBeLessThanOrEqual(0.91);
      for (let at = 1; at < seen.length; at += 1) expect(seen[at].y, "never back up a line as the page goes down").toBeGreaterThanOrEqual(seen[at - 1].y - 0.001);
      expect(seen[seen.length - 1].y).toBeGreaterThan(seen[0].y);
      await device.context.close();
    });
  }

  test("with less motion asked for, the icon is simply there and nothing reads", async ({ browser, baseURL }) => {
    const device = await profile(browser, baseURL, { width: 390, height: 844 }, { passkey: false });
    const { page } = device;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    const icon = page.locator(`${STORY} svg[data-character="icon"]`);
    await expect(icon).toHaveCount(1);
    await expect(icon).not.toHaveAttribute("data-arrives", /.*/);
    expect(await page.evaluate(`getComputedStyle(${ICON}).opacity`)).toBe("1");
    await page.evaluate(`${ICON}.scrollIntoView({ block: "center", behavior: "instant" })`);
    await page.waitForTimeout(500);
    expect(await page.evaluate(`${ICON}.getAnimations({ subtree: true }).length`)).toBe(0);
    await page.evaluate(`${READER}.scrollIntoView({ block: "center", behavior: "instant" })`);
    await page.waitForTimeout(500);
    expect(await page.evaluate(MOVED(`${READER}.querySelector('[data-part="gaze"]')`))).toEqual({ x: 0, y: 0 });
    await device.context.close();
  });

  test("what the icon's arrival costs a slowed processor, at a phone's size and density", async ({ browser, baseURL }) => {
    test.skip(!SHOTS, "measured when the captures are taken");
    test.setTimeout(120_000);
    const device = await profile(browser, baseURL, { width: 390, height: 844 }, { passkey: false });
    const context = await browser.newContext({ baseURL: device.baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, serviceWorkers: "block" });
    await device.context.close();
    const page = await context.newPage();
    const slowed = await context.newCDPSession(page);
    await landing(page);
    await slowed.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // The time between two images, read on every image, for as long as asked.
    const frames = (ms: number) =>
      page.evaluate(
        `new Promise((done) => { const between = []; let last = performance.now(); const from = last; const tick = (now) => { between.push(now - last); last = now; if (now - from < ${ms}) requestAnimationFrame(tick); else done(between.slice(1)); }; requestAnimationFrame(tick); })`,
      ) as Promise<number[]>;
    const said = (between: number[]) => {
      const sorted = [...between].sort((a, b) => a - b);
      const round = (value: number) => Math.round(value * 10) / 10;
      return { images: between.length, meanMs: round(between.reduce((sum, one) => sum + one, 0) / between.length), p95Ms: round(sorted[Math.floor(sorted.length * 0.95)]), worstMs: round(sorted[sorted.length - 1]), over25Ms: between.filter((one) => one > 25).length };
    };
    // Its card enters the screen, and the arrival plays for 1.8 s; then the same time with the icon at rest.
    await page.evaluate(`${ICON}.scrollIntoView({ block: "center", behavior: "instant" })`);
    const arriving = said(await frames(1_900));
    await expect.poll(() => page.evaluate(`${ICON}.getAnimations().length`), { timeout: 15_000 }).toBe(0);
    const atRest = said(await frames(1_900));
    mkdirSync(SHOTS!, { recursive: true });
    writeFileSync(join(SHOTS!, "the-icon-arrival-cost.json"), `${JSON.stringify({ what: "time between two images, headless Chromium, 390 by 844 at density 3, processor slowed four times: an emulation, not a phone", arriving, atRest }, null, 2)}\n`);
    await context.close();
  });
});
