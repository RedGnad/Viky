import { expect, test } from "@playwright/test";
import { COLOURS, THEME_STORAGE_KEY } from "../../src/design-tokens";
import { APPEARANCE } from "../../src/sentences";

/**
 * The appearance control (D97): three states, in one order, applied the moment it is pressed and remembered for the
 * next visit. A source test can say the order is written; only a browser can say the screen actually changes.
 *
 * The device is set to dark in all of these, because a state that agrees with the device proves nothing: a chosen day
 * has to survive a dark device, and "as your device" has to hand it back.
 */

const rgb = (hex: string) => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const ground = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.use({ colorScheme: "dark" });

test.describe("the appearance control", () => {
  test("one press walks the three states, and the screen follows at once", async ({ page }) => {
    await page.goto("/");
    const control = page.getByRole("button", { name: /^Appearance:/ });

    // Nothing chosen: the device paints the screen, and the control says so.
    await expect(control).toHaveAccessibleName(APPEARANCE.system);
    expect(await ground(page)).toBe(rgb(COLOURS.dark.background));

    await control.click();
    await expect(control).toHaveAccessibleName(APPEARANCE.light);
    expect(await ground(page), "a chosen day did not survive a dark device").toBe(rgb(COLOURS.light.background));

    await control.click();
    await expect(control).toHaveAccessibleName(APPEARANCE.dark);
    expect(await ground(page)).toBe(rgb(COLOURS.dark.background));

    await control.click();
    await expect(control).toHaveAccessibleName(APPEARANCE.system);
    expect(await ground(page)).toBe(rgb(COLOURS.dark.background));
    // Back to the device means the attribute is gone, not set to what the device happens to say today.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
  });

  test("a choice survives a reload, and a screen with nothing else in its header has the control too", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Appearance:/ }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe("light");

    // A task, whose header has no other action: the control is there, and the choice came back before the first paint.
    await page.goto("/fund");
    await expect(page.getByRole("button", { name: APPEARANCE.light })).toBeVisible();
    expect(await ground(page)).toBe(rgb(COLOURS.light.background));

    // A document, the third kind of screen.
    await page.goto("/privacy");
    await expect(page.getByRole("button", { name: APPEARANCE.light })).toBeVisible();
    expect(await ground(page)).toBe(rgb(COLOURS.light.background));
  });

  test("the control is the quietest thing on the header line, and the body's one action did not move", async ({ page }) => {
    await page.goto("/");
    const control = page.getByRole("button", { name: /^Appearance:/ });
    const box = await control.boundingBox();
    expect(box?.width, "the target is smaller than a finger").toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);

    // The door sits beside it on this screen, and it is the wider of the two: the appearance never competes with it.
    const door = page.getByRole("button", { name: /^Sign in or create account$/ });
    const doorBox = await door.boundingBox();
    expect(doorBox!.width).toBeGreaterThan(box!.width);
    expect(box!.x).toBeLessThan(doorBox!.x);

    // What the screen is asking for is still the first thing in the body, and since the card of 19 Sep 2026 that is
    // the gift itself rather than a way to one (D110).
    const card = page.locator("main section").first();
    await expect(card.getByText("A gift", { exact: true })).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox!.y).toBeLessThan(400);
  });
});
