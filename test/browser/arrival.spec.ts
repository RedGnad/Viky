import { expect, test, type Page } from "@playwright/test";

/**
 * The arrival on a screen (D146, the motion roadmap of 21 Sep 2026, step 1): what a page carries enters once, rising
 * 8 pixels in 250 ms on Material's standard curve. The mark and the appearance control stand still, because they are
 * in the same place on every screen. Under reduced motion the page still arrives, by fading alone.
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
const stillPlaying = (page: Page) => page.evaluate(() => document.getAnimations().length);

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

  test("what the page carries enters, rising, once, and the mark does not move", async ({ page }) => {
    // An app screen rather than a page of the footer: what matters is the way through the product itself (the
    // founder, 21 Sep 2026). Measured the same on the landing, the gifts, a gift and the way out.
    await page.goto("/me");
    const entering = await whatEntered(page);
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
    // It plays once and leaves nothing behind it: the page is where it belongs a quarter of a second later.
    await expect.poll(() => stillPlaying(page), { timeout: 4000 }).toBe(0);
    const mark = page.locator("main.page-enters > header .page-mark a").first();
    expect(await mark.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
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

  /** A block drawn once its data has landed enters where it lands, which is what a gift's page does with its card. */
  test("a block that arrives after the page has arrived enters too", async ({ page }) => {
    await page.goto("/");
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
      await page.goto("/me");
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
