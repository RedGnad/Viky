import { expect, test, type Page } from "@playwright/test";

/**
 * The posters under the landing's card, and the block that waits under the screen (the founder, 5 Oct 2026).
 *
 * The rule both are held to is the one of 23 Sep 2026: the first image is the starting state. No movement starts from
 * a state other than the one drawn just before it, so what plays when it is scrolled to is drawn at its starting state
 * before it comes in; and nothing is ever left invisible: a device that asks for less movement and a browser without
 * scripts are given everything, still.
 *
 * What is watched is what the browser paints: the opacity of each part, read on every frame while the page is
 * scrolled. The old reveal failed exactly there: a block was painted whole, put back to nothing as its first pixel
 * came in, and painted again, so its opacity went down before it went up.
 */
const PARTS = "[data-landing-story] [data-band] :is([data-w], [data-ch], [data-line], [data-strip], [data-figure], [data-offer])";

/** Scrolls to the foot of the page in steps a hand would make, leaving each poster the time to play. */
async function scrollToTheFoot(page: Page, step = 220): Promise<void> {
  const total = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  for (let y = 0; y < total; y += step) {
    // The page's own scroll, moved at once: a wheel is not a thing every emulated phone has.
    await page.evaluate(`window.scrollBy({ top: ${step}, behavior: "instant" })`);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(1800);
}

/**
 * Reads the opacity of every element a selector names on every frame, into the page itself. A string: a function sent
 * to the page loses its name on the way.
 */
const WATCH = (selector: string) => `(() => {
  const watched = [...document.querySelectorAll(${JSON.stringify(selector)})];
  window.__seen = watched.map(() => []);
  const read = () => {
    watched.forEach((one, index) => {
      const opacity = Number(getComputedStyle(one).opacity);
      const seen = window.__seen[index];
      if (seen.length === 0 || seen[seen.length - 1] !== opacity) seen.push(opacity);
    });
    window.__watching = requestAnimationFrame(read);
  };
  read();
  return watched.length;
})()`;
const SEEN = "(() => { cancelAnimationFrame(window.__watching); return window.__seen; })()";

/** An opacity that went down at some frame: something painted, then taken away. */
const wentDown = (series: number[][]) => series.map((seen, index) => ({ index, seen })).filter(({ seen }) => seen.some((value, at) => at > 0 && value < seen[at - 1] - 0.001));

test.describe("the posters under the landing's card", () => {
  test.skip(({ viewport }) => ![375, 1280].includes(viewport?.width ?? 0), "a phone and a large screen");
  test.setTimeout(90_000);

  test("each part is drawn at its starting state before it comes in, plays once, and ends whole", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    // The document says movement is welcome before anything is drawn, and the posters wait invisible under the screen.
    await expect(page.locator("html")).toHaveAttribute("data-moves", "");
    await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
    const parts = (await page.evaluate(WATCH(PARTS))) as number;
    expect(parts).toBeGreaterThan(30);
    const before = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(PARTS)})].filter((one) => one.getBoundingClientRect().top > innerHeight).map((one) => getComputedStyle(one).opacity)`)) as string[];
    expect(before.length).toBeGreaterThan(20);
    expect(new Set(before), "under the screen, every part is at its starting state").toEqual(new Set(["0"]));
    await scrollToTheFoot(page);
    const seen = (await page.evaluate(SEEN)) as number[][];
    // Nothing was painted and then taken away, and everything ended whole.
    expect(wentDown(seen), "a part whose opacity went down at some frame").toEqual([]);
    expect(seen.filter((one) => one[one.length - 1] !== 1).length, "parts that did not end whole").toBe(0);
    expect(seen.filter((one) => one[0] !== 0).length, "parts that were not at their starting state first").toBe(0);
    // Once: scrolled back to the top and down again, nothing goes back to its starting state.
    await page.evaluate("window.scrollTo(0, 0)");
    await page.waitForTimeout(400);
    await page.evaluate(WATCH(PARTS));
    await scrollToTheFoot(page, 500);
    const again = (await page.evaluate(SEEN)) as number[][];
    expect(again.filter((one) => one.length !== 1 || one[0] !== 1).length, "parts that moved a second time").toBe(0);
    // The scroll itself is the browser's: nothing held it, and nothing pushes the page sideways.
    expect(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBe(true);
  });

  test("the scroll is the person's: one under way is never cut short by the posters measuring themselves again", async ({ page }) => {
    // The library puts the page at its top and back when it measures its triggers again. Done at once, that cut a
    // smooth scroll short where it stood: the way to the card stopped eleven pixels down. It is only ever asked to
    // measure the way that waits for the scroll to end.
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
    const size = page.viewportSize()!;
    await page.evaluate(`window.scrollTo({ top: 1400, behavior: "smooth" })`);
    // The window changes width while it travels, which is what makes the library measure again.
    await page.setViewportSize({ width: size.width + 40, height: size.height });
    await expect.poll(() => page.evaluate("window.scrollY"), { timeout: 6000 }).toBeGreaterThan(1380);
    // And once it has measured, the page is where the person left it.
    await page.waitForTimeout(900);
    expect(await page.evaluate("Math.abs(window.scrollY - 1400)")).toBeLessThanOrEqual(2);
  });

  test("the four posters, their sentences, the character held to its word, and the stickers from edge to edge", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    const story = page.locator("[data-landing-story]");
    await expect(story.locator("h2[data-poster]")).toHaveText(["Theirs from day one.", "Checked, not claimed.", "A missed day comes back to you.", "Your face is the key.", "Back someone's goal today."]);
    await expect(story.locator("[data-line]")).toHaveText(["The money is in their name the moment you pay.", "Viky reads it where it happens. Nobody's word to take.", "By itself. Viky keeps none of it.", "No password to invent. Nothing to download."]);
    await expect(story.locator("[data-ch] svg")).toHaveCount(4);
    for (const [band, state] of [["theirs", "earned"], ["checked", "today"], ["back", "toCome"], ["face", "diamond"]]) {
      await expect(story.locator(`[data-band="${band}"] [data-ch] svg`)).toHaveAttribute("data-character", state);
    }
    // A title in the hero's own size, and its character on the line of the word before it: it never starts a line.
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const read = (await page.evaluate(`(() => {
        const hero = getComputedStyle(document.querySelector("main h1")).fontSize;
        return [...document.querySelectorAll("[data-landing-story] [data-ch]")].map((held) => {
          const word = held.previousElementSibling.getBoundingClientRect();
          const box = held.getBoundingClientRect();
          return { size: getComputedStyle(held.closest("h2")).fontSize, hero, sameLine: box.top < word.bottom && box.bottom > word.top && box.left >= word.right - 1 };
        });
      })()`)) as { size: string; hero: string; sameLine: boolean }[];
      expect(read.length).toBe(4);
      for (const one of read) {
        expect(one.size, `at ${width}: the hero's own size`).toBe(one.hero);
        expect(one.sameLine, `at ${width}: the character stands after its word, on its line`).toBe(true);
      }
      // The stickers run past both edges of the window, and the page is not pushed sideways by them.
      const edges = (await page.evaluate(`(() => { const all = [...document.querySelectorAll("[data-stickers] .sticker")].map((one) => one.getBoundingClientRect()); return { left: Math.min(...all.map((box) => box.left)), right: Math.max(...all.map((box) => box.right)), wide: document.documentElement.clientWidth, scrolls: document.documentElement.scrollWidth }; })()`)) as { left: number; right: number; wide: number; scrolls: number };
      expect(edges.left, `at ${width}`).toBeLessThan(-160);
      expect(edges.right, `at ${width}`).toBeGreaterThan(edges.wide + 160);
      expect(edges.scrolls, `at ${width}: nothing pushes the page sideways`).toBeLessThanOrEqual(edges.wide);
    }
    // Eleven pictograms, six sets of them, in rounds with a control's two pixel outline, and never the sun.
    await expect(story.locator("[data-stickers] .sticker")).toHaveCount(66);
    const round = (await page.evaluate(`(() => { const one = getComputedStyle(document.querySelector("[data-stickers] .sticker")); const tones = new Set([...document.querySelectorAll("[data-stickers] .sticker")].map((each) => getComputedStyle(each).backgroundColor)); return { border: one.borderTopWidth, radius: one.borderTopLeftRadius, tones: [...tones] }; })()`)) as { border: string; radius: string; tones: string[] };
    expect(round.border).toBe("2px");
    expect(round.radius).toBe("50%");
    expect(round.tones.length).toBe(4);
    expect(round.tones).not.toContain("rgb(255, 197, 49)");
    // The foot: the one way to what Viky can check, who it is not affiliated with, and what ETS asks.
    await expect(page.getByRole("link", { name: "What Viky can check" })).toHaveCount(1);
    await expect(page.locator("footer [data-not-affiliated]")).toHaveText("Not affiliated with the schools, races or services named.");
    await expect(page.locator("footer [data-mark-notice]")).toHaveText("TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS.");
    // The small print under the sentence that goes by is gone, and nothing of the card is drawn again under it.
    await expect(page.locator("[data-goals-going-by] p")).toHaveCount(3);
    await expect(page.getByText(/Each one is read where it happens/)).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="offer-card"]')).toHaveCount(1);
  });

  test("a device that asks for less movement, and a browser without scripts, are given everything, still", async ({ page, browser, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(800);
    await expect(page.locator("html")).not.toHaveAttribute("data-moves", "");
    await expect(page.locator("[data-landing-story]")).not.toHaveAttribute("data-posters", /.*/);
    const shown = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(PARTS)})].map((one) => getComputedStyle(one).opacity + " " + getComputedStyle(one).transform)`)) as string[];
    expect(new Set(shown)).toEqual(new Set(["1 none"]));
    expect(await page.evaluate(`document.getAnimations().filter((one) => one.effect?.target?.closest?.("[data-landing-story]")).length`), "nothing moves in the posters").toBe(0);
    // Without scripts the document never says movement is welcome, and nothing is hidden.
    const plain = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: page.viewportSize() ?? undefined });
    const still = await plain.newPage();
    await still.goto("/", { waitUntil: "load" });
    await expect(still.locator("html")).not.toHaveAttribute("data-moves", "");
    const opacities = (await still.evaluate(`[...document.querySelectorAll(${JSON.stringify(PARTS)})].map((one) => getComputedStyle(one).opacity)`)) as string[];
    expect(opacities.length).toBeGreaterThan(30);
    expect(new Set(opacities)).toEqual(new Set(["1"]));
    await plain.close();
  });

  test("posters whose script never comes are shown, still", async ({ page }) => {
    // The library's own file is refused, the one that holds the scroll trigger and nothing of the page: the posters'
    // script says so, and everything is there.
    let refused = 0;
    await page.route("**/_next/static/**", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (/ScrollTrigger/.test(body) && !/data-landing-story/.test(body)) {
        refused += 1;
        return route.abort();
      }
      return route.fulfill({ response, body });
    });
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-still", "", { timeout: 15_000 });
    expect(refused, "the library's own file was the one refused").toBeGreaterThan(0);
    const opacities = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(PARTS)})].map((one) => getComputedStyle(one).opacity)`)) as string[];
    expect(new Set(opacities)).toEqual(new Set(["1"]));
  });
});

test.describe("a block under the screen waits at its starting state", () => {
  test.skip(({ viewport }) => ![375, 1280].includes(viewport?.width ?? 0), "a phone and a large screen");
  test.setTimeout(90_000);
  // The blocks of a screen, as the shell names them: what stands in `main`, but its head and its sheets.
  const BLOCKS = "main > *:not(header, dialog, .arrives-in-turn)";

  test("it is invisible before it comes in, enters once when a quarter of it is in, and never goes back", async ({ page }) => {
    await page.goto("/judges", { waitUntil: "load" });
    await page.waitForTimeout(600);
    // What is in view when the screen opens is whole; what is wholly under it waits, invisible and a little lower.
    const first = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(BLOCKS)})].map((block) => ({ under: block.getBoundingClientRect().top >= innerHeight, waits: block.hasAttribute("data-waits"), opacity: getComputedStyle(block).opacity, moved: getComputedStyle(block).transform !== "none" }))`)) as { under: boolean; waits: boolean; opacity: string; moved: boolean }[];
    expect(first.filter((block) => block.under).length).toBeGreaterThan(2);
    for (const block of first) {
      expect(block.waits, "a block waits when, and only when, it is under the screen").toBe(block.under);
      expect(block.opacity).toBe(block.under ? "0" : "1");
      expect(block.moved).toBe(block.under);
    }
    // Scrolled through: where each block stood when its entrance began, and what was painted on every frame.
    await page.evaluate(`(() => {
      const blocks = [...document.querySelectorAll(${JSON.stringify(BLOCKS)})];
      window.__entered = blocks.map(() => null);
      window.__entrances = blocks.map(() => 0);
      const read = () => {
        blocks.forEach((block, index) => {
          const moving = block.getAnimations().some((one) => !(one instanceof CSSAnimation));
          if (moving && window.__entered[index] === null) {
            const box = block.getBoundingClientRect();
            window.__entered[index] = { inView: innerHeight - box.top, quarter: Math.min(box.height, innerHeight) / 4 };
            window.__entrances[index] += 1;
          }
        });
        window.__watchingBlocks = requestAnimationFrame(read);
      };
      read();
    })()`);
    await page.evaluate(WATCH(BLOCKS));
    await scrollToTheFoot(page, 120);
    const seen = (await page.evaluate(SEEN)) as number[][];
    const entered = (await page.evaluate("(() => { cancelAnimationFrame(window.__watchingBlocks); return window.__entered; })()")) as ({ inView: number; quarter: number } | null)[];
    expect(wentDown(seen), "a block that was painted, then taken away").toEqual([]);
    expect(seen.filter((one) => one[one.length - 1] !== 1).length, "blocks left less than whole").toBe(0);
    first.forEach((block, index) => {
      if (!block.under) {
        expect(entered[index], "a block in view when the screen opened never moves").toBeNull();
        return;
      }
      // It entered, and not at the very edge of the screen: a quarter of it was in, less the few pixels of its rise.
      expect(entered[index], `block ${index} entered`).not.toBeNull();
      expect(entered[index]!.inView, `block ${index}: a quarter of it was in`).toBeGreaterThanOrEqual(entered[index]!.quarter - 12);
    });
    expect(await page.locator("[data-waits]").count(), "nothing is left waiting at the foot of the page").toBe(0);
  });

  test("with less movement asked for, nothing waits and nothing moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/judges", { waitUntil: "load" });
    await page.waitForTimeout(600);
    expect(await page.locator("[data-waits]").count()).toBe(0);
    const opacities = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(BLOCKS)})].map((block) => getComputedStyle(block).opacity)`)) as string[];
    expect(new Set(opacities)).toEqual(new Set(["1"]));
  });
});
