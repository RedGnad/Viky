import { expect, test, type Page } from "@playwright/test";

/**
 * The character, and the two expressions it answers with (D148, the motion roadmap of 21 Sep 2026, step 2).
 *
 * It stands at the head of the page and of the sheet that pays, and it answers the two controls of the card: the
 * line that says what they will do, and a length. With a pointer that is the hover, 200 ms there and 200 ms back.
 * With a finger there is no hover at all, so the expression plays once when the choice is made and comes back by
 * itself. A device that asks for less movement is given the face at rest and nothing else.
 */

const hasPointer = (page: Page) => page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);

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
  test("it is on the page, and on the sheet that pays", async ({ page }) => {
    await page.goto("/");
    // The one that is drawn: the sheet's own character is in the page from the first render, shut inside its dialog.
    await expect(page.locator("main svg[data-character='diamond']:visible")).toHaveCount(1);
    await page.getByRole("button", { name: /^Send / }).click();
    const sheet = page.locator("dialog.sheet[open]");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("svg[data-character='diamond']:visible")).toHaveCount(1);
  });

  /** The hero moment of the landing (D214) plays first; the face is read once it stands still. */
  const heroSettled = (page: Page) => expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect as KeyframeEffect | null)?.target?.closest(".hero-stage")).length), { timeout: 4000 }).toBe(0);

  test("with a pointer it looks at the line, smiles at a length, and comes back when the pointer leaves", async ({ page }) => {
    await page.goto("/");
    await heroSettled(page);
    test.skip(!(await hasPointer(page)), "this device has no pointer, so it has no hover");
    expect(await face(page)).toEqual(AT_REST);

    // Curious: the gaze turns towards the line, which is below it, and the mouth opens.
    await page.getByRole("button", { name: /What they will do/i }).hover();
    await expect.poll(async () => (await face(page)).mouth, { timeout: 2000 }).toBe("matrix(1, 0, 0, 1.6, 0, 0)");
    const curious = await face(page);
    expect(curious.gaze).not.toBe(AT_REST.gaze);
    expect(Number(/matrix\(1, 0, 0, 1, [-\d.]+, ([-\d.]+)\)/.exec(curious.gaze)?.[1] ?? 0)).toBeGreaterThan(0);
    expect(curious.eye).toBe(AT_REST.eye);

    // Happy: the eyes narrow into a smile and the mouth widens a touch.
    await page.getByRole("button", { name: "30 days", exact: true }).hover();
    await expect.poll(async () => (await face(page)).eye, { timeout: 2000 }).toBe("matrix(1, 0, 0, 0.34, 0, 0)");
    expect((await face(page)).gaze).toBe(AT_REST.gaze);

    // And back to the face it had, once the pointer is somewhere else.
    await page.mouse.move(2, 600);
    await expect.poll(async () => face(page), { timeout: 2000 }).toEqual(AT_REST);
  });

  test("with a finger the expression plays once on the choice and comes back by itself", async ({ page }) => {
    await page.goto("/");
    await heroSettled(page);
    test.skip(await hasPointer(page), "this device has a pointer, so it hovers instead");
    expect(await face(page)).toEqual(AT_REST);
    await page.getByRole("button", { name: "7 days", exact: true }).tap();
    // It plays: caught part way through, the eyes are on their way to the smile.
    await expect.poll(async () => Number(/matrix\(1, 0, 0, ([\d.]+)/.exec((await face(page)).eye)?.[1] ?? 1), { timeout: 1000 }).toBeLessThan(0.9);
    // And it comes back on its own, with nothing to leave it.
    await expect.poll(async () => face(page), { timeout: 3000 }).toEqual(AT_REST);
  });

  test.describe("with the device asking for less movement", () => {
    test.use({ reducedMotion: "reduce" });

    test("the face stays at rest, whatever is pressed or hovered", async ({ page }) => {
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
