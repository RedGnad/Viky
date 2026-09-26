import { expect, test } from "@playwright/test";

/** What a gift can wait for, under the landing's card (D285): one item at a time, in the title face, then the next. */
test("under the card, the sentence says what a gift can wait for, one item at a time, and moves on", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const said = page.locator("[data-goal-said]");
  await said.scrollIntoViewIfNeeded();
  await expect(said).toBeVisible();
  await expect(page.getByText(/Viky is not affiliated with the schools, races or services named/)).toBeVisible();
  const [card, box] = await Promise.all([page.locator("#offer").boundingBox(), said.boundingBox()]);
  expect(box!.y).toBeGreaterThan(card!.y + card!.height);
  expect(await said.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Fredoka/i);
  const first = await said.innerText();
  await expect.poll(() => said.innerText(), { timeout: 6000 }).not.toBe(first);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the sentence keeps its first item", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const said = page.locator("[data-goal-said]");
    await said.scrollIntoViewIfNeeded();
    const first = await said.innerText();
    await page.waitForTimeout(3500);
    expect(await said.innerText()).toBe(first);
  });
});
