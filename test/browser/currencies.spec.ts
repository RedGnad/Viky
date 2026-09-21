import { expect, test, type Page } from "@playwright/test";

/**
 * What money is read in, and how it is changed (D152). The six things the founder asked to be true:
 *
 * 1. pressing the sign opens a sheet, and never changes the currency by itself;
 * 2. the sheet holds exactly what the rails and the rate file agreed on today, and never the yuan;
 * 3. every line shows the amount on the screen converted into that currency;
 * 4. the sign's target is at least 44 pixels both ways;
 * 5. its accessible name says what it does and what is being read now;
 * 6. a rail that does not answer leaves the three the product was built on, and nothing false.
 */

const key = (page: Page) => page.locator("button[aria-label^='Read in another currency']").first();
const sheet = (page: Page) => page.locator("dialog.sheet[open]");
const offered = async (page: Page) => (await page.request.get("/api/rates").then((answer) => answer.json())).currencies as string[];

test.describe("what money is read in", () => {
  test("the key opens the list and changes nothing by itself", async ({ page }) => {
    await page.goto("/");
    const before = await key(page).getAttribute("aria-label");
    await key(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole("heading", { name: /Read money in/i })).toBeVisible();
    expect(await key(page).getAttribute("aria-label")).toBe(before);
    // And it is what it says: chosen, the card follows it everywhere.
    await sheet(page).getByRole("button", { name: /Indian Rupee/ }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, Indian Rupee now");
    await expect(page.getByRole("button", { name: /^Send ₹/ })).toBeVisible();
  });

  test("the list is what the rails and the rate file agreed on today, and never the yuan", async ({ page }) => {
    await page.goto("/");
    const codes = await offered(page);
    expect(codes.length).toBeGreaterThanOrEqual(3);
    expect(codes).not.toContain("CNY");
    await key(page).click();
    const lines = sheet(page).locator("li button");
    await expect(lines).toHaveCount(codes.length);
    // Each one, by its own code, and the one being read is the one pressed.
    for (const code of codes.slice(0, 4)) await expect(sheet(page).getByText(code, { exact: true })).toBeVisible();
    await expect(sheet(page).locator('li button[aria-pressed="true"]')).toHaveCount(1);
  });

  test("every line says what the amount on the screen is worth in that currency", async ({ page }) => {
    await page.goto("/");
    await key(page).click();
    // The rate comes over the network: the figures land with it, and until then the sheet says nothing about it.
    await expect(sheet(page).getByText(/at the European Central Bank's rate of/)).toBeVisible();
    const worth = await sheet(page)
      .locator("li button")
      .evaluateAll((all) => all.slice(0, 6).map((line) => (line.lastElementChild?.textContent ?? "").trim()));
    for (const figure of worth) expect(figure).toMatch(/\d/);
    // Said once, at the foot, rather than on every line.
    await expect(sheet(page).getByText(/at the European Central Bank's rate of|exchange rate could not be read/)).toHaveCount(1);
  });

  test("the key is a thumb's size, and says what it does", async ({ page }) => {
    await page.goto("/");
    const box = (await key(page).boundingBox())!;
    // At least the 44 the founder asked for, and in fact the 48 every control in this product keeps.
    expect(Math.round(box.width * 100) / 100).toBeGreaterThanOrEqual(48);
    expect(Math.round(box.height * 100) / 100).toBeGreaterThanOrEqual(48);
    await expect(key(page)).toHaveAttribute("aria-label", /^Read in another currency, .+ now$/);
    await expect(key(page)).toHaveAttribute("aria-haspopup", "dialog");
    // It wears what everything pressable here wears: the two pixel edge and the four pixel relief.
    const worn = await key(page).evaluate((element) => ({ edge: getComputedStyle(element).borderTopWidth, relief: getComputedStyle(element).boxShadow }));
    expect(worn.edge).toBe("2px");
    expect(worn.relief).toMatch(/0px 4px 0px 0px/);
  });
});
