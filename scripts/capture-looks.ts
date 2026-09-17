import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chromium, devices, type Browser, type Page } from "@playwright/test";
import { FORBIDDEN_WORDS } from "../src/consumer-words";
import { LOOKS } from "../src/design-tokens";
import { SCREENS } from "../app/dev/looks/example";

/**
 * The boards the funder chooses a look from (art direction brief, section 9): the six screens of the laboratory in
 * each of the three looks, at 390x844 and 1440x900, in day and in night; a seventh board per look with what is met
 * outside the app (section 7 bis), the link preview at 1200x630 and the icon at 512 and 180; and one short recording of
 * the motion per look, every movement in it answering a gesture (section 6).
 *
 * Run against a built app with the design gallery switched on, never against next dev (its badge lands in pictures):
 *   pnpm build && VIKY_DESIGN_GALLERY=1 pnpm start --port 3107
 *   pnpm looks:capture http://127.0.0.1:3107
 *
 * Every screen is taken whole: the page is given a viewport as tall as itself, so the bar of destinations sits at the
 * bottom of the picture as it does on a phone, and a dashed line on the boards marks where the first screen ends. The
 * pictures are taken with reduced motion, so each one shows the resting state, and without the laboratory's own button.
 *
 * The run fails rather than produce a board that says something untrue: a screen that did not answer, a page that did
 * not see the appearance asked for, a page that scrolls sideways, a forbidden word, more than one accent surface in a
 * screen's column, an amount at display size that breaks onto a second line or does not read its value, a character on
 * a screen where money is chosen or confirmed, a page without an account with more than one action or no door in its
 * header, an arrival that lasts two seconds or more, or anything that moves under reduced motion. What it checked and
 * measured is written to captures.md beside the pictures.
 */

const SIZES = [
  { name: "390", viewport: { width: 390, height: 844 }, device: devices["Pixel 7"] },
  { name: "1440", viewport: { width: 1440, height: 900 }, device: devices["Desktop Chrome"] },
] as const;

const APPEARANCES = [
  { name: "day", colorScheme: "light" },
  { name: "night", colorScheme: "dark" },
] as const;

/** What the example data says Home holds, which is what the amount must read once the page has run. */
const HOME_AMOUNT = "€9.54";

type Shot = { look: string; screen: string; size: string; appearance: string; file: string; height: number; checks: string[] };

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function claimFolder(): string {
  const day = new Date().toISOString().slice(0, 10);
  mkdirSync(resolve("review-captures"), { recursive: true });
  for (let copy = 1; ; copy += 1) {
    const folder = resolve("review-captures", copy === 1 ? `looks-${day}` : `looks-${day}-${copy}`);
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true });
      return folder;
    }
  }
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function captureScreen(browser: Browser, base: string, folder: string, look: string, screen: (typeof SCREENS)[number], size: (typeof SIZES)[number], appearance: (typeof APPEARANCES)[number]): Promise<Shot> {
  const context = await browser.newContext({ ...size.device, viewport: size.viewport, deviceScaleFactor: 1, colorScheme: appearance.colorScheme, reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(String(error)));
  const address = `${base}/dev/looks/${look}/${screen.id}`;
  const response = await page.goto(address);
  await settle(page);
  const where = `${look} ${screen.id} ${size.name} ${appearance.name}`;
  const checks: string[] = [];

  if ((response?.status() ?? 0) !== 200) throw new Error(`${where}: the server answered ${response?.status()}`);
  checks.push("answered 200");

  const seen = await page.evaluate(() => ({
    night: window.matchMedia("(prefers-color-scheme: dark)").matches,
    width: window.innerWidth,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    characters: document.querySelectorAll("[data-character]").length,
    text: document.querySelector("main")?.innerText ?? "",
    accents: [...document.querySelectorAll<HTMLElement>('main [class*="bg-[var(--accent)]"]')].filter((element) => element.getClientRects().length > 0).length,
    door: document.querySelector<HTMLElement>("main header a:last-child")?.innerText ?? "",
    amount: (() => {
      const element = document.querySelector<HTMLElement>("[data-amount]");
      if (!element) return null;
      const style = getComputedStyle(element);
      const visible = [...element.querySelectorAll<HTMLElement>("[aria-hidden]")].find((part) => part.offsetParent !== null || part.getClientRects().length > 0)?.textContent ?? "";
      return { lines: Math.round(element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)), fontSize: style.fontSize, whiteSpace: style.whiteSpace, visible };
    })(),
  }));
  if (seen.night !== (appearance.name === "night")) throw new Error(`${where}: the page saw ${seen.night ? "night" : "day"}`);
  checks.push(`page saw ${appearance.name}`);
  if (seen.width !== size.viewport.width) throw new Error(`${where}: the page was ${seen.width} wide`);
  if (seen.sideways > 1) throw new Error(`${where}: the page scrolls sideways by ${seen.sideways} pixels`);
  checks.push("no sideways scroll");
  const forbidden = seen.text.match(new RegExp(FORBIDDEN_WORDS.source, "gi")) ?? [];
  if (forbidden.length > 0) throw new Error(`${where}: forbidden words ${forbidden.join(", ")}`);
  checks.push("no forbidden word");
  if (screen.characters) {
    if (seen.characters === 0) throw new Error(`${where}: no character on a screen that should carry one`);
    checks.push(`${seen.characters} characters`);
  } else {
    if (seen.characters !== 0) throw new Error(`${where}: ${seen.characters} characters on a screen where money is chosen or confirmed`);
    checks.push("no character");
  }
  if (seen.accents > 1) throw new Error(`${where}: ${seen.accents} accent surfaces in the column`);
  checks.push(`${seen.accents} accent surface`);
  if (screen.id === "welcome") {
    if (seen.accents !== 1) throw new Error(`${where}: the body has ${seen.accents} actions`);
    if (seen.door !== "Sign in or create account") throw new Error(`${where}: the header's door reads "${seen.door}"`);
    checks.push("one action in the body, the door in the header");
  }
  if (screen.id === "home") {
    if (!seen.amount) throw new Error(`${where}: no amount at display size`);
    if (seen.amount.lines !== 1 || seen.amount.whiteSpace !== "nowrap") throw new Error(`${where}: the amount takes ${seen.amount.lines} lines`);
    if (seen.amount.visible !== HOME_AMOUNT) throw new Error(`${where}: the amount reads ${seen.amount.visible}, not ${HOME_AMOUNT}`);
    checks.push(`amount ${seen.amount.visible} on one line at ${seen.amount.fontSize}`);
  }
  if (failures.length > 0) throw new Error(`${where}: the page threw ${failures.join("; ")}`);

  await page.addStyleTag({ content: "[data-lab-tool] { display: none !important; }" });
  const firstScreen = resolve(folder, "screens", `${look}-${screen.id}-${size.name}-${appearance.name}-first-screen.png`);
  await page.screenshot({ path: firstScreen });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.viewport.width, height: Math.max(height, size.viewport.height) });
  await settle(page);
  const file = resolve(folder, "screens", `${look}-${screen.id}-${size.name}-${appearance.name}.png`);
  await page.screenshot({ path: file });
  const image = pngSize(file);
  if (image.width !== size.viewport.width) throw new Error(`${where}: the picture came out ${image.width} wide`);
  await context.close();
  console.log(`${basename(file)}  ${checks.join(", ")}`);
  return { look, screen: screen.id, size: size.name, appearance: appearance.name, file, height: image.height, checks };
}

/** What is met outside the app, in one look: the link preview and the icon, each at the exact size asked for. */
async function captureOutside(browser: Browser, base: string, folder: string, look: string): Promise<{ preview: string; icons: string[] }> {
  const shoot = async (path: string, width: number, height: number, name: string) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    const response = await page.goto(`${base}${path}`);
    if ((response?.status() ?? 0) !== 200) throw new Error(`${path}: the server answered ${response?.status()}`);
    await settle(page);
    const file = resolve(folder, "outside", name);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height } });
    await page.close();
    const size = pngSize(file);
    if (size.width !== width || size.height !== height) throw new Error(`${name} came out ${size.width}x${size.height}`);
    console.log(`${name}  ${width}x${height}`);
    return file;
  };
  const preview = await shoot(`/dev/looks/${look}/preview`, 1200, 630, `${look}-link-preview-1200x630.png`);
  const icons = [await shoot(`/dev/looks/${look}/icon?size=512`, 512, 512, `${look}-icon-512.png`), await shoot(`/dev/looks/${look}/icon?size=180`, 180, 180, `${look}-icon-180.png`)];
  return { preview, icons };
}

/** An HTML page of pictures, photographed whole: the board. */
async function board(browser: Browser, folder: string, name: string, title: string, body: string): Promise<string> {
  const html = resolve(folder, `.${name}.html`);
  writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; padding: 32px; background: #e9e7ee; font: 14px/1.4 -apple-system, system-ui, sans-serif; color: #1b1826; }
      h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 20px; margin: 32px 0 12px; } p { margin: 0 0 12px; }
      .row { display: flex; gap: 24px; align-items: flex-start; }
      figure { margin: 0; } figcaption { font-weight: 600; margin-bottom: 6px; }
      .shot { position: relative; box-shadow: 0 1px 0 #0002, 0 0 0 1px #0001; }
      .shot img { display: block; }
      .fold { position: absolute; left: 0; right: 0; border-top: 2px dashed #e0245e; }
    </style><h1>${title}</h1>${body}`,
  );
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`file://${html}`);
  await page.evaluate(() => Promise.all([...document.images].map((image) => (image.complete ? undefined : new Promise((done) => (image.onload = done))))));
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
  await page.setViewportSize({ width: Math.max(1200, size.width + 64), height: 800 });
  const out = resolve(folder, `${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  rmSync(html);
  return out;
}

function picture(shot: Shot, scale: number, caption: string): string {
  const fold = shot.size === "390" ? 844 : 900;
  const width = Math.round(Number(shot.size) * scale);
  return `<figure><figcaption>${caption}</figcaption><div class="shot" style="width:${width}px"><img src="screens/${basename(shot.file)}" width="${width}"><div class="fold" style="top:${Math.round(fold * scale)}px"></div></div></figure>`;
}

/** A finger, or a pointer, held down on an element and let go. */
async function press(page: Page, selector: string, holdMs = 300): Promise<void> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`nothing to press at ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

/**
 * The motion of one look, recorded as a person would meet it, at the width of a phone but with a pointer so the hover
 * can be seen: arriving plays what changed, a pointer circles a character and lifts a button, a press answers, the
 * success of a press brings the gift, scrolling reveals the cards once, and "Replay arrival" plays the arrival again.
 * Kept as a webm and turned into an mp4 and a GIF with ffmpeg.
 */
async function recordMotion(browser: Browser, base: string, folder: string, look: string): Promise<string[]> {
  const raw = resolve(folder, "motion", ".raw");
  mkdirSync(raw, { recursive: true });
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    recordVideo: { dir: raw, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  await page.goto(`${base}/dev/looks/${look}/motion?appearance=day`);
  await page.waitForTimeout(2300);
  const character = await page.locator("[data-gaze] svg").nth(2).boundingBox();
  if (character) {
    const [cx, cy] = [character.x + character.width / 2, character.y + character.height / 2];
    for (const [dx, dy] of [[-30, -20], [30, -20], [30, 25], [-30, 25], [0, 0]]) {
      await page.mouse.move(cx + (dx * character.width) / 80, cy + (dy * character.height) / 80, { steps: 8 });
      await page.waitForTimeout(220);
    }
  }
  await page.mouse.move(195, 820, { steps: 4 });
  await page.waitForTimeout(200);
  await press(page, "[data-press-demo]", 350);
  await page.waitForTimeout(400);
  await press(page, "[data-success-demo]", 250);
  await page.waitForTimeout(1000);
  for (let step = 0; step < 6; step += 1) {
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await press(page, "[data-lab-tool]", 150);
  await page.waitForTimeout(2300);
  const video = page.video();
  await context.close();
  const recorded = await video?.path();
  if (!recorded) throw new Error(`${look}: no recording`);
  const webm = resolve(folder, "motion", `${look}-motion.webm`);
  renameSync(recorded, webm);
  const outputs = [webm];
  try {
    const mp4 = resolve(folder, "motion", `${look}-motion.mp4`);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    const gif = resolve(folder, "motion", `${look}-motion.gif`);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", webm, "-vf", "fps=20,scale=390:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", gif]);
    outputs.push(mp4, gif);
  } catch (error) {
    console.warn(`${look}: ffmpeg could not convert the recording (${error instanceof Error ? error.message : error}); the webm stays`);
  }
  rmSync(raw, { recursive: true, force: true });
  return outputs;
}

/**
 * How long an arrival really lasts in the browser, measured by the page itself: from the first frame anything moves to
 * the last, animations and the counting amount alike. It must end under two seconds (brief, section 6).
 */
async function measureArrival(browser: Browser, base: string, look: string, screen: "home" | "gift"): Promise<number> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "no-preference" });
  // As text, so the watcher reaches the page exactly as written, with nothing a compiler added to it.
  await context.addInitScript(`
    (() => {
      const record = { start: 0, end: 0 };
      window.__arrival = record;
      const began = performance.now();
      const watch = function (now) {
        const moving = document.getAnimations().some(function (animation) { return animation.playState === "running" && Number(animation.currentTime || 0) > 0; })
          || document.querySelector('[data-count-settled="false"]') !== null;
        if (moving) {
          if (record.start === 0) record.start = now;
          record.end = now;
        }
        if (now - began < 8000) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    })();
  `);
  const page = await context.newPage();
  await page.goto(`${base}/dev/looks/${look}/${screen}`);
  await page.waitForTimeout(4500);
  const { start, end } = await page.evaluate(() => (window as unknown as { __arrival: { start: number; end: number } }).__arrival);
  await context.close();
  if (start === 0) throw new Error(`${look} ${screen}: nothing moved on arrival`);
  return Math.round(end - start);
}

/** Under reduced motion nothing may move: two pictures of the motion page, taken seconds apart, must be identical. */
async function stillUnderReducedMotion(browser: Browser, base: string, look: string): Promise<boolean> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${base}/dev/looks/${look}/motion?appearance=day`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const early = await page.screenshot();
  await page.waitForTimeout(4500);
  const late = await page.screenshot();
  const animations = await page.evaluate(() => document.getAnimations().length);
  await context.close();
  return early.equals(late) && animations === 0;
}

async function main() {
  const base = (process.argv[2] ?? "http://127.0.0.1:3107").replace(/\/+$/, "");
  const folder = claimFolder();
  mkdirSync(resolve(folder, "screens"), { recursive: true });
  mkdirSync(resolve(folder, "motion"), { recursive: true });
  mkdirSync(resolve(folder, "outside"), { recursive: true });
  const browser = await chromium.launch();
  const taken = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    const shots: Shot[] = [];
    for (const look of LOOKS) {
      for (const screen of SCREENS) {
        for (const size of SIZES) {
          for (const appearance of APPEARANCES) shots.push(await captureScreen(browser, base, folder, look.id, screen, size, appearance));
        }
      }
    }
    const find = (look: string, screen: string, size: string, appearance: string) =>
      shots.find((shot) => shot.look === look && shot.screen === screen && shot.size === size && shot.appearance === appearance) as Shot;

    const boards: string[] = [];
    for (const look of LOOKS) {
      const phone = SCREENS.map((screen) =>
        APPEARANCES.map((appearance) => picture(find(look.id, screen.id, "390", appearance.name), 1, `${screen.name}, ${appearance.name}`)).join(""),
      ).join("");
      const desktop = SCREENS.map(
        (screen) => `<div class="row">${APPEARANCES.map((appearance) => picture(find(look.id, screen.id, "1440", appearance.name), 0.5, `${screen.name}, ${appearance.name}`)).join("")}</div>`,
      ).join("<br>");
      boards.push(
        await board(
          browser,
          folder,
          `board-${look.number}-${look.id}`,
          `${look.number}. ${look.name}`,
          `<p>${look.intention} Example data. The dashed line is where the first screen ends.</p><h2>390 x 844</h2><div class="row" style="flex-wrap: wrap">${phone}</div><h2>1440 x 900, at half size</h2>${desktop}`,
        ),
      );
    }
    for (const look of LOOKS) {
      const { preview, icons } = await captureOutside(browser, base, folder, look.id);
      const icon = (file: string, size: number) =>
        `<figure><figcaption>Icon, ${size}, as the phone rounds it and as the file is</figcaption><div class="row"><img src="outside/${basename(file)}" width="${size}" height="${size}" style="border-radius:${Math.round(size * 0.2237)}px"><img src="outside/${basename(file)}" width="${size}" height="${size}"></div></figure>`;
      boards.push(
        await board(
          browser,
          folder,
          `board-${look.number}-${look.id}-7-outside`,
          `${look.number}. ${look.name}: outside the app`,
          `<p>Where the person meets Viky most (brief, section 7 bis). Example data.</p><h2>The link preview, 1200 x 630</h2><figure><div class="shot" style="width:1200px"><img src="outside/${basename(preview)}" width="1200" height="630"></div></figure><h2>The icon</h2><div class="row">${icon(icons[0], 512)}${icon(icons[1], 180)}</div>`,
        ),
      );
    }
    for (const screen of SCREENS) {
      const columns = LOOKS.flatMap((look) => APPEARANCES.map((appearance) => picture(find(look.id, screen.id, "390", appearance.name), 1, `${look.number}. ${look.name}, ${appearance.name}`))).join("");
      boards.push(await board(browser, folder, `compare-${screen.id}-390`, `${screen.name}, the three looks at 390`, `<div class="row">${columns}</div>`));
    }

    const motion: string[] = [];
    const still: Record<string, boolean> = {};
    const arrivals: string[] = [];
    for (const look of LOOKS) {
      for (const screen of ["home", "gift"] as const) {
        const ms = await measureArrival(browser, base, look.id, screen);
        if (ms >= 2000) throw new Error(`${look.id} ${screen}: the arrival lasted ${ms} ms`);
        arrivals.push(`${look.id} ${screen} ${ms} ms`);
        console.log(`${look.id} ${screen}: arrival measured at ${ms} ms`);
      }
      motion.push(...(await recordMotion(browser, base, folder, look.id)));
      still[look.id] = await stillUnderReducedMotion(browser, base, look.id);
      if (!still[look.id]) throw new Error(`${look.id}: something moved under reduced motion`);
      console.log(`${look.id}: motion recorded, and nothing moves under reduced motion`);
    }

    const cell = (value: string | number) => String(value).replace(/\|/g, "\\|");
    writeFileSync(
      resolve(folder, "captures.md"),
      [
        "# Looks laboratory, boards",
        "",
        `- Taken ${taken} from ${base}, in Chromium ${browser.version()}, on example data.`,
        "- Each screen was opened in a browser with nothing stored, with the appearance set by the device and reduced motion on, then photographed whole: the viewport was grown to the page's height, so a bar of destinations sits at the bottom of the picture. The file ending in -first-screen is only what fits on the screen.",
        "- Boards: one per look with its six screens (board-N-look), a seventh per look with the link preview and the icon (board-N-look-7-outside), and one per screen comparing the three looks at 390 (compare-*). The pictures of the link preview and the icon are in outside/, at their exact sizes.",
        `- Arrival, measured in the browser from the first frame anything moved to the last, at 390 with motion allowed, on a first visit: ${arrivals.join(", ")}. Each under the brief's two seconds.`,
        "- In every picture of a screen, the column holds at most one accent surface; the bar of destinations is the accent's second use, as the product structure allows.",
        `- Motion: one recording per look in motion/, as webm, mp4 and gif. Under reduced motion, two pictures of each motion page taken 4.5 seconds apart were identical and no animation was running: ${Object.entries(still)
          .map(([look, ok]) => `${look} ${ok ? "yes" : "no"}`)
          .join(", ")}.`,
        "",
        "## Boards",
        "",
        ...boards.map((file) => `- ${basename(file)}`),
        "",
        "## Motion",
        "",
        ...motion.map((file) => `- motion/${basename(file)}`),
        "",
        "## Every screen and what was checked",
        "",
        "| look | screen | size | appearance | picture height | checks |",
        "|---|---|---|---|---|---|",
        ...shots.map((shot) => `| ${[shot.look, shot.screen, shot.size, shot.appearance, shot.height, shot.checks.join("; ")].map(cell).join(" | ")} |`),
        "",
      ].join("\n"),
    );
    console.log(`\nboards and motion: ${folder}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("LOOKS_CAPTURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
