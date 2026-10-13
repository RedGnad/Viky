import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * "Which university?" (D313, the founder, 29 and 30 Sep 2026): one line "At university" whose questions ask what they
 * will show; no country to choose before the list, which opens on every country, since the one paying is often not in
 * the student's; a country as a chip in its own sheet; one field that searches the whole list. The defect the country
 * sheet pins: choosing a country closed both sheets, because React carries a nested dialog's close up to its parent's
 * handler. The list is answered here, so the screen is measured and not the table.
 *
 * One list since 10 Oct 2026 (the founder's mockup): the field says how many it searches, a university whose students
 * show their page today comes first with a mark on its line, and a search that found nothing says so and what to try
 * (it led to the page a university is asked from until 13 Oct 2026). Since 11 Oct 2026 every other line of an enrolment gift says "Ready in 2 days", a gift on
 * results says no time on any line, and under the university chosen stands the gift's path, stop by stop.
 */
const sheet = (page: Page) => page.locator("dialog.sheet[open]");

const SENEGAL = [
  // Read for enrolment today, and for nothing else: its results page has no provider yet.
  { pair: "ucad-sn", title: "Université Cheikh Anta Diop", issuer: "Senegal", country: "SN", ready: ["enrolment"], path: { enrolment: "seconds" }, scale: null },
  { pair: "ugb-sn", title: "Université Gaston Berger", issuer: "Senegal", country: "SN", ready: [], scale: null },
];
const LAGOS = { pair: "unilag-ng", title: "University of Lagos", issuer: "Nigeria", country: "NG", ready: [], scale: null };
/** The one list, by the name it is read aloud by, and its lines as they read: the name, the country, the mark if any. */
const list = (page: Page) => sheet(page).getByRole("group", { name: "Universities" });
const lines = (page: Page) => list(page).locator("label");
/** The search field, whatever number it says it searches. */
const SEARCH = /^Search (\d[\d,]* )?universit(y|ies)$/;
/** The path under the university chosen: each stop's label, with what is written under it. */
async function pathUnder(chosen: Locator): Promise<string[]> {
  const stops = chosen.locator("ol.university-path li.university-stop");
  const read: string[] = [];
  for (let index = 0; index < (await stops.count()); index += 1) {
    const label = ((await stops.nth(index).locator(".university-stop-label").textContent()) ?? "").trim();
    const time = ((await stops.nth(index).locator(".university-stop-time").textContent()) ?? "").trim();
    read.push(time ? `${label} (${time})` : label);
  }
  return read;
}

async function answerTheList(page: Page, list: readonly object[] = [...SENEGAL, LAGOS]) {
  await page.route(/\/api\/portals\?all=1$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: list }) }));
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

test("one list opens on every country, the field says how many it searches, and the ready come first with their mark", async ({ page }) => {
  await answerTheList(page);
  await openAtUniversity(page);
  await expect(sheet(page).getByRole("heading", { name: "Which university" })).toBeVisible();
  const modes = sheet(page).getByRole("group", { name: "What will they show?" });
  await expect(modes.getByRole("radio", { name: "Enrolled" })).toBeChecked();
  // Every country, and every line says its own.
  await expect(sheet(page).getByRole("button", { name: /All countries/ })).toBeVisible();
  // The count is in the field, and nothing counts or sorts the universities into ready and waiting.
  await expect(sheet(page).getByLabel("Search 3 universities")).toBeVisible();
  await expect(sheet(page).getByText(/added on request|more,|Yours isn't here|Add your university|Ask for it/)).toHaveCount(0);
  // One list: the one whose students show their page today first, with its mark, then the others by name, each
  // saying when: no line of an enrolment gift reads as closed.
  await expect(lines(page)).toHaveText(["Université Cheikh Anta DiopSenegalReady today", "Université Gaston BergerSenegalReady in 2 days", "University of LagosNigeriaReady in 2 days"]);
  await expect(list(page).locator("legend")).toHaveClass(/sr-only/);
  // The mark stands at the end of its line, beside the name and not under it.
  const name = (await lines(page).first().getByText("Université Cheikh Anta Diop").boundingBox())!;
  const mark = (await lines(page).first().getByText("Ready today").boundingBox())!;
  expect(mark.x, "the mark is to the right of the name").toBeGreaterThanOrEqual(name.x + name.width - 1);
  // The search runs on the whole list, over every country.
  const search = sheet(page).getByLabel(SEARCH);
  await search.fill("cheikh");
  await expect(lines(page)).toHaveText(["Université Cheikh Anta DiopSenegalReady today"]);
  await search.fill("lagos");
  await expect(lines(page)).toHaveText(["University of LagosNigeriaReady in 2 days"]);
  // A search that finds nothing says so and what to try, and leads nowhere (the founder, 13 Oct 2026): no gift can be
  // offered on a university the list does not hold.
  await search.fill("sorbonne");
  await expect(sheet(page).getByText("No university by those words. Try another word of its name.", { exact: true })).toBeVisible();
  await expect(sheet(page).locator('a[href="/add-your-university"]')).toHaveCount(0);
  await expect(sheet(page).getByText(/Ask for it|in the list yet/)).toHaveCount(0);
  await expect(list(page)).toHaveCount(0);
  await search.fill("lagos");
  await expect(sheet(page).locator("[data-nothing-found]")).toHaveCount(0);
  // Choosing folds the list into the one chosen, with the gift's path under it, and Change opens it again.
  await list(page).getByText("University of Lagos").click();
  const chosen = sheet(page).locator("[data-university-chosen]");
  await expect(chosen.getByText("University of Lagos")).toBeVisible();
  await expect(chosen.getByText("Nigeria")).toBeVisible();
  // A university nobody has given at yet: the four stops, the two small ones with their time, and what a first gift adds.
  await expect.poll(() => pathUnder(chosen)).toEqual(["Set up (once, 2 days)", "Shown", "Checked (once, 1 day)", "Theirs"]);
  await expect(chosen.locator("ol.university-path .university-path-seat")).toHaveCount(0);
  await expect(chosen.locator("[data-university-when]")).toHaveText("First gift at this university: the next ones skip the two small stops. The money waits in their name meanwhile.");
  await expect(sheet(page).getByLabel(SEARCH)).toHaveCount(0);
  // What they will show changes, and the university stays.
  await modes.getByText("The year passed", { exact: true }).click();
  await expect(modes.getByRole("radio", { name: "The year passed" })).toBeChecked();
  await expect(chosen.getByText("University of Lagos")).toBeVisible();
  // A gift on results starts at Results, and draws no setting up.
  await expect.poll(() => pathUnder(chosen)).toEqual(["Results (end of year)", "Shown", "Checked (once, 1 day)", "Theirs"]);
  await expect(chosen.locator("[data-university-when]")).toHaveText("The money waits in their name meanwhile.");
  await chosen.getByRole("button", { name: /Change/ }).click();
  await expect(sheet(page).getByRole("button", { name: /All countries/ })).toBeVisible();
  // Ready today is said of what the gift asks: for a year passed, the university read for enrolment carries no mark,
  // and stands where its own name puts it. No line of a gift on results says a time: it waits for the year's results.
  await expect(lines(page)).toHaveText(["Université Cheikh Anta DiopSenegal", "Université Gaston BergerSenegal", "University of LagosNigeria"]);
  await modes.getByText("Enrolled", { exact: true }).click();
  await expect(lines(page).first()).toHaveText("Université Cheikh Anta DiopSenegalReady today");
  // And once chosen, one whose students show their page today has the road alone, with nothing to add under it.
  await list(page).getByText("Université Cheikh Anta Diop").click();
  await expect.poll(() => pathUnder(chosen)).toEqual(["Shown", "Theirs (in seconds)"]);
  await expect(chosen.locator("[data-university-when]")).toHaveCount(0);
});

test("a country chosen in the chip's sheet narrows the list, closes that sheet only, and every country comes back first", async ({ page }) => {
  await answerTheList(page);
  await openAtUniversity(page);
  await sheet(page).getByRole("button", { name: /All countries/ }).click();
  await expect(sheet(page)).toHaveCount(2);
  await expect(sheet(page).last().getByRole("radio").first()).toBeChecked();
  await expect(sheet(page).last().getByText("All countries", { exact: true })).toBeVisible();
  await sheet(page).last().getByText("Nigeria", { exact: true }).click();
  await expect(sheet(page)).toHaveCount(1);
  await expect(sheet(page).getByRole("button", { name: /In Nigeria/ })).toBeVisible();
  const all = list(page);
  await expect(all.getByText("University of Lagos")).toBeVisible();
  // The field counts what it searches now: the country's own.
  await expect(sheet(page).getByLabel("Search 1 university")).toBeVisible();
  await expect(sheet(page).getByText("Université Gaston Berger")).toHaveCount(0);
  await expect(all.getByText("Nigeria", { exact: true })).toHaveCount(0, { timeout: 1000 });
  // Nothing found inside one country names it, and the other place to look.
  await sheet(page).getByLabel(SEARCH).fill("cheikh");
  await expect(sheet(page).getByText("No university by those words in Nigeria. Try another word of its name, or all countries.", { exact: true })).toBeVisible();
  await sheet(page).getByLabel(SEARCH).fill("");
  await sheet(page).getByRole("button", { name: /In Nigeria/ }).click();
  await sheet(page).last().getByText("All countries", { exact: true }).click();
  await expect(sheet(page).getByText("Université Gaston Berger")).toBeVisible();
});

test("every university is listed, drawn a hundred at a time as the end comes near, and searched whole at once", async ({ page }) => {
  await answerTheList(page, Array.from({ length: 250 }, (_, index) => ({ ...SENEGAL[1], pair: `u${index}-sn`, title: `Université ${String(index).padStart(3, "0")}` })));
  await openAtUniversity(page);
  const rows = list(page).getByRole("radio");
  await expect(rows).toHaveCount(100);
  for (let turn = 0; turn < 6 && (await rows.count()) < 250; turn += 1) {
    await sheet(page).locator(".sheet-body").first().evaluate((body) => body.scrollTo({ top: body.scrollHeight }));
    await page.waitForTimeout(300);
  }
  await expect(rows).toHaveCount(250);
  await sheet(page).locator(".sheet-body").first().evaluate((body) => body.scrollTo({ top: 0 }));
  await sheet(page).getByLabel("Search 250 universities").fill("240");
  await expect(rows).toHaveCount(1);
  await expect(sheet(page).getByText("Université 240")).toBeVisible();
});

test("pressing the search field moves nothing under the pointer, so no university is chosen by it", async ({ page }) => {
  // The founder, 30 Sep 2026: the list scrolled up on focus, under a pointer still pressed, and the university it then
  // stood on was chosen on release, in Safari, the first one of the country every time.
  await answerTheList(page, Array.from({ length: 30 }, (_, index) => ({ ...SENEGAL[1], pair: `u${index}-sn`, title: `Université ${index}` })));
  await openAtUniversity(page);
  await list(page).waitFor();
  const field = sheet(page).getByLabel("Search 30 universities");
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
