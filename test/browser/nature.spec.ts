import { expect, test } from "@playwright/test";

/**
 * The nature of a condition, in two words, in three places and nowhere else (D162, the founder's direction 1
 * corrected): on the chooser's line, on the card under the condition, and on the catalogue page. The landing's own
 * card is not a gift card, so the words are not on it; the account screen has no condition, so none there either.
 */
const WORDS = /^(READ FOR YOU|SHOWN BY THEM|CONNECTED BY THEM)$/;

test.describe("the nature of a condition", () => {
  test("the chooser says it on the line of the condition, and the landing does not say it outside the sheet", async ({ page }) => {
    await page.goto("/");
    // The chooser's sheet is in the document, closed, with its lines in it: only what is shown counts.
    await expect(page.getByText(WORDS).filter({ visible: true })).toHaveCount(0);
    // The line that asks what they will do opens where the funder is (D137): the condition's own questions, with the
    // list one press away behind "Change". The nature is said on the list, on every line of it.
    await page.getByRole("button", { name: /what they will do/i }).first().click();
    const sheet = page.locator("dialog.sheet[open]");
    const change = sheet.getByRole("button", { name: /^Change/i });
    if (await change.isVisible().catch(() => false)) await change.click();
    await expect(sheet.getByText(WORDS).first()).toBeVisible();
    // On every line of the list, chosen or not: one of the natures' words on each. The list is one family at a time
    // since D224, the card's own family first; the TOEFL score, which is shown by them (D184), is among the exams.
    const said = await sheet.getByText(WORDS).filter({ visible: true }).allTextContents();
    expect(said.length).toBe(await sheet.getByRole("radio").count());
    expect(said.every((words) => WORDS.test(words))).toBe(true);
    await sheet.getByRole("button", { name: /All families/i }).click();
    await sheet.getByRole("button", { name: /Exams & school/ }).click();
    const exams = await sheet.getByText(WORDS).filter({ visible: true }).allTextContents();
    expect(exams.length).toBe(await sheet.getByRole("radio").count());
    expect(exams).toContain("SHOWN BY THEM");
    // The meta voice: 13 px, capitals, a pixel of tracking, the muted ink, and no fill behind it.
    const tag = sheet.getByText(WORDS).first();
    const style = await tag.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { size: computed.fontSize, tracking: computed.letterSpacing, transform: computed.textTransform, background: computed.backgroundColor, family: computed.fontFamily };
    });
    expect(style.size).toBe("13px");
    expect(style.tracking).toBe("1px");
    expect(style.transform).toBe("uppercase");
    expect(style.background).toBe("rgba(0, 0, 0, 0)");
    expect(style.family.toLowerCase()).toContain("dm sans");
  });

  test("the catalogue says it once per condition", async ({ page }) => {
    await page.goto("/what-viky-can-check");
    const conditions = page.locator("main section h3");
    const tags = page.getByText(WORDS);
    // Every condition, and only the conditions: the frontier's lines are not conditions and carry no nature.
    const frontier = 4;
    expect(await tags.count()).toBe((await conditions.count()) - frontier);
    // And each frontier line says whether the other reading is being built for it: all four are, since D179 (D163, D165, D176).
    await expect(page.getByText(/^Being built: /)).toHaveCount(4);
    await expect(page.getByText("Not being built.")).toHaveCount(0);
  });

  test("the account screen has no condition and says nothing about one", async ({ page }) => {
    await page.goto("/me");
    await expect(page.getByText(WORDS).filter({ visible: true })).toHaveCount(0);
  });
});
