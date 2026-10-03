import { expect, test } from "@playwright/test";
import { TERMS, aWindow, daily, photographer, serve } from "./gift-fixtures";
import { makeAnAccount } from "./gift-kit";

/**
 * A wait that follows a press (the founder, 3 Oct 2026): the wheel turns inside the button from the press, and past
 * ten seconds a line under the button names the step in progress. Walked on "Count now", whose request is held here
 * for as long as the test wants: a reading that takes its time, as an attested one does.
 *
 * VIKY_WAITS_CAPTURES=<folder> also photographs the two moments at 390 by 844.
 */
const shot = photographer(process.env.VIKY_WAITS_CAPTURES);

test.describe("a wait that follows a press", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: the test opens its own window");

  test("the wheel is in the button at the press, and the step is named after ten seconds, not before", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const GIFT = "77";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    let answer: (() => void) | undefined;
    await page.route(`**/api/gift/${GIFT}/count`, async (route) => {
      await new Promise<void>((resolve) => (answer = resolve));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "already", reason: "counted_today" }) });
    });
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await page.locator("summary", { hasText: "How this is checked" }).click();
    const count = page.getByRole("button", { name: "Count now" });
    await expect(count).toBeVisible();
    await page.clock.install();
    await count.click();

    // From the press: the wheel and what is being done, in the button, and nothing under it yet.
    const button = page.locator("button:has([data-waiting])").first();
    await expect(button).toContainText("Reading your profile");
    await expect(button.locator(".working-ring")).toBeVisible();
    await expect(button).toBeDisabled();
    const step = page.locator("[data-step-in-progress]");
    await expect(step).toHaveCount(0);
    await page.clock.runFor(9_000);
    await expect(step).toHaveCount(0);
    await shot(page, "1-the-wheel-at-the-press", false);

    // Past ten seconds: the step in progress, named under the button.
    await page.clock.runFor(1_500);
    await expect(step).toHaveText("Asking Duolingo, certifying its answer, then writing it down.");
    await shot(page, "2-the-step-named-after-ten-seconds", false);

    // Answered: the wheel and the line are gone, and the button says what it said.
    answer?.();
    await expect(page.getByRole("button", { name: "Count now" })).toBeEnabled();
    await expect(step).toHaveCount(0);
    await expect(page.locator("[data-waiting]")).toHaveCount(0);
    await device.context.close();
  });

  test("with less motion asked for, the wheel stands still and the words stay", async ({ browser, baseURL }) => {
    const GIFT = "78";
    const device = await aWindow(browser, baseURL);
    const { page } = device;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await page.route(`**/api/gift/${GIFT}/count`, () => new Promise(() => undefined));
    await makeAnAccount(device);
    await page.goto(`/g/${GIFT}`);
    await page.locator("summary", { hasText: "How this is checked" }).click();
    await page.getByRole("button", { name: "Count now" }).click();
    const ring = page.locator("button [data-waiting] .working-ring");
    await expect(ring).toBeVisible();
    // The ring's loop is cut to one turn of a hundredth of a millisecond: a frame later nothing is running on it.
    await expect.poll(() => ring.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
    await expect(page.locator("button:has([data-waiting])").first()).toContainText("Reading your profile");
    await shot(page, "3-reduced-motion", false);
    await device.context.close();
  });
});
