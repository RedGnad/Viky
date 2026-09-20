import { expect, test, type Page } from "@playwright/test";

/**
 * Home without an account, as the founder specified it on 20 Sep 2026 (D129): one column at every width, the same
 * order from the phone to the desk (the character, the title, the sentence, the card), no blur anywhere, and at
 * 1440x900 the whole page without scrolling.
 */
const SIZES = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1024, height: 800 },
  { width: 1440, height: 900 },
] as const;

/** Every blurred shadow and every blurred filter on the page, the two page pseudo-elements included. */
async function blurs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const side of ["::before", "::after"] as const) {
      const cs = getComputedStyle(document.body, side);
      if (cs.content !== "none" && cs.filter !== "none") found.push(`body${side} ${cs.filter}`);
    }
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.filter.includes("blur")) found.push(`${el.tagName} filter ${cs.filter}`);
      for (const shadow of cs.boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px (\d+(?:\.\d+)?)px/g)) {
        if (Number(shadow[3]) > 0) found.push(`${el.tagName}.${el.className} shadow ${cs.boxShadow}`);
      }
    }
    return found;
  });
}

for (const scheme of ["dark", "light"] as const) {
  for (const size of SIZES) {
    test(`at ${size.width} the order is the character, the title, the sentence, the card, and the block is centred (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);

      const title = page.getByRole("heading", { name: "Send money that motivates." });
      await expect(title).toBeVisible();
      // The four boxes in one read, from the page itself: the character's wrapper carries no box of its own, so it is
      // the character's drawing that is measured, exactly as review-captures/measure-home.ts measures it.
      const { character, titleBox, sentence, card } = await page.evaluate(() => {
        const box = (el: Element | null) => {
          const r = el!.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        const heading = document.querySelector("h1")!;
        return {
          character: box(document.querySelector("svg[data-character='diamond']")),
          titleBox: box(heading),
          sentence: box(heading.nextElementSibling),
          card: box(document.querySelector("section.gift-card-placed")),
        };
      });

      // The text is never under the card, at any width, and the title never under the sentence.
      expect(titleBox.y).toBeLessThan(sentence.y);
      expect(sentence.y + sentence.height).toBeLessThanOrEqual(card.y);
      expect(character.y).toBeLessThanOrEqual(titleBox.y);
      if (size.width >= 1024) {
        // Centred in the window, the card included (D131): every block on the same axis.
        const middle = size.width / 2;
        for (const box of [character, titleBox, sentence, card]) expect(Math.abs(box.x + box.width / 2 - middle)).toBeLessThan(2);
      } else {
        // The diamond sits in the hollow the title leaves at its top right, and the text starts on the card's edge.
        expect(character.x).toBeGreaterThan(titleBox.x + titleBox.width / 2);
        expect(Math.abs(character.x + character.width - (card.x + card.width))).toBeLessThan(1);
        expect(Math.abs(titleBox.x - card.x)).toBeLessThan(1);
        expect(Math.abs(sentence.x - card.x)).toBeLessThan(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
      // The title at its step: 76 from 1024, 49 below (D131).
      expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(size.width >= 1024 ? "76px" : "49px");
      // No blur, on the ground or under anything.
      expect(await blurs(page)).toEqual([]);
    });
  }

  test(`at 1440x900 the whole page stands without scrolling, the card entire (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900);
    const card = (await page.locator("section.gift-card-placed").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(900);
  });
}
