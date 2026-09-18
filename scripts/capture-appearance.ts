import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, devices, type Page } from "@playwright/test";
import { COLOURS, TAP_TARGET, THEME_STORAGE_KEY } from "../src/design-tokens";
import { APPEARANCE } from "../src/sentences";

/**
 * The six screens a person can reach without an account, in the three states of the appearance control (D97), at the
 * two sizes a review is judged at.
 *
 * The three states are captured against the device setting that proves each one, because a state that agrees with the
 * device proves nothing: "as your device" is taken on a dark device, "day" on a dark device, "night" on a light one.
 * Each image is checked before it is kept: the ground the browser actually painted must be the ground the state asks
 * for, and the control's own name must say the state it is in. A run that cannot say that fails rather than writing a
 * picture nobody can trust.
 *
 * Signed-in screens are not here, and cannot be: a passkey cannot be replayed by a script (scripts/review-capture.ts
 * says the same). What they share with these is the header, which is the thing this run is about.
 *
 * Usage: `pnpm capture:appearance http://localhost:3130`.
 */

const SIZES = [
  { name: "390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  { name: "1440x900", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
] as const;

/** Each state, the device it is proved against, and the ground it must paint. */
const STATES = [
  { name: "as-your-device", stored: null, device: "dark", ground: COLOURS.dark.background, label: APPEARANCE.system },
  { name: "day", stored: "light", device: "dark", ground: COLOURS.light.background, label: APPEARANCE.light },
  { name: "night", stored: "dark", device: "light", ground: COLOURS.dark.background, label: APPEARANCE.dark },
] as const;

/** Six screens, every one of them reachable with no account: a destination, two tasks and three documents. */
const SCREENS = ["/", "/fund", "/help", "/legal", "/privacy", "/judges"] as const;

const slug = (path: string) => (path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-"));

function pngSize(bytes: Buffer): { width: number; height: number } {
  const isPng = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && bytes.subarray(12, 16).toString("latin1") === "IHDR";
  if (!isPng) throw new Error("a capture is not a PNG file");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** #151026 as the browser reports it, so what was asked for and what was painted can be compared. */
function rgbOf(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function main() {
  const site = process.argv[2] ?? "http://localhost:3130";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const folder = resolve("review-captures", `appearance-${stamp}`);
  mkdirSync(folder, { recursive: true });
  const rows: string[] = [];
  const browser = await chromium.launch();

  for (const size of SIZES) {
    for (const state of STATES) {
      const context = await browser.newContext({ ...size.use, colorScheme: state.device });
      // Written before anything is loaded, which is what a person's own browser hands the page on a second visit.
      // The script is passed as a string on purpose: a function is compiled on the way in and arrives broken.
      if (state.stored) {
        await context.addInitScript(`try{localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},${JSON.stringify(state.stored)})}catch(e){}`);
      }
      const page = await context.newPage();
      for (const screen of SCREENS) {
        const answer = await page.goto(`${site}${screen}`);
        if ((answer?.status() ?? 0) >= 400) throw new Error(`${screen} answered ${answer?.status()}`);
        await settle(page);
        const painted = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        if (painted !== rgbOf(state.ground)) throw new Error(`${screen} at ${size.name} in ${state.name} painted ${painted}, not ${rgbOf(state.ground)}`);
        const control = page.locator("header button[aria-label^='Appearance']").first();
        const named = await control.getAttribute("aria-label");
        if (named !== state.label) throw new Error(`${screen} at ${size.name} in ${state.name} names the control "${named}"`);
        // The target a finger has to hit, which no picture can show: measured here and written beside the image, so a
        // reader can judge it from the folder rather than take it on trust.
        const box = await control.boundingBox();
        if (!box || box.width < TAP_TARGET || box.height < TAP_TARGET) {
          throw new Error(`${screen} at ${size.name} in ${state.name} offers a target of ${box?.width}x${box?.height}`);
        }
        const file = `${slug(screen)}-${state.name}-${size.name}.png`;
        await page.screenshot({ path: resolve(folder, file) });
        const image = pngSize(readFileSync(resolve(folder, file)));
        if (`${image.width}x${image.height}` !== size.name) throw new Error(`${file} is ${image.width}x${image.height}`);
        rows.push(
          `| ${file} | ${screen} | ${state.name} | device ${state.device} | ${painted} | ${image.width}x${image.height} | ${box.width}x${box.height} | ${named} |`,
        );
        console.log(file);
      }
      await context.close();
    }
  }
  await browser.close();
  writeFileSync(
    resolve(folder, "captures.md"),
    [
      `# The appearance control, ${SCREENS.length} screens in three states, ${new Date().toISOString().slice(0, 10)}`,
      "",
      `From ${site}. Each state is taken against the device setting that proves it. Four things are read back from the`,
      `browser rather than judged from the picture: the ground it painted, the size of the image, the target the control`,
      `offers a finger (the floor is ${TAP_TARGET}), and the name a screen reader would announce, which is all an icon`,
      "alone ever says. Nothing is signed in: a passkey cannot be replayed by a script.",
      "",
      "| file | screen | state | device | ground painted | image | target measured | name read back |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
  console.log(folder);
}

main().catch((error) => {
  console.error("CAPTURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
