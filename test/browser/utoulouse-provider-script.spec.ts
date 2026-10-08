import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The script of the Toulouse enrolment provider, run on stand-in pages (8 and 9 Oct 2026).
 *
 * A student's pass on version 3.0.0 ended on "file never ready": the script looked for <button> elements, and the
 * file draws its menu with Vaadin buttons. No page drawn that way had ever been put in front of the script. Since
 * 4.0.1 it also draws a veil over the page from the moment the student is signed in, so nobody watches their own
 * file move and stand still, and presses the entry under it.
 *
 * What is real: the script, byte for byte the file pasted at Reclaim, and a browser that runs it. What is stood in
 * for: the university's two hosts, answered here and never reached; the file's page, drawn as Vaadin 7.7 draws a
 * Button (`VButton`: a div with the role of a button, a "<style>-wrap" and a "<style>-caption", the icon's glyph in
 * front of the caption) with the menu's style esup-mdw gives it (`MainUI.addItemMenu`); Reclaim's bridge, with the
 * members its typings list; and the clock, so two minutes of waiting take none.
 */
const SCRIPT = readFileSync("docs/reclaim/utoulouse-enrolment.js", "utf8");
const FILE = "https://mondossierweb.univ-tlse3.fr/";
const ENT = "https://ent.utoulouse.fr/";
const VEIL = "#__viky_reading_veil";

const entry = (label: string, glyph: string, id = "") =>
  `<div tabindex="0" role="button" class="valo-menu-item"${id ? ` id="${id}"` : ""}><span class="valo-menu-item-wrap"><span class="v-icon FontAwesome">${glyph}</span><span class="valo-menu-item-caption">${label}</span></span></div>`;
// The page says, as its own first act, whether the veil was there before it drew anything; and each press it gets.
const first = `<script>window.__line('PAGE starts drawing, veil ' + (document.getElementById('__viky_reading_veil') ? 'already there' : 'not there'));</script>`;
const pressed = `<script>var e=document.getElementById('insc'); if(e) e.addEventListener('click', function(ev){ window.__line('PAGE pressed, ' + (ev.isTrusted ? 'by a finger' : 'by the script')); location.hash = '#!inscriptionsView'; });</script>`;
const file = (menu: string, style = "") => `<!doctype html><html><head><meta charset="utf-8"></head><body>${first}<div class="valo-menu" style="${style}"><div class="valo-menu-part">${menu}</div></div>${pressed}</body></html>`;
const SIGNED_IN_ENT = `<!doctype html><html><body>${first}<h1>ENT</h1></body></html>`;
const SIGN_IN_FORM = `<!doctype html><html><body><form action="/cas/login"><input name="username"><input type="password"></form></body></html>`;
const FULL_MENU = entry("Etat-civil", "&#xf007;") + entry("Inscriptions", "&#xf15c;", "insc") + entry("Calendrier des épreuves", "&#xf073;");
const NO_CALENDAR = entry("Etat-civil", "&#xf007;") + entry("Adresses", "&#xf015;") + entry("Inscriptions aux examens", "&#xf15c;") + entry("Inscriptions", "&#xf15c;", "insc");
const BRIDGE = "window.Reclaim = { log: function (type, message) { window.__line(String(message)); }, requestClaim: function () {}, requiresUserInteraction: function (needed) { window.__line('BRIDGE told ' + needed); } };";
const LOADED_ON_THE_FILE = "loaded on mondossierweb.univ-tlse3.fr (bridge: log,requestClaim,requiresUserInteraction)";
const LOADED_ON_THE_ENT = "loaded on ent.utoulouse.fr (bridge: log,requestClaim,requiresUserInteraction)";

async function open(context: BrowserContext, input: { start: string; file: string; ent?: string }): Promise<{ page: Page; lines: string[]; run: (seconds: number) => Promise<void> }> {
  const page = await context.newPage();
  const lines: string[] = [];
  await page.exposeFunction("__line", (line: string) => void lines.push(line.replace("[utoulouse-enrolment] ", "")));
  await context.route(`${FILE}**`, (route) => route.fulfill({ contentType: "text/html", body: input.file }));
  await context.route(`${ENT}**`, (route) => route.fulfill({ contentType: "text/html", body: input.ent ?? SIGNED_IN_ENT }));
  await page.clock.install();
  await context.addInitScript({ content: BRIDGE });
  await context.addInitScript({ content: SCRIPT });
  await page.goto(input.start);
  const run = async (seconds: number) => {
    for (let spent = 0; spent < seconds; spent += 1) await page.clock.runFor(1000);
  };
  return { page, lines, run };
}

test.describe("the Toulouse enrolment script", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1280, "run once: the script reads no size");

  test("the veil is drawn before the file draws itself, and the press goes to Inscriptions under it", async ({ context }) => {
    const { page, lines, run } = await open(context, { start: FILE, file: file(FULL_MENU) });
    await run(30);
    expect(lines).toEqual([
      "veil drawn (at the start)",
      "PAGE starts drawing, veil already there",
      LOADED_ON_THE_FILE,
      "file ready",
      "no logged-in function on the bridge",
      "PAGE pressed, by the script",
      "pressed Inscriptions",
      "on the Inscriptions view",
    ]);
    expect(page.url()).toBe(`${FILE}#!inscriptionsView`);
    // To the end: the veil is still there once the press has been made.
    await expect(page.locator(VEIL)).toHaveCount(1);
    // Reclaim's bridge is called for the log and for nothing else: the call that did nothing is gone.
    expect(lines.filter((line) => line.startsWith("BRIDGE"))).toEqual([]);
  });

  test("the veil is the plain screen that was asked for: its ground, its words, its dot, the whole window", async ({ context }) => {
    const { page, run } = await open(context, { start: FILE, file: file(FULL_MENU) });
    await run(2);
    const veil = page.locator(VEIL);
    await expect(veil).toHaveText("Reading your enrolment. Nothing to do.");
    await expect(veil).toHaveCSS("position", "fixed");
    await expect(veil).toHaveCSS("background-color", "rgb(221, 214, 235)");
    await expect(veil).toHaveCSS("color", "rgb(30, 22, 51)");
    await expect(veil).toHaveCSS("z-index", "2147483647");
    await expect(veil).toHaveCSS("font-family", "-apple-system, Helvetica, sans-serif");
    const words = veil.locator("p");
    await expect(words).toHaveCSS("font-size", "20px");
    await expect(words).toHaveCSS("text-align", "center");
    const size = page.viewportSize()!;
    expect(await veil.boundingBox()).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    // A dot of 12 px under the words, turning by one rule of CSS, with nothing fetched.
    const dot = veil.locator("div > div");
    // Asked of the page in its own words: a function sent from here is not always one the page can run.
    const ask = (expression: string) => page.evaluate(`(() => { const veil = document.querySelector("${VEIL}"); const turn = veil.querySelector("div"); const dot = turn.querySelector("div"); return ${expression}; })()`);
    expect(await ask("[dot.offsetWidth, dot.offsetHeight, getComputedStyle(dot).borderRadius, getComputedStyle(dot).backgroundColor]")).toEqual([12, 12, "50%", "rgb(30, 22, 51)"]);
    expect(await ask("[getComputedStyle(turn).animationName, getComputedStyle(turn).animationIterationCount, getComputedStyle(turn).animationDuration]")).toEqual(["viky-veil-turn", "infinite", "1s"]);
    expect((await dot.boundingBox())!.y).toBeGreaterThan((await words.boundingBox())!.y);
    expect(await ask("veil.querySelectorAll('img, svg, link, canvas').length + (veil.innerHTML.includes('url(') ? 1 : 0) + (veil.innerHTML.includes('@font-face') ? 1 : 0)")).toBe(0);
    // Centred in the window, to the pixel.
    const box = (await words.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(1);
  });

  test("the veil takes the touches: a finger on Inscriptions reaches the veil and presses nothing", async ({ context }) => {
    // The menu is there, and the script is kept from pressing: an entry that is not enabled yet.
    const { page, lines, run } = await open(context, { start: FILE, file: file(FULL_MENU.replace('id="insc"', 'id="insc" aria-disabled="true"')) });
    await run(3);
    const at = (await page.locator("#insc").boundingBox())!;
    const x = at.x + at.width / 2, y = at.y + at.height / 2;
    expect(await page.evaluate(`document.elementFromPoint(${x}, ${y}).closest('${VEIL}') !== null`)).toBe(true);
    await page.mouse.click(x, y);
    await page.touchscreen.tap(x, y).catch(() => undefined);
    await run(1);
    expect(lines.filter((line) => line.startsWith("PAGE pressed"))).toEqual([]);
    expect(page.url()).toBe(FILE);
  });

  test("needs no other entry, and prefers the one that says exactly Inscriptions", async ({ context }) => {
    const { lines, run } = await open(context, { start: FILE, file: file(NO_CALENDAR) });
    await run(30);
    expect(lines.slice(-3)).toEqual(["PAGE pressed, by the script", "pressed Inscriptions", "on the Inscriptions view"]);
  });

  test("from the ENT, signed in, the veil is there before the ENT draws, and again before the file does", async ({ context }) => {
    const { page, lines, run } = await open(context, { start: ENT, file: file(FULL_MENU) });
    await run(30);
    expect(lines.slice(0, 7)).toEqual([
      "veil drawn (at the start)",
      "PAGE starts drawing, veil already there",
      LOADED_ON_THE_ENT,
      "signed in on the ENT, leaving for the file",
      "veil drawn (at the start)",
      "PAGE starts drawing, veil already there",
      LOADED_ON_THE_FILE,
    ]);
    expect(lines.at(-1)).toBe("on the Inscriptions view");
    expect(page.url()).toBe(`${FILE}#!inscriptionsView`);
    await expect(page.locator(VEIL)).toHaveCount(1);
  });

  test("a sign-in form needs the person: the veil comes off, on the ENT and on the file, and nothing is pressed", async ({ context }) => {
    const ent = await open(context, { start: ENT, file: file(FULL_MENU), ent: SIGN_IN_FORM });
    await ent.run(10);
    expect(ent.lines).toEqual(["veil drawn (at the start)", LOADED_ON_THE_ENT, "veil taken off (sign-in form on the ENT)"]);
    await expect(ent.page.locator(VEIL)).toHaveCount(0);
    expect(ent.page.url()).toBe(ENT);
    const form = `<!doctype html><html><body><form action="/cas/login"><input type="password"></form></body></html>`;
    const onTheFile = await open(context, { start: FILE, file: form });
    await onTheFile.run(10);
    expect(onTheFile.lines).toEqual(["veil drawn (at the start)", LOADED_ON_THE_FILE, "veil taken off (sign-in form on the file)"]);
    await expect(onTheFile.page.locator(VEIL)).toHaveCount(0);
  });

  test("when the script gives up the veil comes off, and the last line counts what was found", async ({ context }) => {
    const { page, lines, run } = await open(context, { start: FILE, file: file(FULL_MENU, "display:none") });
    await run(125);
    expect(lines.slice(-2)).toEqual(["file never ready (role-buttons 3, buttons 0, menu items 3, Inscriptions found 1, shown 0, sign-in form no)", "veil taken off (gave up)"]);
    expect(lines).not.toContain("pressed Inscriptions");
    await expect(page.locator(VEIL)).toHaveCount(0);
    expect(page.url()).toBe(FILE);
  });
});
