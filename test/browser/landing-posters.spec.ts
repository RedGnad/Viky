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

  test("the five posters, their lines in ink, the character held to its word, and what Viky reads going by, by name", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    const story = page.locator("[data-landing-story]");
    await expect(story.locator("h2[data-poster]")).toHaveText(["Theirs from day one.", "Checked, not claimed.", "A missed day comes back to you.", "They say yes first.", "You are the key.", "Back someone's goal today."]);
    await expect(story.locator("[data-line]")).toHaveText([
      "The money is in their name the moment you pay.",
      "It becomes theirs to spend as they make progress.",
      "Viky reads the result where it happens.",
      "No screenshots. Nobody's word to take.",
      "By itself. You never have to ask.",
      "Nobody profits from a missed day, not even Viky.",
      "Nothing is counted until they agree.",
      "You see the result, never the rest of their account.",
      "They can stop anytime and keep what they earned.",
      "Your fingerprint, your face or your phone's code opens your account.",
      "It stays on your phone. Viky never sees it.",
      "No password to invent. Nothing to download.",
    ]);
    await expect(story.locator("[data-ch] svg")).toHaveCount(5);
    for (const [band, state] of [["theirs", "earned"], ["checked", "diamond"], ["back", "toCome"], ["yes", "today"], ["key", "diamond"]]) {
      await expect(story.locator(`[data-band="${band}"] [data-ch] svg`)).toHaveAttribute("data-character", state);
    }
    // What is checked holds the hero reading its book, on its legs; it has no act of its own.
    const reader = story.locator('[data-band="checked"] [data-ch]');
    await expect(reader.locator('[data-prop="book"]')).toHaveCount(1);
    await expect(reader.locator('[data-part="leg"]')).toHaveCount(2);
    await expect(reader).not.toHaveAttribute("data-act", /.*/);
    // No shape carries a shade under its face, here or in the file the named ones are read from.
    await expect(story.locator('[data-part="shade"]')).toHaveCount(0);
    expect(await page.evaluate(`fetch(document.querySelector("[data-landing-story] [data-ch] use").getAttribute("href")).then((file) => file.text()).then((file) => [(file.match(/<symbol /g) || []).length, /shade/.test(file)])`)).toEqual([32, false]);
    // On the phone's card the app's icon stands where a figure waved: a square, 110 wide, rounded, in the day's colours
    // whatever the hour.
    const icon = page.locator('[data-landing-story] svg[data-character="icon"]');
    await expect(icon).toHaveCount(1);
    expect(await icon.evaluate((drawn) => { const box = drawn.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })).toEqual([110, 110]);
    const colours = `(() => { const style = getComputedStyle(document.querySelector('[data-landing-story] svg[data-character="icon"]')); return ["--character-hero-from", "--character-hero-to", "--character-halftone", "--character-face"].map((name) => style.getPropertyValue(name).trim().toUpperCase()); })()`;
    expect(await page.evaluate(colours)).toEqual(["#FF7F8E", "#B79BFF", "#835EFF", "#1E1633"]);
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    expect(await page.evaluate(colours), "the same image after dark").toEqual(["#FF7F8E", "#B79BFF", "#835EFF", "#1E1633"]);
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    // The one in the last title wears Me's sunglasses.
    await expect(story.locator('[data-band="key"] [data-ch] [data-prop="shades"]')).toHaveCount(1);
    // At the foot, the two of Gifts, where a runner stood.
    await expect(story.locator('[data-band="last"] [data-figure] svg[viewBox="0 0 118 53"]')).toHaveCount(1);
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // The window's new width is the page's before anything is measured: an emulated phone takes a moment over it.
      await expect.poll(() => page.evaluate(`innerWidth === ${width} && matchMedia("(min-width: 600px)").matches === ${width >= 600}`)).toBe(true);
      await page.evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))");
      // And the title's new size has reached the character it holds: for an image after the resize an emulated phone has
      // given it to the title and not yet to what the title holds (measured 9 Oct 2026: 49 px on one, 48 on the other).
      await expect.poll(() => page.evaluate(`[...document.querySelectorAll("[data-landing-story] [data-ch]")].every((held) => getComputedStyle(held).fontSize === getComputedStyle(held.closest("h2")).fontSize)`)).toBe(true);
      // A title in the hero's own size, and its character on the line of the word before it: it never starts a line.
      const read = (await page.evaluate(`(() => {
        const hero = getComputedStyle(document.querySelector("main h1")).fontSize;
        return [...document.querySelectorAll("[data-landing-story] [data-ch]")].map((held) => {
          const word = held.previousElementSibling.getBoundingClientRect();
          const box = held.getBoundingClientRect();
          const title = parseFloat(getComputedStyle(held.closest("h2")).fontSize);
          return { size: getComputedStyle(held.closest("h2")).fontSize, hero, sameLine: box.top < word.bottom && box.bottom > word.top && box.left >= word.right - 1, tall: box.height / title, wide: box.width / title };
        });
      })()`)) as { size: string; hero: string; sameLine: boolean; tall: number; wide: number }[];
      expect(read.length).toBe(5);
      // 1.3 em tall and 1.3 wide for a day, 2.05 wide for the head in sunglasses; the hero with its book has a body
      // and legs, 1.86 em tall and 2.25 wide. To two pixels: a phone's engine snaps a box to its grid.
      const boxes = [[1.3, 1.3], [1.86, 2.25], [1.3, 1.3], [1.3, 1.3], [1.3, 2.05]];
      read.forEach((one, at) => {
        expect(one.size, `at ${width}: the hero's own size`).toBe(one.hero);
        expect(one.sameLine, `at ${width}: the character stands after its word, on its line`).toBe(true);
        expect(Math.abs(one.tall - boxes[at][0]), `at ${width}: ${boxes[at][0]} em tall`).toBeLessThan(0.045);
        expect(Math.abs(one.wide - boxes[at][1]), `at ${width}: ${boxes[at][1]} em wide`).toBeLessThan(0.045);
      });
      // The lines: in the title's own ink and not in grey, 18 px on a phone and 26 px from 600, weight 500.
      const lines = (await page.evaluate(`[...document.querySelectorAll("[data-landing-story] [data-line]")].map((line) => { const style = getComputedStyle(line); return { size: style.fontSize, weight: style.fontWeight, ink: style.color === getComputedStyle(line.closest("[data-band]").querySelector("h2")).color, words: line.textContent.trim().split(/\\s+/).length }; })`)) as { size: string; weight: string; ink: boolean; words: number }[];
      expect(lines.length).toBe(12);
      for (const line of lines) {
        expect(line.size, `at ${width}`).toBe(width < 600 ? "18px" : "26px");
        expect(line.weight).toBe("500");
        expect(line.ink, `at ${width}: the title's own colour`).toBe(true);
        expect(line.words).toBeLessThanOrEqual(11);
      }
      // What Viky reads: two rows where the window is wide, three on a phone, each running past both edges of the
      // window, and the page is not pushed sideways by them.
      const rows = (await page.evaluate(`(() => {
        const shown = [...document.querySelectorAll("[data-strip] .pill-rows")].filter((rows) => getComputedStyle(rows).display !== "none");
        return { layouts: shown.length, wide: document.documentElement.clientWidth, scrolls: document.documentElement.scrollWidth, rows: shown.flatMap((rows) => [...rows.querySelectorAll("[data-pills]")]).map((row) => { const all = [...row.querySelectorAll(".read-pill")].map((one) => one.getBoundingClientRect()); return { left: Math.min(...all.map((box) => box.left)), right: Math.max(...all.map((box) => box.right)) }; }) };
      })()`)) as { layouts: number; wide: number; scrolls: number; rows: { left: number; right: number }[] };
      expect(rows.layouts, `at ${width}: one layout shown`).toBe(1);
      expect(rows.rows.length, `at ${width}`).toBe(width < 600 ? 3 : 2);
      for (const row of rows.rows) {
        expect(row.left, `at ${width}`).toBeLessThan(-160);
        expect(row.right, `at ${width}`).toBeGreaterThan(rows.wide + 160);
      }
      expect(rows.scrolls, `at ${width}: nothing pushes the page sideways`).toBeLessThanOrEqual(rows.wide);
    }
    // One set of names is read, as a list, and it is the chooser's: every other copy is hidden from a screen reader.
    const list = page.getByRole("list", { name: "What Viky reads" });
    await expect(list).toHaveCount(1);
    const names = await list.getByRole("listitem").allInnerTexts();
    expect(names.length).toBeGreaterThanOrEqual(11);
    expect(new Set(names).size, "each name once").toBe(names.length);
    for (const name of ["At university", "Finish a race", "A Duolingo lesson each day"]) expect(names).toContain(name);
    expect(await page.locator("[data-strip] .pill-rows-wide .read-pill:not([aria-hidden])").count()).toBe(names.length);
    // A pill: its pictogram and its name in the title's face, a control's two pixel outline, four tones and never the
    // sun, and a lean of three degrees at most.
    const pill = (await page.evaluate(`(() => {
      const all = [...document.querySelectorAll("[data-strip] .pill-rows-wide .read-pill")];
      const one = getComputedStyle(all[0]);
      const lean = (each) => { const m = new DOMMatrixReadOnly(getComputedStyle(each).transform); return Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI); };
      return { border: one.borderTopWidth, radius: parseFloat(one.borderTopLeftRadius), face: one.fontFamily === getComputedStyle(document.querySelector("[data-landing-story] h2")).fontFamily, tones: [...new Set(all.map((each) => getComputedStyle(each).backgroundColor))], lean: Math.max(...all.map(lean)), drawn: all.every((each) => each.querySelector("svg") !== null) };
    })()`)) as { border: string; radius: number; face: boolean; tones: string[]; lean: number; drawn: boolean };
    expect(pill.border).toBe("2px");
    expect(pill.radius).toBeGreaterThan(100);
    expect(pill.face, "the title's own face").toBe(true);
    expect(pill.drawn, "each with its pictogram").toBe(true);
    expect(pill.tones.length).toBe(4);
    expect(pill.tones).not.toContain("rgb(255, 197, 49)");
    expect(pill.lean).toBeLessThanOrEqual(3.01);
    // The foot: the one way to what Viky can check, who it is not affiliated with, and what ETS asks.
    await expect(page.getByRole("link", { name: "What Viky can check" })).toHaveCount(1);
    await expect(page.locator("footer [data-not-affiliated]")).toHaveText("Not affiliated with the schools, races or services named.");
    await expect(page.locator("footer [data-mark-notice]")).toHaveText("TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS.");
    // The small print under the sentence that goes by is gone, and nothing of the card is drawn again under it.
    await expect(page.locator("[data-goals-going-by] p")).toHaveCount(3);
    await expect(page.getByText(/Each one is read where it happens/)).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="offer-card"]')).toHaveCount(1);
  });

  test("each character's act follows the scroll, and plays backwards when the page is scrolled back", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
    // Every poster plays its entrance first, once: a character that is still landing in its word is not where it will
    // stand, and what is measured here is its act alone.
    await scrollToTheFoot(page, 500);
    await page.evaluate("window.scrollTo(0, 0)");
    await page.waitForTimeout(600);
    // What a character's drawing shows at this moment: its turn, where it stands and how much of it is there. For the
    // one that rolls: how far its body has turned, and where its highlight and an eye stand from the body's middle.
    const READ = `(() => Object.fromEntries([...document.querySelectorAll("[data-landing-story] [data-ch][data-act]")].map((held) => {
      const drawn = held.querySelector("svg");
      const m = new DOMMatrixReadOnly(getComputedStyle(drawn).transform);
      const shades = held.querySelector('[data-prop="shades"]');
      const whirl = held.querySelector('[data-part="whirl"]');
      const w = whirl ? new DOMMatrixReadOnly(getComputedStyle(whirl).transform) : null;
      const middle = (part) => { const box = part.getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; };
      const from = (part) => { const [x, y] = middle(part); const [bx, by] = middle(held.querySelector('[data-part="body"]')); return [Math.round(x - bx), Math.round(y - by)]; };
      return [held.dataset.act, { turn: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI), x: Math.round(m.e), y: Math.round(m.f), shown: Number(getComputedStyle(drawn).opacity), shades: shades ? Number(getComputedStyle(shades).opacity) : null, body: w ? Math.round(Math.atan2(w.b, w.a) * 180 / Math.PI) : null, gloss: whirl ? from(held.querySelector('[data-part="gloss"]')) : null, eye: whirl ? from(held.querySelector('[data-part="eye"]')) : null }];
    })))()`;
    type Seen = Record<string, { turn: number; x: number; y: number; shown: number; shades: number | null; body: number | null; gloss: [number, number] | null; eye: [number, number] | null }>;
    /** Puts a character's title at a share of the screen's height, and lets the movement catch up with the scroll. */
    const put = async (act: string, share: number) => {
      await page.evaluate(`(() => { const held = document.querySelector('[data-landing-story] [data-act="${act}"]'); window.scrollTo({ top: held.getBoundingClientRect().top + window.scrollY - innerHeight * ${share}, behavior: "instant" }); })()`);
      await page.waitForTimeout(1300);
      return ((await page.evaluate(READ)) as Seen)[act];
    };
    // The day earned rolls: its turn follows the scroll, and comes back to where it was when the page does. Its body
    // and its face turn; its highlight stays where the light is, up and to the left, and only goes across with it.
    const low = await put("roll", 0.85);
    const high = await put("roll", 0.25);
    expect(high.body, "its body turned as the page went up").not.toBe(low.body);
    expect(high.eye, "and its face with it").not.toEqual(low.eye);
    expect([low.turn, high.turn], "the drawing itself is never turned").toEqual([0, 0]);
    expect(high.x).toBeGreaterThan(low.x);
    expect(high.gloss, "the highlight is where it was on the ball").toEqual(low.gloss);
    expect(low.gloss![0], "to the left of its middle").toBeLessThan(0);
    expect(low.gloss![1], "and above it").toBeLessThan(0);
    const lowAgain = await put("roll", 0.85);
    expect(lowAgain, "scrolled back, it is where it was").toEqual(low);
    // The day that was missed is not there when its title comes in, and is home by mid screen. Scrolled back, it goes.
    const away = await put("back", 0.97);
    expect(away.shown).toBeLessThan(0.1);
    expect(away.x).toBeGreaterThan(100);
    const home = await put("back", 0.4);
    expect(home).toMatchObject({ shown: 1, x: 0, turn: 0 });
    expect((await put("back", 0.97)).shown, "scrolled back, it has gone again").toBeLessThan(0.1);
    // The sunglasses come down onto the face as the title reaches mid screen. Before they do, the face has its eyes.
    expect((await put("shades", 0.9)).shades).toBeLessThan(0.1);
    const eyes = page.locator('[data-landing-story] [data-act="shades"] [data-part="under-shades"] circle');
    await expect(eyes).toHaveCount(2);
    expect(await eyes.evaluateAll((all) => all.map((eye) => `${getComputedStyle(eye).opacity} ${getComputedStyle(eye).visibility}`)), "two eyes, there to see").toEqual(["1 visible", "1 visible"]);
    expect((await put("shades", 0.4)).shades).toBe(1);
    // Once the sunglasses are on, each lens covers its eye whole.
    expect(await page.evaluate(`(() => { const held = document.querySelector('[data-landing-story] [data-act="shades"]'); const lenses = [...held.querySelectorAll('[data-prop="shades"] rect')].slice(0, 2).map((one) => one.getBoundingClientRect()); return [...held.querySelectorAll('[data-part="under-shades"] circle')].map((eye) => eye.getBoundingClientRect()).every((eye, index) => eye.left >= lenses[index].left && eye.right <= lenses[index].right && eye.top >= lenses[index].top && eye.bottom <= lenses[index].bottom); })()`)).toBe(true);
    // The yes is today, and it hops: it is off the ground at some point of its way up the screen.
    await expect(page.locator('[data-landing-story] [data-band="yes"] [data-ch]')).toHaveAttribute("data-act", "hop");
    const hops = [await put("hop", 0.8), await put("hop", 0.6), await put("hop", 0.45), await put("hop", 0.3)];
    expect(Math.min(...hops.map((one) => one.y)), "it left the ground").toBeLessThan(-5);
    await expect(page.locator('[data-landing-story] [data-act="nod"]'), "no character nods any more").toHaveCount(0);
    // The rows of names drift opposite ways with the scroll, and with nothing else.
    const drift = async () => (await page.evaluate(`[...document.querySelectorAll("[data-strip] .pill-rows")].filter((rows) => getComputedStyle(rows).display !== "none").flatMap((rows) => [...rows.querySelectorAll("[data-pills]")]).map((row) => Math.round(new DOMMatrixReadOnly(getComputedStyle(row).transform).e))`)) as number[];
    await page.evaluate(`(() => { const strip = document.querySelector("[data-strip]"); window.scrollTo({ top: strip.getBoundingClientRect().top + window.scrollY - innerHeight * 0.9, behavior: "instant" }); })()`);
    await page.waitForTimeout(1300);
    const before = await drift();
    await page.waitForTimeout(700);
    expect(await drift(), "nothing moves while the page is still").toEqual(before);
    await page.evaluate(`window.scrollBy({ top: 300, behavior: "instant" })`);
    await page.waitForTimeout(1300);
    const after = await drift();
    expect(Math.sign(after[0] - before[0]), "the first row one way").toBe(-1);
    expect(Math.sign(after[1] - before[1]), "the second the other").toBe(1);
    expect(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), "and nothing pushes the page sideways").toBe(true);
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
    // No character's act either: each drawing is at rest, whole, the sunglasses on the face, and no row has drifted.
    const acts = (await page.evaluate(`[...document.querySelectorAll("[data-landing-story] :is([data-ch] svg, [data-ch] [data-prop], [data-pills])")].map((one) => getComputedStyle(one).opacity + " " + (one.tagName === "g" ? one.getAttribute("transform") ?? "none" : getComputedStyle(one).transform))`)) as string[];
    expect(acts.length).toBeGreaterThan(8);
    expect(new Set(acts)).toEqual(new Set(["1 none"]));
    expect(await page.evaluate(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-landing-story] [data-act="roll"] [data-part="whirl"]')).transform).isIdentity`), "the day earned is upright").toBe(true);
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
