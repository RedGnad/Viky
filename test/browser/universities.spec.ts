import { expect, test } from "@playwright/test";

/** The schools at the foot of the landing (D225): under the card, four names, in the title face, and nothing moving. */
test("the foot of the landing names four schools a certificate can come from, under the card", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const sentence = page.getByText(/A verified certificate from a course by/);
  await expect(sentence).toBeVisible();
  await expect(page.getByText(/Viky is not affiliated with these universities/)).toBeVisible();
  const [card, foot] = await Promise.all([page.locator("#offer").boundingBox(), sentence.boundingBox()]);
  expect(foot!.y).toBeGreaterThan(card!.y + card!.height);
  // Four names, separated by commas and one "or", set in the title face.
  const names = sentence.locator("span").first();
  const said = (await names.textContent()) ?? "";
  expect(said.split(/, | or /).length).toBe(4);
  expect(await names.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Fredoka/i);
  // Nothing animates there.
  expect(await sentence.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
});
