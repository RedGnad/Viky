import { expect, test, type Page } from "@playwright/test";

/**
 * "Which university?" since D313: the country in its own sheet, opened from the sheet of what they will do, then that
 * country's universities. The defect this pins: choosing a country closed both sheets, because React carries a nested
 * dialog's close up to its parent's handler. The list is answered here, so the screen is measured and not the table.
 */
const sheet = (page: Page) => page.locator("dialog.sheet[open]");

test("choosing a country closes its own sheet only, and the country's universities are listed and searched", async ({ page }) => {
  await page.route(/\/api\/portals(\?.*)?$/, (route) => {
    const country = new URL(route.request().url()).searchParams.get("country");
    const body = country
      ? { results: [{ pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", country: "SN" }, { pair: "ugb-sn", title: "Université Gaston Berger", issuer: "Senegal", country: "SN" }] }
      : { countries: [{ code: "NG", count: 156 }, { code: "SN", count: 9 }] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.locator("main section").first().getByRole("button").first().click();
  const change = sheet(page).getByRole("button", { name: /^Change/i });
  if (await change.isVisible().catch(() => false)) await change.click();
  const line = sheet(page).getByRole("button", { name: /Enrolled at university/i });
  if (!(await line.isVisible().catch(() => false))) {
    const all = sheet(page).getByRole("button", { name: /All families/i });
    if (await all.isVisible().catch(() => false)) await all.click();
    await sheet(page).getByRole("button", { name: /School & studies/ }).click();
  }
  await line.click();
  await sheet(page).getByRole("button", { name: /Which country is it in\?/ }).click();
  await expect(sheet(page)).toHaveCount(2);
  await sheet(page).last().getByText("Senegal", { exact: true }).click();
  await expect(sheet(page)).toHaveCount(1);
  await expect(sheet(page).getByText("Search in Senegal")).toBeVisible();
  await expect(sheet(page).getByText("Université Gaston Berger")).toBeVisible();
  await sheet(page).getByLabel("Search in Senegal").fill("cheikh");
  await expect(sheet(page).getByText("Université Gaston Berger")).toHaveCount(0);
  await expect(sheet(page).getByText("Université Cheikh Anta Diop")).toBeVisible();
});

/**
 * "Reached a grade" (the founder, 28 Sep 2026): once the university is chosen, the grade is typed on a scale. Its own
 * when pinned, said in one line; before, the funder chooses it among four, and a letter is chosen rather than typed.
 */
async function chooseGradeAt(page: Page, scale: string | null) {
  await page.route(/\/api\/portals(\?.*)?$/, (route) => {
    const country = new URL(route.request().url()).searchParams.get("country");
    const body = country ? { results: [{ pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", country: "SN", scale }] } : { countries: [{ code: "SN", count: 1 }] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.locator("main section").first().getByRole("button").first().click();
  const change = sheet(page).getByRole("button", { name: /^Change/i });
  if (await change.isVisible().catch(() => false)) await change.click();
  const line = sheet(page).getByRole("button", { name: /Reached a grade/i });
  if (!(await line.isVisible().catch(() => false))) {
    const all = sheet(page).getByRole("button", { name: /All families/i });
    if (await all.isVisible().catch(() => false)) await all.click();
    await sheet(page).getByRole("button", { name: /School & studies/ }).click();
  }
  await line.click();
  await sheet(page).getByRole("button", { name: /Which country is it in\?/ }).click();
  await sheet(page).last().getByText("Senegal", { exact: true }).click();
  await sheet(page).getByText("Université Cheikh Anta Diop", { exact: true }).click();
}

test("before the university's scale is pinned, the funder chooses it, and a letter is chosen rather than typed", async ({ page }) => {
  await chooseGradeAt(page, null);
  await expect(sheet(page).getByText("How does their university grade?")).toBeVisible();
  // Done is never grey (the founder, 28 Sep 2026): pressed with something missing, it stays and says what.
  const done = sheet(page).getByRole("button", { name: /^Done$/ });
  await done.click();
  await expect(sheet(page).getByRole("status")).toHaveText("Choose the grading scale.");
  await sheet(page).getByRole("button", { name: "In letters" }).click();
  await expect(sheet(page).getByRole("button", { name: "B", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet(page).getByRole("button", { name: "F", exact: true })).toHaveCount(0);
  await expect(sheet(page).getByRole("status")).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Out of 4" }).click();
  await sheet(page).getByLabel("The grade they reach").fill("14");
  await done.click();
  await expect(sheet(page).getByRole("status")).toHaveText("Set the goal they reach.");
  await sheet(page).getByLabel("The grade they reach").fill("3.5");
  await done.click();
  await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
});

test("once the university's scale is pinned, it is said, and the grade is typed on it", async ({ page }) => {
  await chooseGradeAt(page, "20");
  await expect(sheet(page).getByText("Their university grades out of 20.")).toBeVisible();
  await expect(sheet(page).getByText("How does their university grade?")).toHaveCount(0);
  await sheet(page).getByLabel("The grade they reach").fill("14.5");
  await expect(sheet(page).getByRole("button", { name: /^Done$/ })).toBeEnabled();
});
