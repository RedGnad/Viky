import { expect, test, type Page } from "@playwright/test";

/**
 * The one line on the card, and what it opens (D136, D137). The defect it answers: pressing "What they will do" always
 * reopened the catalogue, so on a daily condition the funder could never name the account, choose the course or set
 * the bar for a day. It now opens the catalogue while nothing is chosen and that condition's own questions from then
 * on, with the way back to the catalogue as the step's first control. One line, because the card stays quiet.
 *
 * The profile read is stubbed with what production answered for "Luis" on 20 Sep 2026 (French 77530, Japanese 4199,
 * Spanish 13022, German 2348, Swedish 1012, current French), so this measures our screen and not the source's uptime.
 */
const LUIS = {
  username: "Luis",
  currentCourseId: "DUOLINGO_FR_EN",
  courses: [
    { id: "DUOLINGO_JA_EN", title: "Japanese", xp: 4199 },
    { id: "DUOLINGO_FR_EN", title: "French", xp: 77530 },
    { id: "DUOLINGO_ES_EN", title: "Spanish", xp: 13022 },
    { id: "DUOLINGO_DE_EN", title: "German", xp: 2348 },
    { id: "DUOLINGO_SV_EN", title: "Swedish", xp: 1012 },
  ],
};

const card = (page: Page) => page.locator("main section").first();
const sheet = (page: Page) => page.locator("dialog.sheet[open]");

async function choose(page: Page, name: RegExp, family: RegExp) {
  // The first control on the card is the line this defect is about: what they will do, and what it has been told.
  // It opens that condition's questions once one is chosen, so the catalogue is asked for by its own control.
  await card(page).getByRole("button").first().click();
  const change = sheet(page).getByRole("button", { name: /^Change/i });
  if (await change.isVisible().catch(() => false)) await change.click();
  // The catalogue is one family's list at a time since D224: the line's family is reached from the four tiles.
  const radio = sheet(page).getByRole("button", { name });
  if (!(await radio.isVisible().catch(() => false))) {
    const all = sheet(page).getByRole("button", { name: /All families/i });
    if (await all.isVisible().catch(() => false)) await all.click();
    await sheet(page).getByRole("button", { name: family }).click();
  }
  await radio.click();
  // Choosing lands on that condition's own questions, whose way back to the catalogue is the Change button.
  await expect(sheet(page).getByRole("button", { name: /^Change/i })).toBeVisible();
}

test.describe("the line that opens what they will do", () => {
  test("whatever the card carries, it opens the four families, and a condition's own step is reached by choosing it (D233)", async ({ page }) => {
    const names: [RegExp, RegExp][] = [
      [/Duolingo lesson each day/i, /^Learn/],
      [/Duolingo English Test score/i, /Exams & school/],
      [/puzzle record/i, /^Play/],
      [/chess rating/i, /^Play/],
      [/Coursera certificate/i, /^Learn/],
      [/certification on Credly/i, /^Learn/],
    ];
    for (const [name, family] of names) {
      await page.goto("/");
      await choose(page, name, family);
      // The sheet is on that condition's questions already; close it and come back through the card's one line.
      await sheet(page).getByRole("button", { name: "Close" }).click();
      await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
      const line = card(page).getByRole("button").first();
      await expect(line).toBeVisible();
      await line.click();
      await expect(sheet(page)).toBeVisible();
      // The four families, whatever the card carries (D233): no line to pick yet, no way back, four tiles.
      await expect(sheet(page).locator('div[role="group"] > button')).toHaveCount(0);
      await expect(sheet(page).getByRole("button", { name: /^Change/i })).toHaveCount(0);
      await expect(sheet(page).locator("[data-family-art]")).toHaveCount(4);
      await sheet(page).getByRole("button", { name: "Close" }).click();
    }
  });

  test("with a name, the courses are the profile's own, the current one first, and the whole profile is the default", async ({ page }) => {
    await page.route("**/api/duolingo/profile**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LUIS) }));
    await page.goto("/");
    // The line opens the four families (D233); the step is reached by choosing the condition in its family.
    await card(page).getByRole("button").first().click();
    const step = sheet(page);
    await step.getByRole("button", { name: /^Learn/ }).click();
    await step.getByRole("button", { name: /Duolingo lesson each day/i }).click();
    await step.getByLabel(/name, if you know it/i).fill("Luis");
    await step.getByLabel(/name, if you know it/i).blur();
    await expect(step.getByRole("radio", { name: /Any course on that profile/i })).toBeChecked();
    const courses = step.getByRole("radio");
    await expect(courses).toHaveCount(6);
    await expect(courses.nth(1)).toHaveAccessibleName(/French, 77,530 XP won/);
    for (const language of [/Japanese, 4,199/, /Spanish, 13,022/, /German, 2,348/, /Swedish, 1,012/]) {
      await expect(step.getByRole("radio", { name: language })).toBeVisible();
    }
  });

  test("without a name the step says the name is optional and the courses come after, and the gift can still be paid", async ({ page }) => {
    await page.goto("/");
    const line = card(page).getByRole("button").first();
    // The line stays simple (D138): the label and the condition's name. What it has been told is in the step.
    await expect(line).toContainText(/A Duolingo lesson each day/i);
    await expect(line).not.toContainText(/XP a day/i);
    await line.click();
    await sheet(page).getByRole("button", { name: /^Learn/ }).click();
    await sheet(page).getByRole("button", { name: /Duolingo lesson each day/i }).click();
    await expect(sheet(page).getByLabel(/name, if you know it/i)).toBeVisible();
    await expect(sheet(page).getByText(/the courses appear here/i)).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: /^Done$/ })).toBeEnabled();
  });
});
