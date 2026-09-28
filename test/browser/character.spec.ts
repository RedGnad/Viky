import { expect, test, type Page } from "@playwright/test";

/**
 * The character at the head of the page and of the sheet that pays (D148). It no longer answers the card's controls
 * nor a pointer (D216): whatever is hovered or pressed on the card, its face stays at rest.
 */

const face = (page: Page) =>
  page.evaluate(() => {
    const head = document.querySelector("main svg[data-character='diamond']");
    const part = (name: string) => {
      const one = head?.querySelector(`[data-part="${name}"]`);
      // A part that has never moved carries no transform at all, which is the same face as one moved back to rest.
      const transform = one ? getComputedStyle(one).transform : "none";
      return transform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : transform;
    };
    return { gaze: part("gaze"), eye: part("eye"), mouth: part("mouth") };
  });

const AT_REST = { gaze: "matrix(1, 0, 0, 1, 0, 0)", eye: "matrix(1, 0, 0, 1, 0, 0)", mouth: "matrix(1, 0, 0, 1, 0, 0)" };

test.describe("the character at the head of the page", () => {
  test("it is on the page, and not on the sheet that pays (28 Sep 2026)", async ({ page }) => {
    await page.goto("/");
    // The one that is drawn: the sheet's own character is in the page from the first render, shut inside its dialog.
    // The cast of the promises under the card (D282) is its own, and is not counted here.
    await expect(page.locator("main svg[data-character='diamond']:visible:not([data-landing-story] svg)")).toHaveCount(1);
    await page.getByRole("button", { name: /^Send / }).click();
    const sheet = page.locator("dialog.sheet[open]");
    await expect(sheet).toBeVisible();
    // The pay sheet's title is the gift; a character beside it said nothing (the founder, 28 Sep 2026).
    await expect(sheet.locator("svg[data-character='diamond']:visible")).toHaveCount(0);
  });

  test("nothing hovered or pressed on the card moves its face (D216)", async ({ page }) => {
    await page.goto("/");
    // The moment starts when the attribute goes, in the same task as its animations; only then can "nothing moving"
    // mean it is over rather than not yet begun (a slow machine hydrates after "load"), as in hero.spec.ts.
    await expect.poll(() => page.locator(".hero-stage").getAttribute("data-hero"), { timeout: 5000 }).toBeNull();
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect as KeyframeEffect | null)?.target?.closest(".hero-stage")).length), { timeout: 4000 }).toBe(0);
    expect(await face(page)).toEqual(AT_REST);
    await page.getByRole("button", { name: /What they will do/i }).hover();
    await page.waitForTimeout(300);
    expect(await face(page)).toEqual(AT_REST);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "30 days", exact: true }).click();
    await page.waitForTimeout(400);
    expect(await face(page)).toEqual(AT_REST);
  });

  test.describe("with the device asking for less movement", () => {
    test.use({ reducedMotion: "reduce" });

    test("the face stays at rest, whatever is pressed or hovered", async ({ page }) => {
      // Under reduced motion the hero moment is still from its first image, so the face is readable at once.
      await page.goto("/");
      await page.getByRole("button", { name: /What they will do/i }).hover();
      await page.waitForTimeout(400);
      expect(await face(page)).toEqual(AT_REST);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "30 days", exact: true }).click();
      await page.waitForTimeout(400);
      expect(await face(page)).toEqual(AT_REST);
    });
  });
});
