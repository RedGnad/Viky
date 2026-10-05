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
    // One line a currency, the two CFA francs sharing theirs since they read alike (5 Oct 2026).
    const drawn = codes.length - (codes.includes("XOF") && codes.includes("XAF") ? 1 : 0);
    await expect(lines).toHaveCount(drawn);
    // Each one, by its own code, and the one being read is the one pressed.
    for (const code of codes.slice(0, 4)) await expect(sheet(page).getByText(code, { exact: true })).toBeVisible();
    await expect(sheet(page).locator('li button[aria-pressed="true"]')).toHaveCount(1);
    // The filled mark of the choice, on that line and on no other (D209); left to right, the sign, the code, the name.
    await expect(sheet(page).locator('[data-choice="chosen"]')).toHaveCount(1);
    await expect(sheet(page).locator('li button[aria-pressed="true"] [data-choice="chosen"]')).toHaveCount(1);
    await expect(sheet(page).locator('[data-choice="open"]')).toHaveCount(drawn - 1);
    const first = await sheet(page).locator("li button").first().evaluate((line) => [...line.querySelectorAll(":scope > span")].map((part) => (part.textContent ?? "").trim()));
    expect(first[0]).toBe("");
    expect(first[2]).toMatch(/^[A-Z]{3}/);
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

  test("the CFA franc is one line of the list, under C, and an amount in francs is written as francs are", async ({ browser, baseURL, viewport }) => {
    test.skip((viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
    // The founder, 5 Oct 2026: he looked for the CFA franc in the list and took it for gone. It was the last line,
    // "West African CFA Franc" after the US dollar, written "F CFA 5,000" where the people who count in it read
    // "5 000 FCFA" (Orange Money's price list and Wave's terms in Côte d'Ivoire). Then: the two francs read alike, so
    // they are one line, and no line of the list takes two on a phone.
    const abidjan = await browser.newContext({ baseURL, serviceWorkers: "block", viewport: { width: 390, height: 844 }, locale: "en-GB", extraHTTPHeaders: { "x-vercel-ip-country": "CI" } });
    const page = await abidjan.newPage();
    await page.goto("/");
    await expect(key(page)).toHaveAttribute("aria-label", "Read in another currency, CFA franc now");
    // The control that opens the list keeps its place in front of the field (21 Sep 2026), and reads "FCFA".
    await expect(key(page)).toHaveText("FCFA");
    const [control, field] = [(await key(page).boundingBox())!, (await page.locator('#offer input[inputmode="decimal"]').boundingBox())!];
    expect(control.x + control.width).toBeLessThanOrEqual(field.x + 1);
    // A written amount has its letters after it and its thousands a space apart, wherever the card writes one.
    const francs = /^\d{1,3}(\s\d{3})*\sFCFA$/;
    await expect(page.getByRole("button", { name: /^Send \d{1,3}(\s\d{3})*\sFCFA$/ })).toBeVisible();
    // Every leaf of the card that names the franc, the closed list of currencies apart: that one names it by its name.
    const written = await page.locator("#offer").evaluate((card) => [...card.querySelectorAll("*")].filter((one) => one.children.length === 0 && !one.closest("dialog") && /FCFA|CFA/.test(one.textContent ?? "")).map((one) => (one.textContent ?? "").trim()));
    expect(written.length).toBeGreaterThan(2);
    // The control's own letters stand alone; everywhere else the letters follow a figure, alone or inside a sentence
    // ("667 FCFA a day", "Send 20 000 FCFA").
    for (const one of written) expect(one === "FCFA" || !one.replace(/\d{1,3}(\s\d{3})*\sFCFA/g, "").includes("CFA"), `"${one}" is written as francs are`).toBe(true);
    expect(await page.locator("#offer").innerText()).not.toMatch(/F\sCFA|XOF/);
    // In the list: one line for the two francs, by the name somebody looks for, with both codes, marked as the one
    // being read, and what the amount is worth.
    const codes = await offered(page);
    await key(page).click();
    const lines = sheet(page).locator("li button");
    const mine = lines.filter({ hasText: "CFA franc" });
    await expect(mine).toHaveCount(1);
    await expect(mine).toHaveAttribute("aria-pressed", "true");
    const both = codes.includes("XOF") && codes.includes("XAF");
    expect(await mine.evaluate((line) => [...line.querySelectorAll(":scope > span")].map((part) => (part.textContent ?? "").trim()))).toEqual(["", "FCFA", `${both ? "XOF · XAF" : "XOF"}CFA franc`, expect.stringMatching(francs)]);
    await expect(sheet(page).getByText(/West African|Central African|West Africa|Central Africa|F\sCFA/)).toHaveCount(0);
    await expect(lines).toHaveCount(codes.length - (both ? 1 : 0));
    await abidjan.close();

    // Read from somewhere else, on the two phones measured: the franc is among the C's, read whole, and every line
    // of the list is one line high. Left to wrap for a few hours that day, eight names took two lines at 360.
    for (const width of [360, 390]) {
      const paris = await browser.newContext({ baseURL, serviceWorkers: "block", viewport: { width, height: 844 }, locale: "fr-FR", extraHTTPHeaders: { "x-vercel-ip-country": "FR" } });
      const other = await paris.newPage();
      await other.goto("/");
      await key(other).click();
      await expect(sheet(other).getByText(/at the European Central Bank's rate of|exchange rate could not be read/)).toHaveCount(1);
      const read = await sheet(other)
        .locator("li button")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const name = row.querySelector<HTMLElement>("[data-currency-name]")!;
            return { name: name.textContent ?? "", whole: name.scrollWidth <= name.clientWidth + 1, high: Math.round(row.getBoundingClientRect().height) };
          }),
        );
      const names = read.map((row) => row.name);
      const franc = names.indexOf("CFA franc");
      expect(franc, `at ${width}: the franc is in the list`).toBeGreaterThanOrEqual(0);
      expect(names.filter((name) => /CFA/.test(name)), `at ${width}: on one line`).toEqual(["CFA franc"]);
      expect(read[franc].whole, `at ${width}: "CFA franc" is read whole`).toBe(true);
      if (names.length > 3) expect(franc, `at ${width}: not the last line any more`).toBeLessThan(names.length - 1);
      expect([...new Set(read.map((row) => row.high))], `at ${width}: every line of the list is one line high`).toHaveLength(1);
      await paris.close();
    }
  });

  test("the key is a thumb's size, and says what it does", async ({ page }) => {
    await page.goto("/");
    const box = (await key(page).boundingBox())!;
    // At least the 44 the founder asked for, and in fact the 48 every control in this product keeps.
    expect(Math.round(box.width * 100) / 100).toBeGreaterThanOrEqual(48);
    expect(Math.round(box.height * 100) / 100).toBeGreaterThanOrEqual(48);
    await expect(key(page)).toHaveAttribute("aria-label", /^Read in another currency, .+ now$/);
    await expect(key(page)).toHaveAttribute("aria-haspopup", "dialog");
    // Inside the field it wears the field's own hairline and no relief, its corners concentric with the field's
    // (D154, D257, D259): a slab inside a box read as two boxes, and a key's 2 px of ink was the darkest edge there.
    const worn = await key(page).evaluate((element) => ({ edge: getComputedStyle(element).borderTopWidth, relief: getComputedStyle(element).boxShadow, radius: getComputedStyle(element).borderTopLeftRadius }));
    expect(worn.edge).toBe("1px");
    expect(worn.relief).toBe("none");
    expect(worn.radius).toBe("13px");
  });
});
