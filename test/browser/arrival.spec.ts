import { expect, test, type Page } from "@playwright/test";

/**
 * The arrival on a screen (D146, the motion roadmap of 21 Sep 2026, step 1): what a page carries enters once, rising
 * 8 pixels in 250 ms on Material's standard curve. The mark and the appearance control stand still, because they are
 * in the same place on every screen. Under reduced motion the page still arrives, by fading alone.
 *
 * Every screen reached from another enters the same way; the first screen a document draws is drawn whole and still
 * (D198): on a reload it replaces itself on the glass, and an entrance was that screen going out and coming back. The
 * turns are 80 ms apart and stop at 240, so four blocks have arrived inside the half second (D171).
 *
 * Every movement is written down as it starts rather than caught in the act: reading `document.getAnimations()` after
 * a page change is a race against a quarter of a second, and it is the race that fails, not the product.
 */

type Played = Readonly<{ name: string; ms: number; easing: string; rise: number; inTheMark: boolean }>;

const writeEachOneDown = (page: Page) =>
  page.addInitScript(() => {
    const played: unknown[] = [];
    (window as unknown as { played: unknown[] }).played = played;
    document.addEventListener(
      "animationstart",
      (event) => {
        // The day row's fades and the landing's side characters follow the scroll, not the clock: not an arrival.
        if (/^(row-fade-|side-drift)/.test((event as AnimationEvent).animationName)) return;
        const target = event.target as HTMLElement;
        const style = getComputedStyle(target);
        played.push({
          name: (event as AnimationEvent).animationName,
          ms: Math.round(Number.parseFloat(style.animationDuration) * 1000),
          easing: style.animationTimingFunction,
          rise: Math.round(Number(/matrix\([^)]*,\s*([-\d.]+)\)$/.exec(style.transform)?.[1] ?? 0)),
          inTheMark: Boolean(target.closest(".page-mark")),
        });
      },
      true,
    );
  });

const played = (page: Page) => page.evaluate(() => (window as unknown as { played: Played[] }).played);
const forgetThem = (page: Page) => page.evaluate(() => ((window as unknown as { played: Played[] }).played.length = 0));
// Only what plays on the clock: the day row's fades follow its scroll (app/globals.css) and stay attached for as long as
// the row is on the page, which is not a movement.
const stillPlaying = (page: Page) => page.evaluate(() => document.getAnimations().filter((one) => one.timeline === document.timeline).length);

/**
 * What entered, once something has. A page change is a URL and then, a moment later, a screen: reading the record the
 * instant the address changes reads it before the screen it is about was built.
 */
async function whatEntered(page: Page): Promise<Played[]> {
  await expect.poll(async () => (await played(page)).length, { timeout: 4000 }).toBeGreaterThan(0);
  return played(page);
}

test.describe("the arrival on a screen", () => {
  test.beforeEach(async ({ page }) => {
    await writeEachOneDown(page);
  });

  test("the first screen a document draws is whole and still, on a load and on a reload; the next one enters, 80 ms apart and no later than 240", async ({ page }) => {
    // D198: on a reload the previous screen stays on the glass until the new one is painted, so a first screen that
    // entered was the same screen going out and coming back. Nothing plays.
    for (const how of ["load", "reload"] as const) {
      if (how === "load") await page.goto("/me", { waitUntil: "load" });
      else await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(600);
      expect(await played(page), `${how}: nothing enters`).toEqual([]);
      expect(await page.locator("main").first().getAttribute("class")).not.toContain("page-enters");
    }
    // Reached from that screen, the next one enters, and the turns are the stylesheet's own arithmetic (D171).
    await page.locator("main header .page-mark a").first().click();
    await expect(page).toHaveURL(/\/$/);
    const arriving = await whatEntered(page);
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    const entering = await played(page);
    expect(entering.length).toBeGreaterThan(1);
    for (const one of entering) expect(one.name).toBe("page-enter");
    expect(await page.locator("main").first().getAttribute("class")).toContain("page-enters");
    const delays = await page.evaluate(() =>
      [...document.querySelectorAll("main.page-enters > *:not(header, dialog), main.page-enters > header > *:not(.page-mark)")].map((element) => Math.round(Number.parseFloat(getComputedStyle(element).animationDelay) * 1000)),
    );
    expect(delays.length).toBeGreaterThan(1);
    for (const delay of delays) expect([0, 80, 160, 240]).toContain(delay);
    expect(Math.max(...delays)).toBeLessThanOrEqual(240);
    // And it stays arrived: nothing plays a second time once the screen has settled and the browser has caught up.
    await page.waitForTimeout(500);
    expect((await played(page)).length).toBe(arriving.length > entering.length ? arriving.length : entering.length);
  });

  test("what the page carries enters, rising, once, and the mark does not move", async ({ page }) => {
    // An app screen rather than a page of the footer: what matters is the way through the product itself (the
    // founder, 21 Sep 2026). Measured the same on the landing, the gifts, a gift and the way out.
    await page.goto("/");
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    await forgetThem(page);
    await page.getByRole("link", { name: /What Viky can check/i }).first().click();
    await expect(page).toHaveURL(/what-viky-can-check/);
    await whatEntered(page);
    // Every block, not only the first few: the turns run to 240 ms, so what entered is read once they are done.
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    const entering = await played(page);
    expect(entering.length).toBeGreaterThan(1);
    for (const one of entering) {
      expect(one.name).toBe("page-enter");
      expect(one.ms).toBe(250);
      expect(one.easing).toBe("cubic-bezier(0.2, 0, 0, 1)");
      // It starts 8 pixels below where it belongs, and is already on its way up when it says it has started: the
      // rise is read one frame in, so what is asserted is that it is rising, from no further than the token's 8.
      expect(one.rise).toBeGreaterThan(0);
      expect(one.rise).toBeLessThanOrEqual(8);
      expect(one.inTheMark).toBe(false);
    }
    // It plays once and leaves nothing behind it: the page is where it belongs, and nothing enters a second time.
    const mark = page.locator("main.page-enters .page-mark a").first();
    expect(await mark.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
    await page.waitForTimeout(500);
    expect((await played(page)).length).toBe(entering.length);
  });

  test("a page change enters again, and so does the way back", async ({ page }) => {
    // Pressed rather than typed, and between two screens of the app: the mark is on every one of them and goes home.
    await page.goto("/me");
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    await forgetThem(page);
    await page.locator("main header .page-mark a").first().click();
    await expect(page).toHaveURL(/\/$/);
    const entering = await whatEntered(page);
    expect(entering.every((one) => one.name === "page-enter" && one.ms === 250)).toBe(true);
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    await forgetThem(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/me$/);
    expect((await whatEntered(page)).every((one) => one.name === "page-enter")).toBe(true);
  });

  /** A block drawn once its data has landed enters where it lands, on a screen reached from another screen. */
  test("a block that arrives after the page has arrived enters too", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    await page.getByRole("link", { name: /What Viky can check/i }).first().click();
    await expect(page).toHaveURL(/what-viky-can-check/);
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    const arriving = await page.evaluate(
      () =>
        new Promise<string>((done) => {
          const main = document.querySelector("main.page-enters");
          const block = document.createElement("section");
          main?.append(block);
          requestAnimationFrame(() => done(`${getComputedStyle(block).animationName} ${getComputedStyle(block).animationDuration}`));
        }),
    );
    expect(arriving).toBe("page-enter 0.25s");
  });

  test.describe("with the device asking for less movement", () => {
    test.use({ reducedMotion: "reduce" });

    test("the page still arrives, by fading, and nothing travels", async ({ page }) => {
      await page.goto("/");
      await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
      await forgetThem(page);
      await page.getByRole("link", { name: /What Viky can check/i }).first().click();
      await expect(page).toHaveURL(/what-viky-can-check/);
      const entering = await whatEntered(page);
      for (const one of entering) {
        expect(one.name).toBe("page-fade");
        expect(one.ms).toBe(250);
        // Nothing travels: the fade carries no movement at all, where the full arrival starts 8 pixels down.
        expect(one.rise).toBe(0);
      }
      await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    });
  });
});
