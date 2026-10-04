import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN_WORDS } from "../../src/consumer-words";

/** Every screen a person can reach without signing in. The judges page is excluded by design: it is the
 *  one place allowed to show a contract. */
const CONSUMER_PAGES = ["/", "/fund", "/privacy", "/legal"];

/**
 * The card's one line opens where the funder is (D137): the catalogue while nothing is chosen, and that condition's
 * own questions from then on. A check that wants the catalogue asks for it by its own control.
 */
async function openTheCatalogue(page: Page) {
  await page.locator("main section").first().getByRole("button").first().click();
  const change = page.locator("dialog.sheet[open]").getByRole("button", { name: /^Change/i });
  if (await change.isVisible().catch(() => false)) await change.click();
}

/** From six conditions the catalogue is four tiles, then one family's list (D224): go to the family that holds a line. */
async function openTheFamily(page: Page, family: RegExp) {
  const sheet = page.locator("dialog.sheet[open]");
  const all = sheet.getByRole("button", { name: /All families/i });
  if (await all.isVisible().catch(() => false)) await all.click();
  await sheet.getByRole("button", { name: family }).click();
}

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
  test("a first visit meets a gift already filled in, but for the name: its field is empty and asks who", async ({ page }) => {
    await page.goto("/");
    // The card is the body of the page, and it is a plausible gift rather than four holes (the founder, 20 Sep 2026).
    const card = page.locator("main section").first();
    // No line saying whose gift it is on the card being filled in (D138): it said what the funder already knew.
    await expect(card.getByText("A gift from you", { exact: true })).toHaveCount(0);
    // The name starts empty (the founder, 5 Oct 2026; it was "Boo" from 28 Sep, D300): the field shows "who?".
    await expect(card.getByLabel(/Their first name/i)).toHaveValue("");
    await expect(card.getByLabel(/Their first name/i)).toHaveAttribute("placeholder", "who?");
    // Two decimals, because the field now holds the figure in the currency the person reads in (D143), and that
    // figure is written the way that currency writes money.
    await expect(card.getByLabel(/How much/i)).toHaveValue("30.00");
    await expect(card.getByRole("button", { name: "30 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    // And nothing takes the cursor on arrival (D140): on a phone that raised the keyboard over half the page.
    await expect(card.getByLabel(/Their first name/i)).not.toBeFocused();
    // The action says what it will take from the first second: the passkey is the door, not the button.
    await expect(page.getByRole("button", { name: /^Send \$30\.00$/ })).toBeEnabled();
    // The promise and the line under it, in the founder's words of 20 Sep 2026 (D128).
    await expect(page.getByRole("heading", { name: /Send money that motivates/i })).toBeVisible();
    await expect(page.getByText(/what's missed comes back to you/i).first()).toBeVisible();
    // The one door, in the header rather than in the body, named for both of the things it does (brief, section 7).
    await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeVisible();
    // No passkey prompt on the home page at all, and nothing claiming a session that does not exist.
    await expect(page.getByRole("button", { name: /Create my account/i })).toHaveCount(0);
    await expect(page.getByText("You are signed in.")).toHaveCount(0);
  });

  test("the name and the amount are typed on the card itself, the length is chosen on it, and no sheet opens", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await card.getByLabel(/Their first name/i).fill("Léa");
    await card.getByLabel(/How much/i).fill("45");
    await card.getByRole("button", { name: "90 days", exact: true }).click();
    // Nothing opened: the card is the form, and what was typed is on it.
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
    await expect(card.getByLabel(/Their first name/i)).toHaveValue("Léa");
    await expect(page.getByRole("button", { name: /^Send \$45\.00$/ })).toBeEnabled();
    // The length is chosen, never typed (D130): three chips, one pressed at a time, and no field to open.
    await expect(card.getByRole("button", { name: "90 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "7 days", exact: true }).click();
    await expect(card.getByRole("button", { name: "7 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: "90 days", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByLabel(/^Days$/i)).toHaveCount(0);
  });

  /** The row of days fades at the end that still hides one, as long as what it hides, and nowhere else (D145). */
  test("the row of days fades at the end that hides a day, and at neither end when they all fit", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    const row = card.locator(".day-row-days");
    const fades = () =>
      row.evaluate((element) => ({
        more: (element as HTMLElement).dataset.more,
        left: getComputedStyle(element).getPropertyValue("--fade-left").trim(),
        right: getComputedStyle(element).getPropertyValue("--fade-right").trim(),
      }));
    await card.getByRole("button", { name: "90 days", exact: true }).click();
    // Ninety days never fit: nothing is hidden on the left at the start, and the right end says there is more.
    await expect.poll(async () => (await fades()).more).toBe("right");
    expect((await fades()).left).toBe("0px");
    await row.evaluate((element) => element.scrollBy({ left: 400 }));
    await expect.poll(async () => (await fades()).more).toBe("both");
    await row.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
    await expect.poll(async () => (await fades()).more).toBe("left");
    expect((await fades()).right).toBe("0px");
  });

  test("the chips are the chosen condition's own three, and the one the register suggests is pressed", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await openTheCatalogue(page);
    await openTheFamily(page, /^Learn/);
    const sheet = page.locator("dialog.sheet[open]");
    await sheet.getByRole("button", { name: /certification on Credly/i }).click();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
    // Coursera's and Credly's window is 30 to 365, suggested 120 (src/credly-badge.ts): the 7 days a lesson offers
    // would be refused by the route, and must not be on the card.
    await expect(card.getByRole("button", { name: "120 days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: "30 days", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByRole("button", { name: "365 days", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "7 days", exact: true })).toHaveCount(0);
    // Three chips and no fourth (D130): the one that opened a field for any other number is gone.
    await expect(card.getByRole("button", { name: "Other", exact: true })).toHaveCount(0);
    await expect(card.locator("button[aria-pressed]")).toHaveCount(3);
  });

  test("what they will do is a real choice, so it keeps its sheet", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("main section").first();
    await openTheCatalogue(page);
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
    await openTheCatalogue(page);
    // The longest list, so the sheet has something past its edge to say (D233: the tiles come first, and fit).
    await openTheFamily(page, /School & studies/);
    const sheet = page.locator("dialog.sheet[open]");
    // A sheet rises 24 pixels when it opens: measured while it is still on its way, its action is up to 24 pixels
    // below where it will stand, which is a measurement of the movement rather than of the screen.
    await sheet.evaluate((element) => Promise.all(element.getAnimations().map((one) => one.finished.catch(() => undefined))));
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
    const last = sheet.locator('div[role="group"] > button').last();
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
    await openTheCatalogue(page);
    // The four families first (D233), then the family the card's condition is in.
    await openTheFamily(page, /^Learn/);
    const sheet = page.locator("dialog.sheet[open]");
    const body = sheet.locator(".sheet-body");
    // A sheet opens at the top of what it says, never in the middle of it.
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    // The sheet takes the screen's own width up to the column of the page it covers, here the card's with its margins
    // (the founder, 4 Oct 2026; it was 560 on every page): a dialog's own max-width inset it by 38 pixels on a phone,
    // and on a phone it is flush with both edges, as the image draws it.
    const [box, width] = [(await sheet.boundingBox())!, page.viewportSize()!.width];
    const column = 440 + 2 * (width >= 600 ? 24 : 20);
    expect(Math.abs(box.width - Math.min(width, column))).toBeLessThanOrEqual(1);
    if (width <= column) expect(box.x).toBeLessThanOrEqual(1);

    // No row explains itself, chosen or not, so every row keeps its height (the founder, 28 Sep 2026).
    const conditions = sheet.locator('div[role="group"] > button');
    await expect(conditions).not.toHaveCount(0);
    // A row explains itself when it carries a line of help beyond its name and its nature: the nature is said on every
    // line in the meta voice (capitals, D162), and the help is said on the condition's questions instead.
    // Since 5 Oct 2026 a name not everybody knows carries one grey line saying what it is ("Competitive programming"
    // under Codeforces): a few words, never the help, and it is not counted as an explanation.
    const explained = async () =>
      body.evaluate((element) =>
        [...element.querySelectorAll('div[role="group"] > button')].filter((label) =>
          [...label.querySelectorAll(":scope > span > span")].slice(1).some((line) => !line.hasAttribute("data-what-it-is") && getComputedStyle(line).textTransform !== "uppercase"),
        ).length,
      );
    expect(await explained()).toBe(0);
    await expect(sheet.locator("[data-what-it-is]")).toHaveText(["Competitive programming", "Professional badges", "Digital certificates"]);
    // The one the card carries, by its own name: the catalogue is ordered by title inside a family, so "first" is
    // whatever the register's words sort to, and that is not what this check is about.
    await expect(sheet.getByRole("button", { name: /A Duolingo lesson each day/i })).toHaveAttribute("aria-current", "true");
    // Its family's list, with the way to the four above it (D224); the four are tiles, a picture and a name each.
    await expect(sheet.getByRole("button", { name: /All families/i })).toBeVisible();
    await sheet.getByRole("button", { name: /All families/i }).click();
    await expect(sheet.locator('div[role="group"] > button')).toHaveCount(0);
    const tiles = sheet.locator("[data-family-art]");
    await expect(tiles).toHaveCount(4);
    await expect(sheet.getByRole("button", { name: /School & studies/ })).not.toContainText(/choice/, { timeout: 1000 });

    // Choosing another, in another family, shows that one's own questions with what it proves under the title; the
    // arrow back leads to the list it was chosen in (the founder, 28 Sep 2026), which shows the new one checked.
    await openTheFamily(page, /School & studies/);
    const other = sheet.getByRole("button", { name: /A Duolingo English Test score/i });
    await other.click();
    // How it is checked, folded at the foot of its questions: where it is read from, when, what counts, what they do.
    await sheet.locator("[data-how-checked] summary").click();
    await expect(sheet.locator("[data-how-checked] dl.said-lines > div")).toHaveText([
      "Read fromthe certificate page they share",
      "Readwhen they share its link",
      "What countsthe score printed on it",
      "They mustshare their certificate's link",
    ]);
    await expect(sheet.locator("[data-how-checked] p")).toHaveCount(0);
    await sheet.getByRole("button", { name: /change/i }).click();
    await expect(sheet.locator("[data-family-art]")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: /A Duolingo English Test score/i })).toHaveAttribute("aria-current", "true");
    expect(await explained()).toBe(0);
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
      // What a finger reaches: the box, and the area the one small button lays past its 40 pixels, above and below.
      const past = await targets.nth(index).evaluate((element) => {
        const reach = getComputedStyle(element, "::before");
        return reach.content !== "none" && reach.position === "absolute" ? Math.max(0, -parseFloat(reach.top)) + Math.max(0, -parseFloat(reach.bottom)) : 0;
      });
      // The floor platform guidance gives for a thumb, rather than a number we invented.
      expect(box.height + past, `"${label}" is too short to tap`).toBeGreaterThanOrEqual(44);
    }
  });
});
