import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * The script of the Toulouse enrolment provider, run on stand-in pages (8 Oct 2026).
 *
 * A student's pass on version 3.0.0 ended on "file never ready": the script looked for <button> elements, and the
 * file draws its menu with Vaadin buttons. No page drawn that way had ever been put in front of the script.
 *
 * What is real: the script, byte for byte the file pasted at Reclaim, and a browser that runs it. What is stood in
 * for: the university's two hosts, answered here and never reached; the file's page, drawn as Vaadin 7.7 draws a
 * Button (`VButton`: a div with the role of a button, a "<style>-wrap" and a "<style>-caption", the icon's glyph in
 * front of the caption) with the menu's style esup-mdw gives it (`MainUI.addItemMenu`); Reclaim's bridge, with the
 * members its typings list and no `reportUserLoggedIn`; and the clock, so two minutes of waiting take none.
 */
const SCRIPT = readFileSync("docs/reclaim/utoulouse-enrolment.js", "utf8");
const FILE = "https://mondossierweb.univ-tlse3.fr/";
const ENT = "https://ent.utoulouse.fr/";

const entry = (label: string, glyph: string, id = "") =>
  `<div tabindex="0" role="button" class="valo-menu-item"${id ? ` id="${id}"` : ""}><span class="valo-menu-item-wrap"><span class="v-icon FontAwesome">${glyph}</span><span class="valo-menu-item-caption">${label}</span></span></div>`;
const pressed = `<script>var e=document.getElementById('insc'); if(e) e.addEventListener('click', function(ev){ window.__line('PAGE pressed at ' + (ev.clientX > 0 && ev.clientY > 0 ? 'its own place' : 'nowhere')); location.hash = '#!inscriptionsView'; });</script>`;
const file = (menu: string, style = "") => `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="valo-menu" style="${style}"><div class="valo-menu-part">${menu}</div></div>${pressed}</body></html>`;
const SIGNED_IN_ENT = `<!doctype html><html><body><h1>ENT</h1></body></html>`;
const SIGN_IN_FORM = `<!doctype html><html><body><form action="/cas/login"><input name="username"><input type="password"></form></body></html>`;
const FULL_MENU = entry("Etat-civil", "&#xf007;") + entry("Inscriptions", "&#xf15c;", "insc") + entry("Calendrier des épreuves", "&#xf073;");
const NO_CALENDAR = entry("Etat-civil", "&#xf007;") + entry("Adresses", "&#xf015;") + entry("Inscriptions aux examens", "&#xf15c;") + entry("Inscriptions", "&#xf15c;", "insc");

const BRIDGE = {
  whole: "window.Reclaim = { log: function (type, message) { window.__line(String(message)); }, requestClaim: function () {}, requiresUserInteraction: function (needed) { window.__line('BRIDGE told ' + needed); } };",
  withoutTheFunction: "window.Reclaim = { log: function (type, message) { window.__line(String(message)); }, requestClaim: function () {} };",
  whoseFunctionThrows: "window.Reclaim = { log: function (type, message) { window.__line(String(message)); }, requestClaim: function () {}, requiresUserInteraction: function () { throw new Error('not here'); } };",
} as const;

async function run(context: BrowserContext, input: { start: string; file: string; ent?: string; seconds: number; bridge?: keyof typeof BRIDGE }): Promise<{ lines: string[]; url: string }> {
  const page = await context.newPage();
  const lines: string[] = [];
  await page.exposeFunction("__line", (line: string) => void lines.push(line.replace("[utoulouse-enrolment] ", "")));
  await context.route(`${FILE}**`, (route) => route.fulfill({ contentType: "text/html", body: input.file }));
  await context.route(`${ENT}**`, (route) => route.fulfill({ contentType: "text/html", body: input.ent ?? SIGNED_IN_ENT }));
  await page.clock.install();
  await context.addInitScript({ content: BRIDGE[input.bridge ?? "whole"] });
  await context.addInitScript({ content: SCRIPT });
  await page.goto(input.start);
  for (let spent = 0; spent < input.seconds; spent += 1) await page.clock.runFor(1000);
  return { lines, url: page.url() };
}

test.describe("the Toulouse enrolment script", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1280, "run once: the script reads no size");

  test("finds Inscriptions in a menu drawn as Vaadin draws it, and presses it once, at its own place", async ({ context }) => {
    const { lines, url } = await run(context, { start: FILE, file: file(FULL_MENU), seconds: 30 });
    expect(lines).toEqual([
      "loaded on mondossierweb.univ-tlse3.fr (bridge: log,requestClaim,requiresUserInteraction)",
      "file ready",
      "BRIDGE told false",
      "user interaction not required (file ready): told",
      "no logged-in function on the bridge",
      "PAGE pressed at its own place",
      "pressed Inscriptions",
      "on the Inscriptions view",
    ]);
    expect(url).toBe(`${FILE}#!inscriptionsView`);
  });

  test("needs no other entry, and prefers the one that says exactly Inscriptions", async ({ context }) => {
    const { lines } = await run(context, { start: FILE, file: file(NO_CALENDAR), seconds: 30 });
    expect(lines.slice(-3)).toEqual(["PAGE pressed at its own place", "pressed Inscriptions", "on the Inscriptions view"]);
  });

  test("from the ENT, signed in, it leaves for the file and goes on there", async ({ context }) => {
    const { lines, url } = await run(context, { start: ENT, file: file(FULL_MENU), seconds: 30 });
    // The wait is asked for as soon as the student is signed in, before the page leaves for the file.
    expect(lines.slice(0, 5)).toEqual([
      "loaded on ent.utoulouse.fr (bridge: log,requestClaim,requiresUserInteraction)",
      "signed in on the ENT, leaving for the file",
      "BRIDGE told false",
      "user interaction not required (signed in on the ENT): told",
      "loaded on mondossierweb.univ-tlse3.fr (bridge: log,requestClaim,requiresUserInteraction)",
    ]);
    expect(lines.at(-1)).toBe("on the Inscriptions view");
    expect(url).toBe(`${FILE}#!inscriptionsView`);
  });

  test("on the ENT's sign-in form it does nothing and goes nowhere", async ({ context }) => {
    const ent = await run(context, { start: ENT, file: file(FULL_MENU), ent: SIGN_IN_FORM, seconds: 10 });
    expect(ent.lines).toEqual(["loaded on ent.utoulouse.fr (bridge: log,requestClaim,requiresUserInteraction)"]);
    expect(ent.url).toBe(ENT);
  });

  test("a bridge without the function, or whose function throws, is said in the log and stops nothing", async ({ context }) => {
    const without = await run(context, { start: ENT, file: file(FULL_MENU), seconds: 30, bridge: "withoutTheFunction" });
    expect(without.lines).toContain("user interaction not required (signed in on the ENT): no such function on the bridge");
    expect(without.lines.at(-1)).toBe("on the Inscriptions view");
    const throwing = await run(context, { start: ENT, file: file(FULL_MENU), seconds: 30, bridge: "whoseFunctionThrows" });
    expect(throwing.lines).toContain("user interaction not required (signed in on the ENT): the call threw");
    expect(throwing.lines).toContain("user interaction not required (file ready): the call threw");
    expect(throwing.lines.at(-1)).toBe("on the Inscriptions view");
  });

  test("a sign-in form on the file, after the wait was asked for, gives the page back to the person", async ({ context }) => {
    const form = `<!doctype html><html><body><form action="/cas/login"><input type="password"></form></body></html>`;
    const { lines } = await run(context, { start: FILE, file: form, seconds: 10 });
    expect(lines).toEqual(["loaded on mondossierweb.univ-tlse3.fr (bridge: log,requestClaim,requiresUserInteraction)", "BRIDGE told true", "user interaction required (sign-in form on the file): told"]);
  });

  test("a menu that is there and not shown is never pressed, and the last line counts what was found", async ({ context }) => {
    const { lines, url } = await run(context, { start: FILE, file: file(FULL_MENU, "display:none"), seconds: 125 });
    expect(lines.at(-1)).toBe("file never ready (role-buttons 3, buttons 0, menu items 3, Inscriptions found 1, shown 0, sign-in form no)");
    expect(lines).not.toContain("pressed Inscriptions");
    expect(url).toBe(FILE);
  });
});
