import { expect, test, type Page } from "@playwright/test";

/**
 * Home without an account, as the founder specified it on 20 Sep 2026 (D129) and redrew it on 24 Sep (D214): one column
 * at every width, the same order from the phone to the desk (the title, the sentence, the way to the card, the
 * character, the card), no blur anywhere, and at every size the card's top in the first screen.
 */
const SIZES = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1024, height: 800 },
  { width: 1440, height: 900 },
] as const;
/** What of the card's top the first screen shows, `--hero-card-peek` (D221). */
const CARD_PEEK = 104;

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
    test(`at ${size.width} the order is the title, the sentence, the way, the character, the card, and the block is centred (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);

      const title = page.getByRole("heading", { name: "Send money that motivates." });
      await expect(title).toBeVisible();
      // The four boxes in one read, from the page itself: the character's wrapper carries no box of its own, so it is
      // the character's drawing that is measured, exactly as review-captures/measure-home.ts measures it.
      const { character, titleBox, sentence, way, card } = await page.evaluate(() => {
        const box = (el: Element | null) => {
          const r = el!.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        const heading = document.querySelector("h1")!;
        return {
          character: box(document.querySelector(".hero-character")),
          titleBox: box(heading),
          sentence: box(heading.nextElementSibling),
          way: box(document.querySelector('a[href="#offer"]')),
          card: box(document.querySelector("section.gift-card-placed")),
        };
      });

      // The order, top to bottom: the title, the sentence, the way to the card, the character, the card; the text is
      // never under the card, and the character stands on the card's top edge (D214).
      expect(titleBox.y).toBeLessThan(sentence.y);
      expect(sentence.y + sentence.height).toBeLessThanOrEqual(way.y);
      // The way to the card stands apart from the text: 24 pixels under the sentence at every width (D242).
      expect(Math.abs(way.y - (sentence.y + sentence.height) - 24)).toBeLessThan(1.5);
      expect(way.y + way.height).toBeLessThanOrEqual(character.y);
      expect(character.y + character.height).toBeLessThanOrEqual(card.y + 4);
      // The card's top is cut by the fold: the first screen ends where the card's peek begins, at every size (D221).
      expect(card.y).toBeLessThan(size.height);
      expect(Math.abs(card.y - (size.height - CARD_PEEK))).toBeLessThan(2);
      // The character is centred on the card at every width.
      expect(Math.abs(character.x + character.width / 2 - (card.x + card.width / 2))).toBeLessThan(2);
      // Centred in the window at every width (D221), the card included (D131): every block on the same axis.
      const middle = size.width / 2;
      for (const box of [character, titleBox, sentence, way, card]) expect(Math.abs(box.x + box.width / 2 - middle)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
      // The title at its step: 76 from 1024, 49 below (D131).
      expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(size.width >= 1024 ? "76px" : "49px");
      // Two lines on a phone, never a short word alone on a third (D235).
      if (size.width < 1024) expect(await title.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))).toBe(2);
      // No blur, on the ground or under anything.
      expect(await blurs(page)).toEqual([]);
    });
  }

  test(`at 1440x900 the card's top is in the first screen, and nothing scrolls sideways (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    // D129 asked for the whole page in 900; D214 puts the character between the sentence and the card, and D221 cuts
    // the card's top at the fold, which is what the page needs to say there is more (NN/g on the fold).
    const card = (await page.locator("section.gift-card-placed").boundingBox())!;
    expect(Math.abs(card.y - (900 - CARD_PEEK))).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });
}

// The narrowest phones: the promise keeps two lines by taking a smaller size, and the card keeps its place (D235).
for (const width of [320, 360]) {
  test(`at ${width} the promise holds on two lines and the card's top stays at the fold`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const title = page.getByRole("heading", { name: "Send money that motivates." });
    const lines = await title.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBe(2);
    const card = (await page.locator("section.gift-card-placed").boundingBox())!;
    expect(Math.abs(card.y - (740 - CARD_PEEK))).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
