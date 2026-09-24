import { expect, test, type Page } from "@playwright/test";

/**
 * The hero moment of the landing (D214): the character rises from behind the card once per visit, the first image is
 * its starting state, every later load in the session shows it standing and still, and the card's top shows at the
 * foot of the first screen.
 */

/** The figure's transform once the moment is over: none, which is standing on its floor. */
const figureTransform = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.hero-character [data-part="figure"]') as SVGGElement).transform);

const moving = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect && (a.effect as KeyframeEffect).target?.closest(".hero-stage")).length);

test.describe("the hero moment", () => {
  test("rises once per visit from behind the card, and stands still on the next load", async ({ page, viewport }) => {
    // What the server sends the first time: the starting state, in the markup itself.
    const first = await (await page.request.get("/")).text();
    expect(first).toContain('data-hero="peeking"');
    await page.goto("/", { waitUntil: "load" });
    // The moment starts when the attribute goes, in the same task as its animations; only then can "nothing moving"
    // mean it is over rather than not yet begun (a slow machine hydrates after "load").
    await expect.poll(() => page.locator(".hero-stage").getAttribute("data-hero"), { timeout: 5000 }).toBeNull();
    // It leaps, bounces and stands: the figure's transform is gone, and its limbs are out.
    await expect.poll(() => moving(page), { timeout: 4000 }).toBe(0);
    expect(await figureTransform(page)).toBe("none");
    expect(await page.locator(".hero-stage").getAttribute("data-hero")).toBeNull();
    const limbs = await page.locator('.hero-character [data-part="leg"]').evaluateAll((all) => all.map((leg) => getComputedStyle(leg).transform));
    expect(limbs.every((t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)")).toBe(true);
    // The card's top shows in the first screen, so the page says there is more.
    const cardTop = await page.locator("#offer").evaluate((card) => card.getBoundingClientRect().top);
    expect(cardTop).toBeLessThan(viewport!.height);
    expect(cardTop).toBeGreaterThan(viewport!.height * 0.4);
    // The session remembers: the next load is drawn standing by the server, and nothing moves.
    const again = await (await page.request.get("/")).text();
    expect(again).not.toContain('data-hero="peeking"');
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(300);
    expect(await moving(page)).toBe(0);
    expect(await figureTransform(page)).toBe("none");
  });

  test("the way to the card is the first screen's one action, and it reaches the card", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const way = page.getByRole("link", { name: "Offer a gift" });
    await expect(way).toBeVisible();
    await way.click();
    // The card's top comes to the head of the screen, within a header's height of it, unless the page is too short to
    // scroll that far, in which case the page has scrolled to its end and the card is whole on the screen.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const top = Math.round(document.getElementById("offer")!.getBoundingClientRect().top);
            const atTheEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
            return top <= 80 || (atTheEnd && window.scrollY > 0);
          }),
        { timeout: 3000 },
      )
      .toBe(true);
  });

  test.describe("with the device asking for less movement", () => {
    test.use({ reducedMotion: "reduce" });

    test("the character stands from the first image, and nothing moves", async ({ page }) => {
      await page.goto("/", { waitUntil: "load" });
      await page.waitForTimeout(200);
      expect(await moving(page)).toBe(0);
      expect(await figureTransform(page)).toBe("none");
    });
  });
});
