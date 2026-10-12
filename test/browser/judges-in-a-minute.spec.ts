import { expect, test } from "@playwright/test";

/**
 * The judges page reads in a minute or two (the founder, 12 Oct 2026). Its first block is seven short lines; every
 * fold under it opens on a few lines or a table, and each long text is whole one level down, under a line that carries
 * its title. Held here on the page as a browser draws it: what a fold shows when it is opened, counted in words, with
 * everything a closed row holds left out, as the eye leaves it out.
 *
 * VIKY_JUDGES_CAPTURES=<folder> photographs the page closed, then three folds opened, at 390 by 844 and at 1440 by
 * 900, by day and after dark.
 */
const SHOTS = process.env.VIKY_JUDGES_CAPTURES;
/**
 * The most words a fold shows when it opens: its lines, its table, and the titles of its rows. The widest is "What each
 * condition proves", three cards and a line a condition: 448 words on 12 Oct 2026, where it opened on 5,130.
 */
const WORDS_AT_MOST = 500;
/** The first block: read in a minute at the pace of a careful reader, 240 words a minute. */
const MINUTE_AT_MOST = 300;

/** The words an element shows, asked of the page as text: what a closed row holds is not drawn, so it is not counted. */
const wordsShown = (selector: string, at = 0) => `((document.querySelectorAll(${JSON.stringify(selector)})[${at}] || {}).innerText || "").split(/\\s+/).filter(Boolean).length`;
/** Opens or closes the fold of a section, by its place among them. */
const fold = (selector: string, at: number, open: boolean) => `document.querySelectorAll(${JSON.stringify(selector)})[${at}].querySelector("details").open = ${open}`;

test.describe("the judges page reads in a minute", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once, at one width");

  test("the first block is seven lines, and every fold opens on a few lines or a table", async ({ page }) => {
    await page.goto("/judges");
    const minute = page.locator("#minute");
    await expect(minute.locator("dl > dt")).toHaveText(["What it is", "Who it is for", "Who has used it", "Proven", "Why Monad", "Where it runs", "One command"]);
    const read = Number(await page.evaluate(wordsShown("#minute")));
    expect(read, `the first block shows ${read} words`).toBeLessThanOrEqual(MINUTE_AT_MOST);
    // What the block said at length is whole, one level down.
    await expect(minute.locator("details.judges-row > summary")).toHaveText(["The same, at length"]);
    await expect(minute.getByText("Nobody profits from a missed day.")).toBeHidden();

    const said: string[] = [];
    const sections = page.locator("section.judges-section");
    const count = await sections.count();
    // Every fold the build under test draws: one that names no contract draws fewer than production does.
    expect(count).toBeGreaterThanOrEqual(12);
    for (let at = 0; at < count; at += 1) {
      const section = sections.nth(at);
      const id = await section.getAttribute("id");
      await page.evaluate(fold("section.judges-section", at, true));
      const words = Number(await page.evaluate(wordsShown("section.judges-section", at)));
      said.push(`${id} ${words}`);
      await page.evaluate(fold("section.judges-section", at, false));
    }
    console.log(`WORDS SHOWN: ${said.join(", ")}`);
    for (const one of said) expect(Number(one.split(" ")[1]), `each fold opens on a few lines or a table: ${said.join(", ")}`).toBeLessThanOrEqual(WORDS_AT_MOST);
  });

  test("a row opens on the whole of its text, and the conditions stand as three ways of reading", async ({ page }) => {
    await page.goto("/judges");
    const risks = page.locator("#risks");
    await page.evaluate(fold("#risks", 0, true));
    await expect(risks.locator(".judges-group > h3")).toHaveText([/^The sources' terms \d+$/, /^What a proof is worth \d+$/, /^Viky's own keys and steps \d+$/, /^The ways out \d+$/]);
    const first = risks.locator("details.judges-row").first();
    await expect(first.locator("summary")).toHaveText("Duolingo's terms");
    await expect(first.getByText("You may not use any data mining")).toBeHidden();
    await first.locator("summary").click();
    await expect(first.getByText("You may not use any data mining")).toBeVisible();

    const conditions = page.locator("#conditions");
    await page.evaluate(fold("#conditions", 0, true));
    await expect(conditions.locator(".judges-stand")).toHaveCount(3);
    await expect(conditions.locator(".judges-stand > p:first-child")).toHaveText([/^A public page or API, read under attestation\s*12 conditions$/, /^The person's own account, shown by them\s*4 conditions$/, /^An account the person connects\s*1 condition$/]);
    // The three cards count the lines offered, seventeen as every other page says; the line its source closed is not
    // one of them, and its card still names it, closed, with its reason.
    const connected = conditions.locator('[data-way-of-reading="connected"]');
    await expect(connected).toContainText("Active minutes on Fitbit.");
    await expect(connected).toContainText("Strava is closed: its developer program asks for a paid subscription.");
    // A row a condition: its name, then its source, its state and its count of real proofs.
    await expect(conditions.locator("details.judges-row")).toHaveCount(18);
    await expect(conditions.locator("details.judges-row > summary").filter({ hasText: "Kilometres a day, on Strava" })).toContainText("closed: Strava's developer program asks for a paid subscription");
  });

  for (const [name, viewport] of [["390", { width: 390, height: 844 }], ["1440", { width: 1440, height: 900 }]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`photographs at ${name}, ${scheme}`, async ({ browser, baseURL }) => {
        test.skip(!SHOTS, "VIKY_JUDGES_CAPTURES names the folder");
        // With less movement asked for, a page stands whole from its first image: nothing waits to be scrolled to.
        const context = await browser.newContext({ baseURL, viewport, colorScheme: scheme, deviceScaleFactor: 1, serviceWorkers: "block", reducedMotion: "reduce" });
        const page = await context.newPage();
        await page.goto("/judges");
        const tag = `${name}-${scheme === "light" ? "day" : "night"}`;
        await page.screenshot({ path: `${SHOTS}/${tag}-0-closed.png`, fullPage: true });
        for (const id of ["conditions", "risks", "try", "reading"]) {
          const section = page.locator(`#${id}`);
          await page.evaluate(fold(`#${id}`, 0, true));
          // A fold opens with a fade: photographed once it has ended.
          await page.waitForTimeout(1_000);
          await section.screenshot({ path: `${SHOTS}/${tag}-${id}.png` });
          await page.evaluate(fold(`#${id}`, 0, false));
        }
        await context.close();
      });
    }
  }
});
