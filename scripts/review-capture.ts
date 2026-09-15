import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, devices, type BrowserContext, type Page } from "@playwright/test";

/**
 * Pictures of exactly what fits on the screen at the two sizes a review is judged at, 390x844 and 1440x900, in
 * day and in night, taken from the site a person meets.
 *
 * Why a script: on 15 Sep, Chrome driven through its extension answered success to every resize while the page
 * stayed at 1440x788, so nothing seen that way could speak for either size. This browser belongs to the script,
 * each file name carries the size read back from the image file itself, and the run fails if that is not the
 * size asked for, or if the page did not see the appearance asked for.
 *
 * The walk is a person's: open the home page of the URL's site, then click visible links until the URL is
 * reached, photographing every screen on the way. When no walk of visible links leads there (a page only ever
 * opened from a shared link, or one reached through a button), the URL is typed instead, and both the console
 * and captures.md say so. Every size and appearance is captured in a browser with nothing stored, so the site
 * sees nobody signed in and no appearance chosen in the product: a passkey cannot be replayed by a script.
 *
 * Usage: `pnpm review:capture https://viky.cash/fund`. It prints the folder last, and that folder is what the
 * reviewer is given. captures.md is written after every image, so a folder without it is a run that failed.
 */

/**
 * The two sizes, on the devices the browser tests already use. One image pixel per screen pixel, so the size in
 * a file name is the size of the screen and not a multiple of it.
 */
const SIZES = [
  { name: "390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  { name: "1440x900", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
] as const;

/** Day and night, set the way a phone sets them, so the product follows the setting as it does for a person. */
const APPEARANCES = [
  { name: "day", colorScheme: "light" },
  { name: "night", colorScheme: "dark" },
] as const;

/** How many links the search may follow before it stops looking and types the URL. */
const SEARCH_LIMIT = 40;

/** A link to a file rather than to a screen is never followed. */
const FILE_LINK = /\.(pdf|zip|png|jpe?g|gif|svg|webp|ico|json|txt|xml|csv|webmanifest)$/i;

type Size = (typeof SIZES)[number];
type Appearance = (typeof APPEARANCES)[number];
type Link = { href: string; text: string; index: number };
type Screen = { key: string; parent?: string; href?: string; text?: string };
type Search = { walk?: Screen[]; followed: number; complete: boolean };
type Row = {
  file: string;
  asked: string;
  appearance: string;
  seen: string;
  image: string;
  viewport: string;
  scrolled: number;
  page: string;
  reachedBy: string;
};

/** Two addresses are the same screen when they differ only by a fragment or a trailing slash. */
function screenKey(address: string): string {
  const url = new URL(address);
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}${url.search}`;
}

/** A file name for a screen, taken from its address. */
function slugOf(address: string): string {
  const url = new URL(address);
  const words = `${url.pathname}${url.search}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (words || "home").slice(0, 60);
}

/** Width and height as the PNG header declares them: the size of the image, not the size that was asked for. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  const isPng = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && bytes.subarray(12, 16).toString("latin1") === "IHDR";
  if (!isPng) throw new Error("a capture is not a PNG file");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A folder of its own for this run, so two runs started in the same second never write over each other. */
function claimFolder(stamp: string): string {
  mkdirSync(resolve("review-captures"), { recursive: true });
  for (let copy = 1; ; copy += 1) {
    const folder = resolve("review-captures", copy === 1 ? stamp : `${stamp}-${copy}`);
    try {
      mkdirSync(folder);
      return folder;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/** Waits until the screen has stopped arriving: the network, the fonts, and every animation that has an end. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.evaluate(async () => {
        await document.fonts.ready;
        const ending = document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.race([
          Promise.all(ending.map((animation) => animation.finished.catch(() => undefined))),
          new Promise((done) => setTimeout(done, 5_000)),
        ]);
      });
      break;
    } catch (error) {
      // A redirect landing mid-measurement destroys the page being measured: wait for the new one and measure it.
      if (attempt === 3) throw error;
      await page.waitForLoadState("load");
    }
  }
  // Movement driven by script rather than by CSS is not listed by getAnimations.
  await page.waitForTimeout(800);
}

/** Opens an address directly, waits for it to settle, and returns what is worth recording about the answer. */
async function open(page: Page, address: string): Promise<string> {
  const response = await page.goto(address);
  await settle(page);
  const status = response?.status() ?? 0;
  return status >= 400 ? ` (the server answered ${status})` : "";
}

/**
 * The links on this screen a person can see, in document order, that stay on this site and in this tab. A link
 * below the fold counts, because a person can scroll to it; one hidden by CSS, by zero opacity or by having no
 * size does not.
 */
async function visibleLinks(page: Page): Promise<Link[]> {
  const origin = new URL(page.url()).origin;
  const anchors = await page.locator("a[href]").evaluateAll((elements) =>
    elements.map((element) => {
      if (!(element instanceof HTMLAnchorElement)) return { href: "", text: "", visible: false, sameTab: false, download: false };
      const box = element.getBoundingClientRect();
      return {
        href: element.href,
        text: (element.innerText || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
        visible: box.width > 0 && box.height > 0 && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        sameTab: element.target === "" || element.target === "_self",
        download: element.hasAttribute("download"),
      };
    }),
  );
  return anchors.flatMap((anchor, index) => {
    if (!anchor.visible || !anchor.sameTab || anchor.download || !URL.canParse(anchor.href)) return [];
    const url = new URL(anchor.href);
    if (url.origin !== origin || !/^https?:$/.test(url.protocol) || FILE_LINK.test(url.pathname)) return [];
    return [{ href: anchor.href, text: anchor.text || anchor.href, index }];
  });
}

/**
 * The shortest walk of visible-link clicks from the home page to the target, searched at the size and appearance
 * being captured, because a link a phone hides is not one a phone user can follow. Pages are opened directly
 * while searching, in a browser of their own; the walk is then replayed by clicking, in a browser that has seen
 * none of them.
 */
async function searchWalk(context: BrowserContext, home: string, target: string): Promise<Search> {
  const page = await context.newPage();
  const targetKey = screenKey(target);
  const screens = new Map<string, Screen>();
  const walkTo = (key: string): Screen[] => {
    const walk: Screen[] = [];
    let screen = screens.get(key);
    while (screen) {
      walk.unshift(screen);
      screen = screen.parent === undefined ? undefined : screens.get(screen.parent);
    }
    return walk;
  };

  await open(page, home);
  const homeKey = screenKey(page.url());
  screens.set(homeKey, { key: homeKey });
  if (homeKey === targetKey || screenKey(home) === targetKey) return { walk: walkTo(homeKey), followed: 0, complete: true };

  const tried = new Set([screenKey(home), homeKey]);
  const queue = [homeKey];
  let followed = 0;
  while (queue.length > 0) {
    const key = queue.shift() as string;
    if (screenKey(page.url()) !== key) await open(page, key);
    for (const link of await visibleLinks(page)) {
      const hrefKey = screenKey(link.href);
      if (tried.has(hrefKey)) continue;
      if (followed === SEARCH_LIMIT) return { followed, complete: false };
      tried.add(hrefKey);
      followed += 1;
      const answer = await open(page, link.href);
      const landed = screenKey(page.url());
      const known = screens.has(landed);
      if (!known) screens.set(landed, { key: landed, parent: key, href: link.href, text: link.text });
      if (landed === targetKey || hrefKey === targetKey) return { walk: walkTo(landed), followed, complete: true };
      if (!known && answer === "") queue.push(landed);
    }
  }
  return { followed, complete: true };
}

/**
 * Photographs what fits on the screen, names the file after the size read back from it and the appearance, and
 * refuses any other size and any page that did not see the appearance asked for.
 */
async function photograph(page: Page, size: Size, appearance: Appearance, step: number, reachedBy: string, folder: string): Promise<Row> {
  const seen = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrolled: Math.round(window.scrollY),
    night: window.matchMedia("(prefers-color-scheme: dark)").matches,
  }));
  const provisional = resolve(folder, `.${step}-${size.name}-${appearance.name}.partial.png`);
  await page.screenshot({ path: provisional });
  const image = pngSize(readFileSync(provisional));
  const file = `${String(step).padStart(2, "0")}-${slugOf(page.url())}-${image.width}x${image.height}-${appearance.name}.png`;
  renameSync(provisional, resolve(folder, file));
  const row: Row = {
    file,
    asked: size.name,
    appearance: appearance.name,
    seen: seen.night ? "night" : "day",
    image: `${image.width}x${image.height}`,
    viewport: `${seen.width}x${seen.height}`,
    scrolled: seen.scrolled,
    page: page.url(),
    reachedBy,
  };
  console.log(`${file}  page viewport ${row.viewport}, page saw ${row.seen}, scrolled ${row.scrolled}: ${reachedBy}`);
  if (row.viewport !== size.name) console.warn(`  the page reported a viewport of ${row.viewport} on a ${size.name} screen`);
  if (row.scrolled !== 0) console.warn(`  the page was scrolled ${row.scrolled} pixels when it was taken`);
  if (row.image !== size.name) throw new Error(`${file} came out ${row.image}, not the ${size.name} asked for`);
  if (row.seen !== appearance.name) throw new Error(`${file} was taken in ${row.seen}, not the ${appearance.name} asked for`);
  return row;
}

/** Walks to the target the way a person would at this size and appearance, photographing every screen on the way. */
async function captureWalk(
  context: BrowserContext,
  size: Size,
  appearance: Appearance,
  home: string,
  target: string,
  search: Search,
  folder: string,
): Promise<Row[]> {
  const page = await context.newPage();
  const rows: Row[] = [];
  const homeAnswer = await open(page, home);
  rows.push(await photograph(page, size, appearance, 1, `opened the home page${homeAnswer}`, folder));

  if (!search.walk) {
    const why = search.complete
      ? `no walk of visible links from the home page leads here (all ${search.followed} such links were followed)`
      : `no walk of visible links from the home page was found within ${SEARCH_LIMIT} links followed`;
    const answer = await open(page, target);
    rows.push(await photograph(page, size, appearance, 2, `typed the URL, because ${why}${answer}`, folder));
    return rows;
  }

  for (const screen of search.walk.slice(1)) {
    const link = (await visibleLinks(page)).find((candidate) => screen.href !== undefined && screenKey(candidate.href) === screenKey(screen.href));
    if (!link) throw new Error(`at ${size.name} in ${appearance.name}, the link to ${screen.href} that the search followed is not visible on ${page.url()}`);
    await Promise.all([page.waitForURL((url) => screenKey(url.href) === screen.key), page.locator("a[href]").nth(link.index).click()]);
    await settle(page);
    rows.push(await photograph(page, size, appearance, rows.length + 1, `clicked the link "${link.text}"`, folder));
  }
  return rows;
}

/** The record the reviewer reads before any image: what was asked, what came out, and how each screen was reached. */
function manifest(target: string, taken: string, chromiumVersion: string, rows: Row[]): string {
  const cell = (value: string | number) => String(value).replace(/\|/g, "\\|");
  return [
    "# Captures for review",
    "",
    `- Target: ${target}`,
    `- Taken: ${taken}, in Chromium ${chromiumVersion}.`,
    "- Each size was captured in day and in night, with the browser's appearance set to light and then to dark, each time in a browser with nothing stored, so the site saw nobody signed in and no appearance chosen in the product.",
    "- Each image is only what fitted on the screen, without scrolling.",
    "- image size: read from the image file. page saw: the appearance the page's prefers-color-scheme query reported. page viewport: window.innerWidth x window.innerHeight, as the page reported them. scrolled: window.scrollY when the image was taken.",
    "",
    "| file | size asked | appearance asked | page saw | image size | page viewport | scrolled | page | reached by |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${[row.file, row.asked, row.appearance, row.seen, row.image, row.viewport, row.scrolled, row.page, row.reachedBy].map(cell).join(" | ")} |`,
    ),
    "",
  ].join("\n");
}

async function main() {
  const address = process.argv[2] ?? "";
  if (!URL.canParse(address) || !/^https?:$/.test(new URL(address).protocol)) {
    throw new Error("give the page to review as a full address, for example: pnpm review:capture https://viky.cash/fund");
  }
  const target = new URL(address).href;
  const home = new URL("/", target).href;
  const taken = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const folder = claimFolder(taken.replace(/:/g, "-"));

  const browser = await chromium.launch();
  try {
    const rows: Row[] = [];
    for (const size of SIZES) {
      for (const appearance of APPEARANCES) {
        const options = { ...size.use, colorScheme: appearance.colorScheme };
        const searching = await browser.newContext(options);
        const search = await searchWalk(searching, home, target);
        await searching.close();
        const capturing = await browser.newContext(options);
        rows.push(...(await captureWalk(capturing, size, appearance, home, target, search, folder)));
        await capturing.close();
      }
    }
    writeFileSync(resolve(folder, "captures.md"), manifest(target, taken, browser.version(), rows));
    console.log(`\ncaptures for review: ${folder}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("REVIEW_CAPTURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
