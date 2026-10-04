import { expect, test, type Page } from "@playwright/test";
import { TERMS, daily, serve } from "./gift-fixtures";
import { answerTheChain, json, makeAnAccount, neverAskedToBeTold, profile } from "./gift-kit";

/**
 * A sheet stands on the axis of the page it covers, and is as wide as that page's column, margins included (the
 * founder, 4 Oct 2026).
 *
 * What he saw on a gift's page on a computer: the sheet "Your gift, your call." about 44 pixels right of the card, and
 * wider than it. The offset a sheet is placed by was the rail's width on every page from 840, taken back for one kind
 * of page at a time (20 Sep 2026, then D137), and a task or a document, which draw no rail, kept it. The rule now: the
 * offset is zero everywhere but beside the rail, and a sheet is the width of its page's column.
 *
 * Held here for every kind of page, at 1440 by 900: the centre of an open sheet is the centre of the column, and its
 * width is the column's. Where a page has a sheet of its own it is that one that is measured; everywhere, a sheet
 * drawn in the page for the measure, so a kind of page without a sheet today is held too.
 */
const DESK = { width: 1440, height: 900 };
const RAIL = 88;
/** The card's column: the card at 440 and the page's margin on each side, 24 from 600. */
const CARD_COLUMN = 440 + 2 * 24;

type Measure = { kind: string; own: boolean; column: { centre: number; width: number }; sheet: { centre: number; width: number } };

/** The page's column and the sheet over it, as the browser lays them out. A string: a function sent to the page loses its name on the way. */
const MEASURE = `(() => {
  const main = document.querySelector("main");
  let sheet = document.querySelector("dialog.sheet[open]");
  const own = sheet !== null;
  if (!sheet) {
    sheet = document.createElement("dialog");
    sheet.className = "sheet";
    sheet.textContent = "A sheet drawn for the measure.";
    main.parentElement.appendChild(sheet);
    sheet.showModal();
  }
  const page = main.getBoundingClientRect();
  const over = sheet.getBoundingClientRect();
  return { kind: main.parentElement.dataset.pageKind, own, column: { centre: page.left + page.width / 2, width: page.width }, sheet: { centre: over.left + over.width / 2, width: over.width } };
})()`;

async function measure(page: Page): Promise<Measure> {
  await expect(page.locator("main")).toHaveCount(1);
  await page.waitForTimeout(300);
  return (await page.evaluate(MEASURE)) as Measure;
}

/** On the axis, and as wide as the column: `width` when the column is not the page's own width (the page without an account). */
function held(where: string, read: Measure, width: number = read.column.width): void {
  expect(Math.abs(read.sheet.centre - read.column.centre), `${where}: the sheet's centre (${read.sheet.centre}) is the column's (${read.column.centre})`).toBeLessThanOrEqual(1);
  expect(Math.abs(read.sheet.width - width), `${where}: the sheet is as wide as the column (${read.sheet.width} for ${width})`).toBeLessThanOrEqual(1);
}

test.describe("a sheet stands on the axis of the page it covers, at 1440", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each case opens its own window");
  test.setTimeout(150_000);

  test("without an account: the page for nobody, a task and every document", async ({ browser, baseURL }) => {
    const nobody = await profile(browser, baseURL, DESK, { passkey: false });
    const { page } = nobody;
    // The page for nobody draws no rail: its column, as wide as its widest line, is centred in the window, and what a
    // sheet covers there is the card.
    await page.goto("/");
    // The line that runs under the card is wider than a sheet: it shows while no sheet is open, and not under one,
    // where its two ends stood out on either side (the founder, 4 Oct 2026).
    const running = page.locator("[data-goals-going-by]");
    await expect(running).toHaveCSS("visibility", "visible");
    const home = await measure(page);
    expect(home.kind).toBe("destination");
    expect(Math.abs(home.column.centre - DESK.width / 2)).toBeLessThanOrEqual(1);
    held("/ for nobody", home, CARD_COLUMN);
    await expect(running).toHaveCSS("visibility", "hidden");
    // Gifts and Me without an account draw no rail either, and keep no room for one: they stood 44 pixels to the right.
    for (const path of ["/gifts", "/me"]) {
      await page.goto(path);
      const read = await measure(page);
      expect(read.kind, path).toBe("destination");
      expect(Math.abs(read.column.centre - DESK.width / 2), `${path} without an account: the column is centred in the window`).toBeLessThanOrEqual(1);
      held(path, read, CARD_COLUMN);
    }
    // A task: no rail, and none kept room for.
    await page.goto("/fund");
    const fund = await measure(page);
    expect(fund.kind).toBe("task");
    expect(Math.abs(fund.column.centre - DESK.width / 2)).toBeLessThanOrEqual(1);
    held("/fund", fund);
    // Every document, the judges page among them.
    for (const path of ["/judges", "/privacy", "/legal", "/help", "/what-viky-can-check", "/add-your-university"]) {
      await page.goto(path);
      const read = await measure(page);
      expect(read.kind, path).toBe("document");
      expect(Math.abs(read.column.centre - DESK.width / 2), `${path}: the column is centred in the window`).toBeLessThanOrEqual(1);
      held(path, read);
    }
    await nobody.context.close();
  });

  test("with an account: beside the rail on a destination, and in the window's middle on a task", async ({ browser, baseURL }) => {
    const person = await profile(browser, baseURL, DESK);
    const { page, context } = person;
    await answerTheChain(context, { ausd: 30_000_000n, mon: 0n, usdc: 0n });
    await page.route("**/api/rails/where**", (route) =>
      route.fulfill(json({ country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr", waysOut: { Ramp: "serves", Mercuryo: "serves" }, waysIn: {}, card: { offered: true, country: "fr" }, out: { bank: { method: "SEPA", currency: "EUR" }, cardSmallest: null } })),
    );
    await page.route("**/api/gifts/earned", (route) => route.fulfill(json({ gifts: [] })));
    await page.route("**/api/exit/open", (route) => route.fulfill(json({ open: null })));
    await makeAnAccount(person);
    // The three destinations: the rail is drawn, and the column and every sheet over it stand beside it. One column
    // for the three, the gift card's with its margins: it was wider on Gifts and Me, and changed from tab to tab.
    for (const path of ["/", "/gifts", "/me"]) {
      await page.goto(path);
      const read = await measure(page);
      expect(read.kind, path).toBe("destination");
      expect(Math.abs(read.column.centre - (DESK.width + RAIL) / 2), `${path}: the column is centred in what the rail leaves`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.column.width - CARD_COLUMN), `${path}: the column is the card's (${read.column.width})`).toBeLessThanOrEqual(1);
      held(path, read);
    }
    // Home's own sheet, the one that pays: the same axis, and the card's column.
    await page.goto("/");
    const card = page.locator('section[aria-labelledby="offer-card"]');
    await card.getByLabel("Their first name").fill("Boo");
    await card.locator("[data-card-action]").click();
    await expect(page.locator("dialog.sheet[open]")).toBeVisible();
    const pay = await measure(page);
    expect(pay.own, "the pay sheet itself").toBe(true);
    held("the pay sheet", pay, CARD_COLUMN);
    const cardBox = (await card.boundingBox())!;
    expect(Math.abs(pay.sheet.centre - (cardBox.x + cardBox.width / 2)), "and it is the card's own axis").toBeLessThanOrEqual(1);
    // The withdrawal, a task: no rail, the window's middle.
    await page.goto("/cash-out");
    await expect(page.getByRole("button", { name: "Send to my bank" })).toBeVisible();
    const out = await measure(page);
    expect(out.kind).toBe("task");
    expect(Math.abs(out.column.centre - DESK.width / 2)).toBeLessThanOrEqual(1);
    held("/cash-out", out);
    await context.close();
  });

  test("a gift's page: 'Your gift, your call.' stands over its card, where the founder saw it 44 pixels to the right", async ({ browser, baseURL }) => {
    const GIFT = "4";
    const person = await profile(browser, baseURL, DESK);
    const { page, context } = person;
    await neverAskedToBeTold(context);
    await serve(page, GIFT, () => daily(GIFT, "recipient"), TERMS.daily);
    await makeAnAccount(person);
    await page.goto(`/g/${GIFT}`);
    await page.locator('[data-decide="stop"]').click();
    await expect(page.getByRole("dialog", { name: "Your gift, your call." })).toBeVisible();
    const read = await measure(page);
    expect(read.kind).toBe("task");
    expect(read.own, "the page's own sheet").toBe(true);
    expect(Math.abs(read.column.centre - DESK.width / 2)).toBeLessThanOrEqual(1);
    held(`/g/${GIFT}`, read);
    // The card is the column less its margins: the sheet is centred on it, and wider by the margins alone.
    const cardBox = (await page.locator("section.gift-card-placed").first().boundingBox())!;
    expect(Math.abs(read.sheet.centre - (cardBox.x + cardBox.width / 2)), "the sheet's centre is the card's").toBeLessThanOrEqual(1);
    expect(Math.abs(read.sheet.width - (cardBox.width + 2 * 24)), "wider than the card by the page's margins, as on a phone").toBeLessThanOrEqual(1);
    await context.close();
  });
});
