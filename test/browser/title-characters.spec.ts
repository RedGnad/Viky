import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * A character in a title never touches a letter, at any width (the founder, 11 Oct 2026).
 *
 * On a phone the titles of the landing's posters take two or three lines, and two characters went through letters as
 * the page was scrolled: today, which hops half an em up, went into the tail of the "y" of "They" on the line above
 * it, and the day missed, which comes back from the right, came through "comes". Their acts follow the scroll, so
 * wherever the page stopped they stayed there. Under a line the hop now stops under the letters, and with a word
 * after it on its line the day missed comes back where it stands (app/kit/LandingStory.tsx).
 *
 * What is measured is what the browser paints. Each title is photographed in the same place bare, with its letters
 * alone, with its character alone, and bare again. What differs from the bare ground is ink, and the two inks must share
 * no pixel and keep air between them: still, at each step of the title's way up the screen, the three peaks of the
 * hop among them, and at each image of the spring a character lands on, the page's clock stopped at each.
 *
 * VIKY_TITLE_CAPTURES=<folder> also photographs the five titles at 360, 390 and 430: each at mid screen, today at the
 * top of its hop, and the day missed on its way back.
 */
const SHOTS = process.env.VIKY_TITLE_CAPTURES;
/** Phones from the narrowest one sold to the widest, a window between the two layouts, and a computer. */
const STILL_WIDTHS = [320, 360, 390, 430, 600, 1024, 1440];
/** Where a title takes several lines: the narrowest phone of the founder's three, and the widest. */
const MOVING_WIDTHS = [360, 430];
/** Where a landing is watched image by image, and how far apart its images are, in milliseconds. */
const LANDING_WIDTH = 390;
const LANDING_STEP = 50;
const LANDING_IMAGES = 20;
const CAPTURE_WIDTHS = [360, 390, 430];
/** Pixels of air a character keeps from the nearest letter: at rest, and at any moment of its act. */
const AIR_STILL = 6;
const AIR_MOVING = 2;
const AIR_LANDING = 1;
/** How far around a character letters are looked for. */
const REACH = 14;
/** Pixels of the bare ground that may differ between its first picture and its last, and the least ink a word has. */
const MOVED_AT_MOST = 12;
const BESIDE_AT_LEAST = 60;

const TITLES = ["Theirs from day one.", "Checked, not claimed.", "A missed day comes back to you.", "They say yes first.", "You are the key."];
const HIDE_CHARACTER = "[data-landing-story] [data-ch] { visibility: hidden !important; }";
const HIDE_LETTERS = "[data-landing-story] h2[data-poster] { color: transparent !important; }";

/**
 * Decodes the pictures of the same place and says how many pixels the two inks share and how near they come. Sent as
 * text: a function sent to the page loses its name on the way.
 *
 * Ink is what differs from the bare ground in both of its pictures, the one taken first and the one taken last, and
 * what stands in a block of two pixels by two at least: on the machine that runs every pull request a lone pixel came
 * out different from one picture to the next (11 Oct 2026), and one lone pixel read as ink was a character touching a
 * letter. A letter and a character are thousands of pixels each.
 */
const AIR = `(async ([bare, bareAgain, letters, character, reach, beside]) => {
  const read = async (data) => {
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  };
  const grounds = [(await read(bare)).data, (await read(bareAgain)).data];
  const inked = (picture) => {
    const { width, height } = picture;
    const differs = new Uint8Array(width * height);
    for (let at = 0; at < differs.length; at += 1) {
      differs[at] = grounds.every((ground) => Math.abs(picture.data[at * 4] - ground[at * 4]) + Math.abs(picture.data[at * 4 + 1] - ground[at * 4 + 1]) + Math.abs(picture.data[at * 4 + 2] - ground[at * 4 + 2]) > 48) ? 1 : 0;
    }
    // Kept where a block of two by two is ink, each of its four pixels with it.
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const at = y * width + x;
        if (differs[at] && differs[at + 1] && differs[at + width] && differs[at + width + 1]) mask[at] = mask[at + 1] = mask[at + width] = mask[at + width + 1] = 1;
      }
    }
    return mask;
  };
  let moved = 0;
  for (let at = 0; at < grounds[0].length; at += 4) {
    if (Math.abs(grounds[0][at] - grounds[1][at]) + Math.abs(grounds[0][at + 1] - grounds[1][at + 1]) + Math.abs(grounds[0][at + 2] - grounds[1][at + 2]) > 48) moved += 1;
  }
  const first = await read(letters);
  const one = inked(first);
  let besideInk = 0;
  for (let y = Math.max(0, beside.top); y < Math.min(first.height, beside.bottom); y += 1) {
    for (let x = Math.max(0, beside.left); x < Math.min(first.width, beside.right); x += 1) besideInk += one[y * first.width + x];
  }
  const other = inked(await read(character));
  const { width, height } = first;
  let shared = 0;
  let drawn = 0;
  let nearest = reach + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!other[y * width + x]) continue;
      drawn += 1;
      if (one[y * width + x]) shared += 1;
      for (let dy = -reach; dy <= reach; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -reach; dx <= reach; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !one[yy * width + xx]) continue;
          nearest = Math.min(nearest, Math.hypot(dx, dy));
        }
      }
    }
  }
  return { shared, drawn, air: nearest > reach ? reach + 1 : Math.round(nearest * 10) / 10, moved, besideInk };
})`;

type Air = { shared: number; drawn: number; air: number };
type Read = Air & { moved: number; besideInk: number };

/** The air around a title's character as the page stands: the title's own place, a hop's height above it included. */
async function airOf(page: Page, title: Locator): Promise<Air> {
  const box = (await title.boundingBox())!;
  const size = (await title.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))) as number;
  const view = page.viewportSize()!;
  // From seven tenths of a letter above the title, where a hop goes, to a descender's depth under its last line.
  const top = Math.max(0, Math.floor(box.y - size * 0.7));
  const clip = { x: Math.max(0, Math.floor(box.x)), y: top, width: Math.ceil(box.width), height: Math.min(view.height - top, Math.ceil(box.y - top + box.height + size * 0.25)) };
  if (clip.height <= 0) return { shared: 0, drawn: 0, air: REACH + 1 };
  const shot = async () => (await page.screenshot({ clip, scale: "css" })).toString("base64");
  /**
   * A picture the page has finished painting: the same twice in a row. A word and its character are painted apart
   * from the rest of their title, and a picture taken as they are hidden still showed them (seen 11 Oct 2026). A
   * character may move by itself, the one that reads its book does: its picture is the last one taken.
   */
  const picture = async (itMoves = false) => {
    let last = await shot();
    for (let turn = 0; turn < 8; turn += 1) {
      await page.waitForTimeout(90);
      const next = await shot();
      if (next === last) return next;
      last = next;
    }
    expect(itMoves, "what is photographed stands still").toBe(true);
    return last;
  };
  // Where the word beside the character stands in the pictures: its ink must be in the picture of the letters.
  const beside = (await title.locator("[data-ch]").evaluate((held, corner) => {
    const word = (held.previousElementSibling as HTMLElement).getBoundingClientRect();
    return { left: Math.floor(word.left - corner.x), right: Math.ceil(word.right - corner.x), top: Math.floor(word.top - corner.y), bottom: Math.ceil(word.bottom - corner.y) };
  }, { x: clip.x, y: clip.y })) as { left: number; right: number; top: number; bottom: number };
  for (let attempt = 0; ; attempt += 1) {
    const hideCharacter = await page.addStyleTag({ content: HIDE_CHARACTER });
    const hideLetters = await page.addStyleTag({ content: HIDE_LETTERS });
    const bare = await picture();
    await hideLetters.evaluate((node) => (node as Element).remove());
    const letters = await picture();
    await hideCharacter.evaluate((node) => (node as Element).remove());
    const lettersAgain = await page.addStyleTag({ content: HIDE_LETTERS });
    const character = await picture(true);
    const characterAgain = await page.addStyleTag({ content: HIDE_CHARACTER });
    const bareAgain = await picture();
    await lettersAgain.evaluate((node) => (node as Element).remove());
    await characterAgain.evaluate((node) => (node as Element).remove());
    const read = (await page.evaluate(`${AIR}(${JSON.stringify([bare, bareAgain, letters, character, REACH, beside])})`)) as Read;
    // A measure is kept when the ground stood still between its first picture and its last, a few lone pixels apart,
    // and when the word beside the character is in the picture of the letters. Else it is taken again.
    const taken = read.moved <= MOVED_AT_MOST && read.besideInk >= BESIDE_AT_LEAST;
    if (taken || attempt === 3) {
      expect.soft(read.moved, `the ground stood still while "${await title.textContent()}" was measured`).toBeLessThanOrEqual(MOVED_AT_MOST);
      expect.soft(read.besideInk, `the word beside its character is in the picture of "${await title.textContent()}"`).toBeGreaterThanOrEqual(BESIDE_AT_LEAST);
      return read;
    }
    await page.waitForTimeout(400);
  }
}

/** VIKY_SAY_AIR=1 prints each measure, for whoever sets the values. */
const say = (line: string) => void (process.env.VIKY_SAY_AIR ? console.log(line) : undefined);

const titlesOf = (page: Page) => page.locator("[data-landing-story] h2[data-poster]").filter({ has: page.locator("[data-ch]") });

/** Puts a title's character at a share of the window's height, and lets its act catch up with the scroll. */
async function put(page: Page, title: Locator, share: number, wait = 750): Promise<void> {
  await title.locator("[data-ch]").evaluate((held, at) => window.scrollTo({ top: held.getBoundingClientRect().top + window.scrollY - innerHeight * at, behavior: "instant" }), share);
  await page.waitForTimeout(wait);
}

/** The shares of the window at which today is at the top of each of its three hops: an up, a down and a settling each. */
async function hopPeaks(page: Page, title: Locator): Promise<number[]> {
  const tall = (await title.locator("[data-ch]").evaluate((held) => held.getBoundingClientRect().height / innerHeight)) as number;
  const hop = 1 + 1 + 0.35;
  return [0, 1, 2].map((at) => 1 - ((at * hop + 1) / (3 * hop)) * (1 + tall));
}

async function capture(page: Page, title: Locator, width: number, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const box = (await title.boundingBox())!;
  const view = page.viewportSize()!;
  const y = Math.max(0, Math.floor(box.y - 70));
  await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), clip: { x: 0, y, width: view.width, height: Math.min(view.height - y, Math.ceil(box.height + 140)) } });
}

test.describe("a character in a title never touches a letter", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 375, "measured once: each width opens its own window");

  test("still, at every width: no ink shared, and air all around", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    for (const width of STILL_WIDTHS) {
      // A device that asks for less movement is given every poster in its place, still: where each character rests.
      const context = await browser.newContext({ baseURL, viewport: { width, height: width >= 768 ? 900 : 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "load" });
      await page.evaluate("document.fonts.ready");
      const titles = titlesOf(page);
      await expect(titles).toHaveText(TITLES);
      for (let at = 0; at < TITLES.length; at += 1) {
        const title = titles.nth(at);
        await title.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
        await page.waitForTimeout(350);
        const air = await airOf(page, title);
        say(`still | ${width} | ${TITLES[at]} | shared ${air.shared} | air ${air.air} | drawn ${air.drawn}`);
        expect.soft(air.drawn, `${width}: "${TITLES[at]}" draws its character`).toBeGreaterThan(200);
        expect.soft(air.shared, `${width}: "${TITLES[at]}" shares no pixel with its character`).toBe(0);
        expect.soft(air.air, `${width}: "${TITLES[at]}" keeps air around its character`).toBeGreaterThanOrEqual(AIR_STILL);
      }
      await context.close();
    }
  });

  for (const width of MOVING_WIDTHS) {
    test(`all the way up the screen at ${width}: no ink shared at any step, the top of each hop included`, async ({ browser, baseURL }) => {
      test.setTimeout(420_000);
      const context = await browser.newContext({ baseURL, viewport: { width, height: width >= 768 ? 900 : 844 }, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "load" });
      await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
      await page.evaluate("document.fonts.ready");
      const titles = titlesOf(page);
      for (let at = 0; at < TITLES.length; at += 1) {
        const title = titles.nth(at);
        const act = await title.locator("[data-ch]").getAttribute("data-act");
        const shares = [0.86, 0.74, 0.62, 0.5, 0.38, 0.26, 0.14, ...(act === "hop" ? await hopPeaks(page, title) : [])];
        // Its entrance first, once: a character still landing in its word is not yet where its act has it.
        await put(page, title, 0.7, 2_600);
        for (const share of shares) {
          await put(page, title, share);
          const air = await airOf(page, title);
          say(`moving | ${width} | ${TITLES[at]} | at ${share.toFixed(2)} | shared ${air.shared} | air ${air.air} | drawn ${air.drawn}`);
          expect.soft(air.drawn, `${width}: "${TITLES[at]}" at ${share.toFixed(2)} of the window draws its character`).toBeGreaterThan(act === "back" ? -1 : 200);
          expect.soft(air.shared, `${width}: "${TITLES[at]}" at ${share.toFixed(2)} of the window shares no pixel with its character`).toBe(0);
          expect.soft(air.air, `${width}: "${TITLES[at]}" at ${share.toFixed(2)} of the window keeps air around its character`).toBeGreaterThanOrEqual(AIR_MOVING);
        }
      }
      await context.close();
    });
  }

  test(`as each lands in its word at ${LANDING_WIDTH}: no ink shared at any image of its spring`, async ({ browser, baseURL }) => {
    test.setTimeout(420_000);
    const context = await browser.newContext({ baseURL, viewport: { width: LANDING_WIDTH, height: 844 }, serviceWorkers: "block" });
    const page = await context.newPage();
    // The page's clock is the test's: the spring is stopped at each image of its way, and photographed there.
    await page.clock.install();
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
    await page.evaluate("document.fonts.ready");
    await page.waitForTimeout(800);
    const titles = titlesOf(page);
    let landings = 0;
    for (let at = 0; at < TITLES.length; at += 1) {
      const title = titles.nth(at);
      const held = title.locator("[data-ch]");
      // The day missed does not land: the scroll brings it.
      if ((await held.getAttribute("data-ch")) !== "lands") continue;
      landings += 1;
      await page.clock.pauseAt(((await page.evaluate("Date.now()")) as number) + 100);
      await held.evaluate((one) => window.scrollTo({ top: one.getBoundingClientRect().top + window.scrollY - innerHeight * 0.6, behavior: "instant" }));
      let images = 0;
      for (let turn = 0; turn < 80 && images < LANDING_IMAGES; turn += 1) {
        await page.clock.runFor(LANDING_STEP);
        if (Number(await held.evaluate((one) => getComputedStyle(one).opacity)) < 1) continue;
        images += 1;
        const air = await airOf(page, title);
        say(`landing | ${LANDING_WIDTH} | ${TITLES[at]} | image ${images} | shared ${air.shared} | air ${air.air} | drawn ${air.drawn}`);
        expect.soft(air.shared, `"${TITLES[at]}" at image ${images} of its landing shares no pixel with its character`).toBe(0);
        expect.soft(air.air, `"${TITLES[at]}" at image ${images} of its landing keeps air around its character`).toBeGreaterThanOrEqual(AIR_LANDING);
      }
      expect(images, `"${TITLES[at]}" landed, and was watched to the end of its spring`).toBe(LANDING_IMAGES);
      await page.clock.resume();
      await page.waitForTimeout(300);
    }
    expect(landings, "four characters land, and one is brought by the scroll").toBe(4);
    await context.close();
  });

  test("the captures: the five titles at 360, 390 and 430", async ({ browser, baseURL }) => {
    test.skip(!SHOTS, "VIKY_TITLE_CAPTURES names where the pictures go");
    test.setTimeout(420_000);
    for (const width of CAPTURE_WIDTHS) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "load" });
      await expect(page.locator("[data-landing-story]")).toHaveAttribute("data-posters", "playing", { timeout: 15_000 });
      await page.evaluate("document.fonts.ready");
      const titles = titlesOf(page);
      for (let at = 0; at < TITLES.length; at += 1) {
        const title = titles.nth(at);
        const act = await title.locator("[data-ch]").getAttribute("data-act");
        await put(page, title, 0.7, 2_600);
        await put(page, title, 0.45, 1_200);
        await capture(page, title, width, `${at + 1}-at-mid-screen`);
        if (act === "hop") {
          await put(page, title, (await hopPeaks(page, title))[1], 1_200);
          await capture(page, title, width, `${at + 1}-at-the-top-of-its-hop`);
        }
        if (act === "back") {
          await put(page, title, 0.68, 1_200);
          await capture(page, title, width, `${at + 1}-on-its-way-back`);
        }
      }
      await context.close();
    }
  });
});
