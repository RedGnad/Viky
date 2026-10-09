import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The script of the Toulouse enrolment provider, run on stand-in pages (8 and 9 Oct 2026).
 *
 * A student's pass on version 3.0.0 ended on "file never ready": the script looked for <button> elements, and the
 * file draws its menu with Vaadin buttons. No page drawn that way had ever been put in front of the script. Since
 * the version after 4.0.0 it also draws a veil over the page from the moment the student is signed in, so nobody
 * watches their own file move and stand still, and presses the entry under it.
 *
 * What is real: the two scripts, byte for byte the files pasted at Reclaim (with the character, and the same without
 * it), and a browser that runs them. What is stood in for: the university's two hosts, answered here and never
 * reached; the file's page, drawn as Vaadin 7.7 draws a Button (`VButton`: a div with the role of a button, a
 * "<style>-wrap" and a "<style>-caption", the icon's glyph in front of the caption) with the menu's style esup-mdw
 * gives it (`MainUI.addItemMenu`); Reclaim's bridge, with the members its typings list; and the clock, so two minutes
 * of waiting take none.
 */
const SCRIPT = readFileSync("docs/reclaim/utoulouse-enrolment.js", "utf8");
const WITHOUT_THE_CHARACTER = readFileSync("docs/reclaim/utoulouse-enrolment-no-character.js", "utf8");
const FILE = "https://mondossierweb.univ-tlse3.fr/";
const ENT = "https://ent.utoulouse.fr/";
const VEIL = '[role="status"]';
// A page that allows nothing but its own scripts: no stylesheet, no style attribute, no image, no font, no fetch.
const STRICT = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'">`;

const entry = (label: string, glyph: string, id = "", more = "") =>
  `<div tabindex="0" role="button" class="valo-menu-item"${id ? ` id="${id}"` : ""}${more}><span class="valo-menu-item-wrap"><span class="v-icon FontAwesome">${glyph}</span><span class="valo-menu-item-caption">${label}</span></span></div>`;
// The page says, as its own first act, whether the veil was there before it drew anything; each press it gets; and
// anything its own policy refused.
const first = `<script>window.__line('PAGE starts drawing, veil ' + (document.querySelector('html > [role="status"]') ? 'already there' : 'not there')); document.addEventListener('securitypolicyviolation', function (e) { window.__line('PAGE refused ' + e.violatedDirective); });</script>`;
const pressed = `<script>var e=document.getElementById('insc'); if(e) e.addEventListener('click', function(ev){ window.__line('PAGE pressed, ' + (ev.isTrusted ? 'by a finger' : 'by the script')); location.hash = '#!inscriptionsView'; });</script>`;
const file = (menu: string, head = "", hidden = false) => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${first}<div class="valo-menu"${hidden ? " hidden" : ""}><div class="valo-menu-part">${menu}</div></div>${pressed}</body></html>`;
const SIGNED_IN_ENT = `<!doctype html><html><body>${first}<h1>ENT</h1></body></html>`;
const SIGN_IN_FORM = `<!doctype html><html><body><form action="/cas/login"><input name="username"><input type="password"></form></body></html>`;
const FULL_MENU = entry("Etat-civil", "&#xf007;") + entry("Inscriptions", "&#xf15c;", "insc") + entry("Calendrier des épreuves", "&#xf073;");
const NO_CALENDAR = entry("Etat-civil", "&#xf007;") + entry("Adresses", "&#xf015;") + entry("Inscriptions aux examens", "&#xf15c;") + entry("Inscriptions", "&#xf15c;", "insc");
const NOT_ENABLED = entry("Inscriptions", "&#xf15c;", "insc", ' aria-disabled="true"');
const BRIDGE = "window.Reclaim = { log: function (type, message) { window.__line(String(message)); }, requestClaim: function () {}, requiresUserInteraction: function (needed) { window.__line('BRIDGE told ' + needed); } };";
const LOADED_ON_THE_FILE = "loaded on mondossierweb.univ-tlse3.fr (bridge: log,requestClaim,requiresUserInteraction)";
const LOADED_ON_THE_ENT = "loaded on ent.utoulouse.fr (bridge: log,requestClaim,requiresUserInteraction)";
const VEIL_FIRST = ["veil drawn (readyState=loading)", "character drawn", "PAGE starts drawing, veil already there"];

async function open(context: BrowserContext, input: { start: string; file: string; ent?: string; script?: string }): Promise<{ page: Page; lines: string[]; run: (seconds: number) => Promise<void>; ask: (expression: string) => Promise<unknown> }> {
  const page = await context.newPage();
  const lines: string[] = [];
  await page.exposeFunction("__line", (line: string) => void lines.push(line.replace("[utoulouse-enrolment] ", "")));
  await context.route(`${FILE}**`, (route) => route.fulfill({ contentType: "text/html", body: input.file }));
  await context.route(`${ENT}**`, (route) => route.fulfill({ contentType: "text/html", body: input.ent ?? SIGNED_IN_ENT }));
  await page.clock.install();
  await context.addInitScript({ content: BRIDGE });
  await context.addInitScript({ content: input.script ?? SCRIPT });
  await page.goto(input.start);
  const run = async (seconds: number) => {
    for (let spent = 0; spent < seconds; spent += 1) await page.clock.runFor(1000);
  };
  // Asked of the page in its own words: a function sent from here is not always one the page can run.
  const ask = (expression: string) => page.evaluate(`(() => { const veil = document.querySelector('html > [role="status"]'); const parts = veil ? Array.from(veil.children) : []; return ${expression}; })()`);
  return { page, lines, run, ask };
}

test.describe("the Toulouse enrolment script", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1280, "run once: the script reads no size");

  test("the veil is drawn before the file draws itself, and the press goes to Inscriptions under it", async ({ context }) => {
    const { page, lines, run } = await open(context, { start: FILE, file: file(FULL_MENU) });
    await run(30);
    expect(lines).toEqual([...VEIL_FIRST, LOADED_ON_THE_FILE, "file ready", "no logged-in function on the bridge", "PAGE pressed, by the script", "pressed Inscriptions", "on the Inscriptions view"]);
    expect(page.url()).toBe(`${FILE}#!inscriptionsView`);
    // The veil is still there once the press has been made, on the page's root and not in its body.
    await expect(page.locator(`html > ${VEIL}`)).toHaveCount(1);
    // Reclaim's bridge is called for the log and for nothing else: the call that did nothing is gone.
    expect(lines.filter((line) => line.startsWith("BRIDGE"))).toEqual([]);
  });

  test("the veil is the mockup's: the character, the sentence, what to do, the dot, the whole window", async ({ context }) => {
    const { page, run, ask } = await open(context, { start: FILE, file: file(FULL_MENU) });
    await run(2);
    const veil = page.locator(`html > ${VEIL}`);
    await expect(veil).toHaveCSS("position", "fixed");
    await expect(veil).toHaveCSS("background-color", "rgb(221, 214, 235)");
    await expect(veil).toHaveCSS("color", "rgb(30, 22, 51)");
    await expect(veil).toHaveCSS("z-index", "2147483647");
    await expect(veil).toHaveCSS("text-align", "center");
    const size = page.viewportSize()!;
    expect(await veil.boundingBox()).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    // In its order on the screen: the character, the sentence, what to do, the dot.
    expect(await ask("parts.map((part) => part.querySelector('svg') ? 'character' : part.textContent || 'dot')")).toEqual(["character", "Reading your enrolment.", "Keep this page open.", "dot"]);
    expect(await ask("[getComputedStyle(parts[1]).fontSize, getComputedStyle(parts[1]).fontWeight, getComputedStyle(parts[2]).fontSize, getComputedStyle(parts[2]).opacity]")).toEqual(["20px", "600", "16px", "0.7"]);
    // No duration is said anywhere on it.
    expect(String(await ask("veil.textContent"))).not.toMatch(/\d|minute|second/);
    // One thing moves: the dot goes round, by an animation of the page's own and no stylesheet. The character is still.
    expect(await ask("[parts[3].firstChild.offsetWidth, parts[3].firstChild.offsetHeight, parts[3].getAnimations().length, parts[0].getAnimations({ subtree: true }).length]")).toEqual([10, 10, 1, 0]);
    // Its colours are its own attributes: nothing of it is a style attribute, an image or a font.
    expect(await ask("[veil.querySelectorAll('svg [style]').length, veil.querySelectorAll('img, link, style, canvas').length, veil.querySelector('svg stop').getAttribute('stop-color')]")).toEqual([0, 0, "#FF7F8E"]);
  });

  test("the veil takes the touches: a click and a finger on Inscriptions reach the veil and press nothing", async ({ browser }) => {
    // A screen that is touched, at a phone's size. The menu is there, and the script is kept from pressing: an entry
    // that is not enabled yet.
    const touched = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    try {
      const { page, lines, run } = await open(touched, { start: FILE, file: file(NOT_ENABLED) });
      await run(3);
      const at = (await page.locator("#insc").boundingBox())!;
      const x = at.x + at.width / 2, y = at.y + at.height / 2;
      expect(await page.evaluate(`document.elementFromPoint(${x}, ${y}).closest('[role="status"]') !== null && document.elementFromPoint(${x}, ${y}).closest('#insc') === null`)).toBe(true);
      await page.mouse.click(x, y);
      await page.touchscreen.tap(x, y);
      await run(1);
      expect(lines.filter((line) => line.startsWith("PAGE pressed"))).toEqual([]);
      expect(page.url()).toBe(FILE);
      // The control: with the veil taken away by hand, the same finger at the same place does press the entry.
      await page.evaluate(`document.querySelector('html > [role="status"]').remove()`);
      await page.touchscreen.tap(x, y);
      await run(1);
      expect(lines.filter((line) => line.startsWith("PAGE pressed"))).toEqual(["PAGE pressed, by a finger"]);
    } finally {
      await touched.close();
    }
  });

  test("everything is drawn on a page that allows nothing but its own scripts", async ({ context }) => {
    const { page, lines, run, ask } = await open(context, { start: FILE, file: file(FULL_MENU, STRICT) });
    await run(30);
    // The page refused nothing of the veil: no stylesheet, no style attribute, no image, no font was asked of it.
    expect(lines.filter((line) => line.startsWith("PAGE refused"))).toEqual([]);
    expect(lines).toEqual([...VEIL_FIRST, LOADED_ON_THE_FILE, "file ready", "no logged-in function on the bridge", "PAGE pressed, by the script", "pressed Inscriptions", "on the Inscriptions view"]);
    const veil = page.locator(`html > ${VEIL}`);
    await expect(veil).toHaveCSS("position", "fixed");
    await expect(veil).toHaveCSS("background-color", "rgb(221, 214, 235)");
    const size = page.viewportSize()!;
    expect(await veil.boundingBox()).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    expect(await ask("[parts.length, parts[3].getAnimations().length, getComputedStyle(veil.querySelector('svg path')).fill !== 'rgb(0, 0, 0)', veil.querySelector('svg').getBoundingClientRect().width > 100]")).toEqual([4, 1, true, true]);
    await page.screenshot({ path: test.info().outputPath("veil-on-a-strict-page.png") });
  });

  test("needs no other entry, and prefers the one that says exactly Inscriptions", async ({ context }) => {
    const { lines, run } = await open(context, { start: FILE, file: file(NO_CALENDAR) });
    await run(30);
    expect(lines.slice(-3)).toEqual(["PAGE pressed, by the script", "pressed Inscriptions", "on the Inscriptions view"]);
  });

  test("from the ENT, signed in, the veil is there before the ENT draws, and again before the file does", async ({ context }) => {
    const { page, lines, run } = await open(context, { start: ENT, file: file(FULL_MENU) });
    await run(30);
    expect(lines.slice(0, 9)).toEqual([...VEIL_FIRST, LOADED_ON_THE_ENT, "signed in on the ENT, leaving for the file", ...VEIL_FIRST, LOADED_ON_THE_FILE]);
    expect(lines.at(-1)).toBe("on the Inscriptions view");
    expect(page.url()).toBe(`${FILE}#!inscriptionsView`);
    await expect(page.locator(`html > ${VEIL}`)).toHaveCount(1);
  });

  test("never over a sign-in form: not drawn over one already there, removed when one comes, drawn again once it is gone", async ({ context }) => {
    // The form is on the page before anything can be drawn: the veil is never drawn, and nothing is pressed.
    const already = await open(context, { start: ENT, file: file(FULL_MENU), ent: SIGN_IN_FORM });
    await already.run(10);
    expect(already.lines).toEqual([LOADED_ON_THE_ENT]);
    await expect(already.page.locator(VEIL)).toHaveCount(0);
    expect(already.page.url()).toBe(ENT);
    // The veil is drawn first, the form is found after it: the veil is removed, and the ENT is not left.
    const found = await open(context, { start: ENT, file: file(FULL_MENU), ent: SIGN_IN_FORM.replace("<body>", `<body>${first}`) });
    await found.run(10);
    expect(found.lines).toEqual([...VEIL_FIRST, LOADED_ON_THE_ENT, "veil removed: sign-in form"]);
    await expect(found.page.locator(VEIL)).toHaveCount(0);
    expect(found.page.url()).toBe(ENT);
    // On the file, while its menu is waited for, a form that comes two seconds in (a session that ended) takes the
    // veil away; it is not drawn again while the form stays, and it is once the form is gone.
    const comes = `<script>setTimeout(function () { var f = document.createElement('form'); f.id = 'again'; f.setAttribute('action', '/cas/login'); f.appendChild(document.createElement('input')).type = 'password'; document.body.appendChild(f); }, 2000); setTimeout(function () { document.getElementById('again').remove(); }, 9000);</script>`;
    const onTheFile = await open(context, { start: FILE, file: file(FULL_MENU, "", true).replace("</body>", `${comes}</body>`) });
    await onTheFile.run(1);
    await expect(onTheFile.page.locator(VEIL)).toHaveCount(1);
    await onTheFile.run(7);
    expect(onTheFile.lines).toEqual([...VEIL_FIRST, LOADED_ON_THE_FILE, "veil removed: sign-in form"]);
    await expect(onTheFile.page.locator(VEIL)).toHaveCount(0);
    await onTheFile.run(4);
    expect(onTheFile.lines.slice(5)).toEqual(["veil drawn (readyState=complete)", "character drawn"]);
    await expect(onTheFile.page.locator(`html > ${VEIL}`)).toHaveCount(1);
    expect(onTheFile.lines).not.toContain("pressed Inscriptions");
    // And once the file was ready, while the entry is waited for: the same form takes the veil away all the same.
    const ready = await open(context, { start: FILE, file: file(NOT_ENABLED).replace("</body>", `${comes}</body>`) });
    await ready.run(4);
    expect(ready.lines).toEqual([...VEIL_FIRST, LOADED_ON_THE_FILE, "file ready", "no logged-in function on the bridge", "veil removed: sign-in form"]);
    await expect(ready.page.locator(VEIL)).toHaveCount(0);
  });

  test("when the path gives up the veil says so and where to go, without its dot", async ({ context }) => {
    const never = await open(context, { start: FILE, file: file(FULL_MENU, "", true) });
    await never.run(125);
    expect(never.lines.slice(-2)).toEqual(["file never ready (role-buttons 3, buttons 0, menu items 3, Inscriptions found 1, shown 0, sign-in form no)", "veil failed: file never ready"]);
    expect(await never.ask("[parts[1].textContent, parts[2].textContent, getComputedStyle(parts[3]).visibility, parts[3].getAnimations().length]")).toEqual(["That did not work.", "Go back to Viky and try again.", "hidden", 0]);
    expect(never.lines).not.toContain("pressed Inscriptions");
    const notPressable = await open(context, { start: FILE, file: file(NOT_ENABLED) });
    await notPressable.run(70);
    expect(notPressable.lines.slice(-2)).toEqual(["Inscriptions never pressable (role-buttons 1, buttons 0, menu items 1, Inscriptions found 1, shown 1, sign-in form no)", "veil failed: Inscriptions never pressable"]);
    expect(await notPressable.ask("parts[1].textContent")).toBe("That did not work.");
    // A sign-in form that comes after that still takes the veil away: the form is the person's, whatever the veil says.
    await notPressable.page.evaluate(`document.body.appendChild(document.createElement('form')).appendChild(document.createElement('input')).type = 'password'`);
    await notPressable.run(1);
    expect(notPressable.lines.at(-1)).toBe("veil removed: sign-in form");
    await expect(notPressable.page.locator(VEIL)).toHaveCount(0);
  });

  test("a minute after the press, a page that is still there has given nothing: the veil does not turn for ever", async ({ context }) => {
    const { lines, run, ask } = await open(context, { start: FILE, file: file(FULL_MENU) });
    await run(50);
    expect(lines.at(-1)).toBe("on the Inscriptions view");
    expect(await ask("parts[1].textContent")).toBe("Reading your enrolment.");
    await run(20);
    expect(lines.at(-1)).toBe("veil failed: no proof 60 s after the press");
    expect(await ask("[parts[1].textContent, parts[2].textContent, getComputedStyle(parts[3]).visibility]")).toEqual(["That did not work.", "Go back to Viky and try again.", "hidden"]);
  });

  test("the file without the character is the same path: the veil, the sentence and the dot, and the press", async ({ context }) => {
    const { lines, run, ask } = await open(context, { start: FILE, file: file(FULL_MENU, STRICT), script: WITHOUT_THE_CHARACTER });
    await run(30);
    expect(lines).toEqual(["veil drawn (readyState=loading)", "character not drawn: none in this version", "PAGE starts drawing, veil already there", LOADED_ON_THE_FILE, "file ready", "no logged-in function on the bridge", "PAGE pressed, by the script", "pressed Inscriptions", "on the Inscriptions view"]);
    expect(await ask("parts.map((part) => part.textContent || 'dot')")).toEqual(["Reading your enrolment.", "Keep this page open.", "dot"]);
  });
});
