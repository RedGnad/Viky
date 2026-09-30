import { expect, test, type Page } from "@playwright/test";

/**
 * "Which university?" (D313, the founder, 29 Sep 2026): one line "At university" whose questions ask what they will
 * show; no country to choose before the list, which opens on the person's own; the country as a chip in its own sheet;
 * one field that searches the whole list. The defect the country sheet pins: choosing a country closed both sheets,
 * because React carries a nested dialog's close up to its parent's handler. The list is answered here, so the screen is
 * measured and not the table.
 */
const sheet = (page: Page) => page.locator("dialog.sheet[open]");

const SENEGAL = [
  { pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", country: "SN", tested: true, scale: null },
  { pair: "ugb-sn", title: "Université Gaston Berger", issuer: "Senegal", country: "SN", tested: false, scale: null },
];
const LAGOS = { pair: "unilag-ng", title: "University of Lagos", issuer: "Nigeria", country: "NG", tested: false, scale: null };

async function answerTheList(page: Page, senegal: readonly object[] = SENEGAL) {
  await page.route(/\/api\/portals(\?.*)?$/, (route) => {
    const country = new URL(route.request().url()).searchParams.get("country");
    const body = country === "SN" ? { results: senegal } : country === "NG" ? { results: [LAGOS] } : { countries: [{ code: "NG", count: 156 }, { code: "SN", count: 9 }], here: "SN" };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(/\/api\/portals\/search\?/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const found = [LAGOS].filter((one) => one.country !== params.get("except") && one.title.toLowerCase().includes(String(params.get("q")).toLowerCase()));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: found, more: false }) });
  });
}

async function openAtUniversity(page: Page) {
  await page.goto("/");
  await page.locator("main section").first().getByRole("button").first().click();
  const change = sheet(page).getByRole("button", { name: /^Change/i });
  if (await change.isVisible().catch(() => false)) await change.click();
  const line = sheet(page).getByRole("button", { name: /At university/ });
  if (!(await line.isVisible().catch(() => false))) {
    const all = sheet(page).getByRole("button", { name: /All families/i });
    if (await all.isVisible().catch(() => false)) await all.click();
    await sheet(page).getByRole("button", { name: /School & studies/ }).click();
  }
  // One line for the three conditions of the service, never three.
  await expect(sheet(page).getByRole("button", { name: /Enrolled at university|Passed the year|Reached a grade/ })).toHaveCount(0);
  await line.click();
}

test("the list opens on the person's country with no step before it, and one field searches the whole list", async ({ page }) => {
  await answerTheList(page);
  await openAtUniversity(page);
  await expect(sheet(page).getByRole("heading", { name: "Which university" })).toBeVisible();
  const modes = sheet(page).getByRole("group", { name: "What will they show?" });
  await expect(modes.getByRole("radio", { name: "Enrolled" })).toBeChecked();
  // The country is a chip, already on the person's own, and the list is there.
  await expect(sheet(page).getByRole("button", { name: /In Senegal/ })).toBeVisible();
  const tested = sheet(page).getByRole("group", { name: "Tested with a student" });
  const all = sheet(page).getByRole("group", { name: "All universities" });
  await expect(tested.getByText("Université Cheikh Anta Diop")).toBeVisible();
  await expect(all.getByText("Université Gaston Berger")).toBeVisible();
  await expect(all.getByText("Set up on the first gift, within two days.")).toBeVisible();
  await expect(all.getByText("Université Cheikh Anta Diop")).toHaveCount(0);
  // The search runs on both groups, and then on the rest of the world, with the country on each of those lines.
  const search = sheet(page).getByLabel("Search universities");
  await search.fill("cheikh");
  await expect(sheet(page).getByText("Université Gaston Berger")).toHaveCount(0);
  await expect(tested.getByText("Université Cheikh Anta Diop")).toBeVisible();
  await expect(all).toHaveCount(0);
  await search.fill("lagos");
  const elsewhere = sheet(page).getByRole("group", { name: "Other countries" });
  await expect(elsewhere.getByText("University of Lagos")).toBeVisible();
  await expect(elsewhere.getByText("Nigeria")).toBeVisible();
  await expect(tested).toHaveCount(0);
  // Choosing folds the list into the one chosen, and Change opens it again.
  await elsewhere.getByText("University of Lagos").click();
  const chosen = sheet(page).locator("[data-university-chosen]");
  await expect(chosen.getByText("University of Lagos")).toBeVisible();
  await expect(chosen.getByText("Nigeria")).toBeVisible();
  await expect(sheet(page).getByLabel("Search universities")).toHaveCount(0);
  // What they will show changes, and the university stays.
  await modes.getByText("The year passed", { exact: true }).click();
  await expect(modes.getByRole("radio", { name: "The year passed" })).toBeChecked();
  await expect(chosen.getByText("University of Lagos")).toBeVisible();
  await chosen.getByRole("button", { name: /Change/ }).click();
  await expect(sheet(page).getByRole("button", { name: /In Nigeria/ })).toBeVisible();
});

test("choosing a country in the chip's sheet closes that sheet only, and lists that country", async ({ page }) => {
  await answerTheList(page);
  await openAtUniversity(page);
  await sheet(page).getByRole("button", { name: /In Senegal/ }).click();
  await expect(sheet(page)).toHaveCount(2);
  await sheet(page).last().getByText("Nigeria", { exact: true }).click();
  await expect(sheet(page)).toHaveCount(1);
  await expect(sheet(page).getByRole("button", { name: /In Nigeria/ })).toBeVisible();
  await expect(sheet(page).getByRole("group", { name: "All universities" }).getByText("University of Lagos")).toBeVisible();
});

test("pressing the search field moves nothing under the pointer, so no university is chosen by it", async ({ page }) => {
  // The founder, 30 Sep 2026: the list scrolled up on focus, under a pointer still pressed, and the university it then
  // stood on was chosen on release, in Safari, the first one of the country every time.
  await answerTheList(page, Array.from({ length: 30 }, (_, index) => ({ ...SENEGAL[1], pair: `u${index}-sn`, title: `Université ${index}` })));
  await openAtUniversity(page);
  await sheet(page).getByRole("group", { name: "All universities" }).waitFor();
  const field = sheet(page).getByLabel("Search universities");
  await field.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const box = (await field.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id, [x, y])).toBe("university-search");
  await page.mouse.up();
  await expect(field).toBeFocused();
  await expect(sheet(page).locator("[data-university-chosen]")).toHaveCount(0);
  await expect(sheet(page).locator('input[name="university"]:checked')).toHaveCount(0);
});

/**
 * "A grade" (the founder, 28 Sep 2026): once the university is chosen, the grade is typed on a scale. Its own when
 * pinned, said in one line; before, the funder chooses it among four, and a letter is chosen rather than typed.
 */
async function chooseGradeAt(page: Page, scale: string | null) {
  await answerTheList(page, [{ ...SENEGAL[0], scale }]);
  await openAtUniversity(page);
  await sheet(page).getByRole("group", { name: "What will they show?" }).getByText("A grade", { exact: true }).click();
  await expect(sheet(page).getByRole("heading", { name: "Which university, and the grade" })).toBeVisible();
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
  await expect(sheet(page).getByLabel("The grade they reach")).toHaveValue("3");
  await sheet(page).getByLabel("The grade they reach").fill("14");
  await done.click();
  await expect(sheet(page).getByRole("status")).toHaveText("Set the goal they reach.");
  await sheet(page).getByLabel("The grade they reach").fill("3.5");
  await done.click();
  await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
});

test("once the university's scale is pinned, it is said, and the grade starts on it", async ({ page }) => {
  await chooseGradeAt(page, "4");
  await expect(sheet(page).getByText("Their university grades out of 4.")).toBeVisible();
  await expect(sheet(page).getByText("How does their university grade?")).toHaveCount(0);
  // A grade that fits the scale from the start (the audit of 29 Sep 2026: 12 on a scale out of 4 was refused at once).
  await expect(sheet(page).getByLabel("The grade they reach")).toHaveValue("3");
  await sheet(page).getByLabel("The grade they reach").fill("3.5");
  await expect(sheet(page).getByRole("button", { name: /^Done$/ })).toBeEnabled();
});
