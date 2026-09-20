import { expect, test } from "@playwright/test";
import { FORBIDDEN_WORDS } from "../../src/consumer-words";

/** Every screen a person can reach without signing in. The judges page is excluded by design: it is the
 *  one place allowed to show a contract. */
const CONSUMER_PAGES = ["/", "/fund", "/privacy", "/legal"];

test.describe("the screens a person meets", () => {
  for (const path of CONSUMER_PAGES) {
    test(`${path} renders, reads one handed, and says no forbidden word`, async ({ page }) => {
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(String(error)));
      const response = await page.goto(path);
      expect(response?.status(), `${path} answered`).toBeLessThan(400);

      // Something the person can actually read, not a blank shell.
      await expect(page.locator("main")).toBeVisible();
      const text = (await page.locator("main").innerText()).trim();
      expect(text.length, `${path} has readable text`).toBeGreaterThan(40);

      // The words the user must never see, checked on what React actually rendered.
      const found = text.match(new RegExp(FORBIDDEN_WORDS.source, "gi")) ?? [];
      expect(found, `${path} shows forbidden words`).toEqual([]);

      // One handed on a phone: nothing may push the page sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);

      expect(failures, `${path} threw in the browser`).toEqual([]);
    });
  }

  /**
   * Rewritten twice for the same decision, each time because the product went further with it. On 15 Sep the home
   * page stopped meeting a first visit with a passkey; on 19 Sep it stopped offering a way to a gift and started
   * being one (the product vision, D110). What is asserted is the same thing from closer in: the first screen is the
   * object itself, and the account waits until money does.
   */
  test("a first visit meets the gift itself, not a way to one and not an account", async ({ page }) => {
    await page.goto("/");
    // The card is the body of the page, and it reads as a gift: a title, and the word missing from each case where
    // that word will be (the drawn card of 19 Sep 2026, section 2).
    const card = page.locator("main section").first();
    await expect(card.getByText("Your gift", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: /Who is it for/i })).toBeVisible();
    for (const missing of ["what they will do", "for how long"]) {
      await expect(card.getByText(missing, { exact: true })).toHaveCount(1);
    }
    await expect(card.getByText("$0.00", { exact: true })).toBeVisible();
    // The promise above the card, and the line under it, in the words the mockups of 19 Sep 2026 write them.
    await expect(page.getByRole("heading", { name: /Money that arrives as they earn it/i })).toBeVisible();
    await expect(page.getByText(/what they miss comes back to you/i)).toBeVisible();
    // Nothing to pay for until the card says something: the action is there, shut, saying what it waits for.
    await expect(page.getByRole("button", { name: /^Pay /i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Fill the four to pay/i })).toBeDisabled();
    // The one door, in the header rather than in the body, named for both of the things it does (brief, section 7).
    await expect(page.getByRole("button", { name: /^Sign in or create account$/i })).toBeVisible();
    // No passkey prompt on the home page at all, and nothing claiming a session that does not exist.
    await expect(page.getByRole("button", { name: /Create my account/i })).toHaveCount(0);
    await expect(page.getByText("You are signed in.")).toHaveCount(0);
  });

  test("a case of the card opens in a sheet over it, and closing the sheet leaves the page usable", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await card.getByRole("button").first().click();
    const sheet = page.locator("dialog.sheet[open]");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /Who is it for/i })).toBeVisible();
    // The card is still there behind it: a sheet is not a page.
    await expect(card).toBeVisible();
    await sheet.getByLabel(/Their first name/i).fill("Léa");
    await sheet.getByLabel(/Your name/i).fill("Mum");
    await sheet.getByRole("button", { name: /^Done$/ }).click();
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
    // And the card says what was answered, so the object changed under the person's eyes.
    await expect(card.getByText("For Léa", { exact: true })).toBeVisible();
  });

  /**
   * A sheet stops at 74 % of the height (D113), so on a phone the list of conditions carries on past its edge. What
   * was measured on 20 Sep 2026 is that it said nothing about it: the fourth choice was cut clean against the edge
   * of the action and read as the last one. This holds the two halves of the answer at every width, and asks
   * nothing about which width scrolls: where the questions fit, nothing is drawn.
   */
  test("a sheet says when its questions carry on past its edge, and its action never leaves the frame", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await card.getByRole("button").nth(1).click();
    const sheet = page.locator("dialog.sheet[open]");
    const body = sheet.locator(".sheet-body");
    const done = sheet.getByRole("button", { name: /^Done$/ });
    const height = page.viewportSize()!.height;
    const actionIsWhole = async () => {
      const box = (await done.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    };
    await actionIsWhole();

    const carriesOn = await body.evaluate((element) => element.scrollHeight > element.clientHeight + 2);
    if (!carriesOn) {
      await expect(body).toHaveAttribute("data-more", "none");
      return;
    }
    await expect(body).toHaveAttribute("data-more", "below");
    await body.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    // At the end of the list there is nothing below any more, and the last choice is whole rather than cut.
    await expect(body).toHaveAttribute("data-more", "above");
    await actionIsWhole();
    const last = sheet.getByRole("radio").last();
    const [choice, frame] = [(await last.boundingBox())!, (await body.boundingBox())!];
    expect(choice.y + choice.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  });

  /**
   * The catalogue, as chooser.html draws it on 20 Sep 2026: one line per condition, the verification sentence only
   * under the one that is chosen, and the list opening at its top. What it replaces was measured on production the
   * same day: a list of 720 pixels in a window of 524, opening at 196, two conditions of six whole.
   */
  test("the catalogue is read by its titles, and says what it proves about the one being chosen", async ({ page }) => {
    await page.goto("/");
    await page.locator("main section").first().getByRole("button").nth(1).click();
    const sheet = page.locator("dialog.sheet[open]");
    const body = sheet.locator(".sheet-body");
    // A sheet opens at the top of what it says, never in the middle of it.
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    // The sheet takes the screen's own width up to its cap: a dialog's own max-width inset it by 38 pixels on a
    // phone, and on a phone it is flush with both edges, as the image draws it.
    const [box, width] = [(await sheet.boundingBox())!, page.viewportSize()!.width];
    expect(box.width).toBeGreaterThanOrEqual(Math.min(width, 560) - 1);
    if (width <= 560) expect(box.x).toBeLessThanOrEqual(1);

    // Nothing explains itself until it is chosen: every row is its title, and the register's own sentences are absent.
    const conditions = sheet.getByRole("radio");
    await expect(conditions).not.toHaveCount(0);
    const explained = async () => body.evaluate((element) => [...element.querySelectorAll("label span span + span")].length);
    expect(await explained()).toBe(0);

    // Choosing one shows that condition's own questions; coming back shows the list with that one alone explained.
    await conditions.first().click();
    await sheet.getByRole("button", { name: /change/i }).click();
    await expect(sheet.getByRole("radio").first()).toBeChecked();
    expect(await explained()).toBe(1);
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
  });

  /**
   * The other end of the same decision: the gift is composed on the card, so the paying screen has nothing to ask
   * about it. Reached with nothing filled in, it says so and sends the person back to the card rather than asking
   * the four questions a second time.
   */
  test("the paying screen asks nothing about the gift, and says so when there is none", async ({ page }) => {
    await page.goto("/fund");
    await expect(page.getByRole("heading", { name: /Nothing to pay for yet/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to the card/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Create my account/i })).toHaveCount(0);
    await expect(page.getByText(/How much, in dollars/i)).toHaveCount(0);
  });

  test("every tap target is big enough for a thumb", async ({ page }) => {
    await page.goto("/");
    const targets = page.locator("main button, main a");
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      if (!box) continue;
      const label = (await targets.nth(index).innerText()).slice(0, 40);
      // The floor platform guidance gives for a thumb, rather than a number we invented.
      expect(box.height, `"${label}" is too short to tap`).toBeGreaterThanOrEqual(44);
    }
  });
});
