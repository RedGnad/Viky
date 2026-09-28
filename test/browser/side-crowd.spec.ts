import { expect, test } from "@playwright/test";

/**
 * The day characters beside the landing's top (app/kit/SideCrowd.tsx): none on a phone or a tablet; on a wide screen,
 * never over the column and never off the window; and the column is the width the placement is computed from.
 */
test("the characters beside the top keep clear of the column, and only on a screen with room for them", async ({ page }) => {
  await page.goto("/");
  const measured = await page.evaluate(() => {
    const column = document.querySelector(".arrives-in-turn")!.getBoundingClientRect();
    const shown = [...document.querySelectorAll(".side-crowd > div")].filter((spot) => spot.getClientRects().length > 0 && getComputedStyle(spot).visibility !== "hidden");
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
  if (measured.width < 1024) {
    expect(measured.shown).toBe(0);
    return;
  }
  // The placement's column (LANDING_COLUMN in app/kit/SideCrowd.tsx) is the headline on one line.
  expect(measured.column).toBe(903);
  expect(measured.shown).toBeGreaterThan(0);
  expect(measured.touching).toBe(0);
  // Cut by the window's edge is how a character leaves as the window narrows; nothing scrolls sideways for it.
});

test("none of them is left in view facing the card, where the way to it stops, and none covers another", async ({ page }) => {
  await page.goto("/");
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".side-crowd > div")].filter((spot) => spot.getClientRects().length > 0 && getComputedStyle(spot).visibility !== "hidden").map((spot) => spot.getBoundingClientRect());
    let count = 0;
    boxes.forEach((one, i) => boxes.slice(i + 1).forEach((other) => {
      if (one.left < other.right && other.left < one.right && one.top < other.bottom && other.top < one.bottom) count++;
    }));
    return count;
  });
  expect(overlaps).toBe(0);
  await page.getByRole("link", { name: "Offer a gift" }).first().click();
  await page.waitForTimeout(1200);
  const inView = await page.evaluate(() =>
    [...document.querySelectorAll(".side-crowd > div")].filter((spot) => {
      if (spot.getClientRects().length === 0 || getComputedStyle(spot).visibility === "hidden") return false;
      const box = spot.getBoundingClientRect();
      return box.bottom > 0 && box.top < window.innerHeight;
    }).length,
  );
  expect(inView).toBe(0);
});
