import { expect, test } from "@playwright/test";
import { COLOURS, THEME_STORAGE_KEY } from "../../src/design-tokens";
import { APPEARANCE } from "../../src/sentences";

/**
 * The appearance control (D97, and the founder on 20 Sep 2026): two appearances, one press takes the other, applied
 * the moment it is pressed and remembered for the next visit. A source test can say what is written; only a browser
 * can say the screen actually changes.
 *
 * The device is set to dark in all of these, because a state that agrees with the device proves nothing: a chosen day
 * has to survive a dark device.
 */

const rgb = (hex: string) => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const ground = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.use({ colorScheme: "dark" });

test.describe("the appearance control", () => {
  test("one press takes the other appearance, and the screen follows at once", async ({ page }) => {
    await page.goto("/");
    const control = page.getByRole("button", { name: APPEARANCE.toggle });

    // Nothing chosen: the device paints the screen, and the control shows the night it is in.
    expect(await ground(page)).toBe(rgb(COLOURS.dark.background));
    await expect(control.locator(".appearance-moon")).toBeVisible();
    await expect(control.locator(".appearance-sun")).toBeHidden();

    // One press, not two: day, on a dark device, and the control now shows the day it is in.
    await control.click();
    expect(await ground(page), "a chosen day did not survive a dark device").toBe(rgb(COLOURS.light.background));
    await expect(control.locator(".appearance-sun")).toBeVisible();
    await expect(control.locator(".appearance-moon")).toBeHidden();

    await control.click();
    expect(await ground(page)).toBe(rgb(COLOURS.dark.background));
    await expect(control.locator(".appearance-moon")).toBeVisible();
  });

  test("a choice survives a reload, and a screen with nothing else in its header has the control too", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: APPEARANCE.toggle }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe("light");

    // A task, whose header has no other action: the control is there, and the choice came back before the first paint.
    await page.goto("/fund");
    await expect(page.getByRole("button", { name: APPEARANCE.toggle })).toBeVisible();
    expect(await ground(page)).toBe(rgb(COLOURS.light.background));

    // A document, the third kind of screen.
    await page.goto("/privacy");
    await expect(page.getByRole("button", { name: APPEARANCE.toggle })).toBeVisible();
    expect(await ground(page)).toBe(rgb(COLOURS.light.background));
  });

  test("the control is the quietest thing on the header line, and the body's one action did not move", async ({ page }) => {
    await page.goto("/");
    const control = page.getByRole("button", { name: APPEARANCE.toggle });
    const box = await control.boundingBox();
    expect(box?.width, "the target is smaller than a finger").toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);

    // The door sits beside it on this screen, and it is the wider of the two: the appearance never competes with it.
    const door = page.getByRole("button", { name: /^Sign in$/ });
    const doorBox = await door.boundingBox();
    expect(doorBox!.width).toBeGreaterThan(box!.width);
    expect(box!.x).toBeLessThan(doorBox!.x);

    // What the screen is asking for is still the card itself (D110). Since D214 the title, the sentence, the way to
    // the card and the character stand above it, and its top shows in the first screen: below its middle, above its
    // foot, so the page says there is more without hiding what it is for.
    const card = page.locator("main section").first();
    // The card is the first section of the body, known by the one field only it has (D138 took its overline off).
    await expect(card.getByLabel(/Their first name/i)).toBeVisible();
    const cardBox = await card.boundingBox();
    const height = page.viewportSize()!.height;
    expect(cardBox!.y).toBeGreaterThan(height * 0.4);
    expect(cardBox!.y).toBeLessThan(height);
  });
});
