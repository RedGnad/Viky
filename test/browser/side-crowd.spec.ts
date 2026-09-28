import { expect, test } from "@playwright/test";

/**
 * The day characters beside the landing's top (app/kit/SideCrowd.tsx): none on a phone or a tablet; on a wide screen,
 * never over the column and never off the window; and the column is the width the placement is computed from.
 */
test("the characters beside the top keep clear of the column, and only on a screen with room for them", async ({ page }) => {
  await page.goto("/");
  const measured = await page.evaluate(() => {
    const column = document.querySelector(".arrives-in-turn")!.getBoundingClientRect();
    const shown = [...document.querySelectorAll(".side-crowd > div")].filter((spot) => getComputedStyle(spot).display !== "none");
    return {
      width: window.innerWidth,
      column: Math.round(column.width),
      shown: shown.length,
      touching: shown.filter((spot) => {
        const box = spot.getBoundingClientRect();
        return box.right > column.left - 8 && box.left < column.right + 8;
      }).length,
      outside: shown.filter((spot) => {
        const box = spot.getBoundingClientRect();
        return box.left < 0 || box.right > window.innerWidth;
      }).length,
      sideways: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(measured.sideways).toBe(false);
  if (measured.width < 1100) {
    expect(measured.shown).toBe(0);
    return;
  }
  // The placement's column (LANDING_COLUMN in app/kit/SideCrowd.tsx) is the headline on one line.
  expect(measured.column).toBe(903);
  expect(measured.shown).toBeGreaterThan(0);
  expect(measured.touching).toBe(0);
  expect(measured.outside).toBe(0);
});
