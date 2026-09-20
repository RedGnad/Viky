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
  test("a first visit meets a gift already filled in, with one thing left to say", async ({ page }) => {
    await page.goto("/");
    // The card is the body of the page, and it is a plausible gift rather than four holes (the founder, 20 Sep 2026).
    const card = page.locator("main section").first();
    await expect(card.getByText("A gift from you", { exact: true })).toBeVisible();
    await expect(card.getByLabel(/Their first name/i)).toHaveValue("");
    await expect(card.getByLabel(/How much/i)).toHaveValue("30");
    await expect(card.getByRole("button", { name: "30 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    // The one empty field is the one Viky cannot guess, and it is where the cursor is.
    await expect(card.getByLabel(/Their first name/i)).toBeFocused();
    // The action says what it will take from the first second: the passkey is the door, not the button.
    await expect(page.getByRole("button", { name: /^Pay \$30\.00$/ })).toBeEnabled();
    // The promise above the card, and the line under it, in the words the mockups of 19 Sep 2026 write them.
    await expect(page.getByRole("heading", { name: /Money that arrives as they earn it/i })).toBeVisible();
    await expect(page.getByText(/what they miss comes back to you/i).first()).toBeVisible();
    // The one door, in the header rather than in the body, named for both of the things it does (brief, section 7).
    await expect(page.getByRole("button", { name: /^Sign in or create account$/i })).toBeVisible();
    // No passkey prompt on the home page at all, and nothing claiming a session that does not exist.
    await expect(page.getByRole("button", { name: /Create my account/i })).toHaveCount(0);
    await expect(page.getByText("You are signed in.")).toHaveCount(0);
  });

  test("the name, the amount and the length are typed on the card itself, with no sheet in the way", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await card.getByLabel(/Their first name/i).fill("Léa");
    await card.getByLabel(/How much/i).fill("45");
    await card.getByRole("button", { name: "90 days", exact: true }).click();
    // Nothing opened: the card is the form, and what was typed is on it.
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
    await expect(card.getByLabel(/Their first name/i)).toHaveValue("Léa");
    await expect(page.getByRole("button", { name: /^Pay \$45\.00$/ })).toBeEnabled();
    // A length that is not on a chip is typed in its place, and the three presets stay, so a person can come back.
    await card.getByRole("button", { name: /^Other$/ }).click();
    await card.getByLabel(/^Days$/i).fill("45");
    await expect(card.getByRole("button", { name: "90 days", exact: true })).toHaveAttribute("aria-pressed", "false");
    await card.getByRole("button", { name: "7 days", exact: true }).click();
    await expect(card.getByRole("button", { name: "7 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByLabel(/^Days$/i)).toHaveCount(0);
  });

  test("what they will do is a real choice, so it keeps its sheet", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await card.getByRole("button").filter({ hasText: /what they will do/i }).click();
    const sheet = page.locator("dialog.sheet[open]");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /What will they do/i })).toBeVisible();
    // The card is still there behind it: a sheet is not a page.
    await expect(card).toBeVisible();
    await sheet.getByRole("button", { name: /^Done$/ }).click();
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
  });


  test("a sheet says when its questions carry on past its edge, and its action never leaves the frame", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await card.getByRole("button").filter({ hasText: /what they will do/i }).click();
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
    await page.locator("main section").first().getByRole("button").filter({ hasText: /what they will do/i }).click();
    const sheet = page.locator("dialog.sheet[open]");
    const body = sheet.locator(".sheet-body");
    // A sheet opens at the top of what it says, never in the middle of it.
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    // The sheet takes the screen's own width up to its cap: a dialog's own max-width inset it by 38 pixels on a
    // phone, and on a phone it is flush with both edges, as the image draws it.
    const [box, width] = [(await sheet.boundingBox())!, page.viewportSize()!.width];
    expect(box.width).toBeGreaterThanOrEqual(Math.min(width, 560) - 1);
    if (width <= 560) expect(box.x).toBeLessThanOrEqual(1);

    // One row explains itself and no other: the one the card already carries (the card opens filled).
    const conditions = sheet.getByRole("radio");
    await expect(conditions).not.toHaveCount(0);
    const explained = async () => body.evaluate((element) => [...element.querySelectorAll("label span span + span")].length);
    expect(await explained()).toBe(1);
    await expect(sheet.getByRole("radio").first()).toBeChecked();

    // Choosing another shows that one's own questions; coming back shows the list with that one alone explained.
    await conditions.nth(1).click();
    await sheet.getByRole("button", { name: /change/i }).click();
    await expect(sheet.getByRole("radio").nth(1)).toBeChecked();
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
