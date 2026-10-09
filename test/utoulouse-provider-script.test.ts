// The script of the Toulouse enrolment provider (8 Oct 2026), kept in docs/reclaim as it is pasted at Reclaim. A
// student's pass on version 3.0.0 ended on "file never ready": the script looked for <button> elements where the
// file draws its menu with Vaadin buttons, which are divs. What is pinned here is what that pass taught; the script
// itself is run on stand-in pages by test/browser/utoulouse-provider-script.spec.ts.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const SCRIPT = readFileSync("docs/reclaim/utoulouse-enrolment.js", "utf8");
// The same script without the character, for the day Reclaim's field refuses the length of the first.
const WITHOUT_THE_CHARACTER = readFileSync("docs/reclaim/utoulouse-enrolment-no-character.js", "utf8");
const NOTES = readFileSync("docs/reclaim/utoulouse-enrolment-provider.md", "utf8");

test("the notes name each script by its hash, so the file pasted at Reclaim is a file kept here", () => {
  for (const script of [SCRIPT, WITHOUT_THE_CHARACTER]) {
    const hash = createHash("sha256").update(script, "utf8").digest("hex");
    assert.ok(NOTES.includes(`sha256 \`${hash}\``), `the notes do not carry ${hash}`);
  }
});

test("the script without the character is the same script but for the one line that holds the drawing", () => {
  const lines = SCRIPT.split("\n"), others = WITHOUT_THE_CHARACTER.split("\n");
  assert.equal(lines.length, others.length);
  const differ = lines.flatMap((line, at) => (line === others[at] ? [] : [at]));
  assert.equal(differ.length, 1);
  assert.ok(lines[differ[0]!]!.startsWith('  var FIGURE = "<svg '));
  assert.equal(others[differ[0]!], "  var FIGURE = null;");
  // Both are plain ASCII: nothing a field or a paste can change on the way.
  for (const script of [SCRIPT, WITHOUT_THE_CHARACTER]) assert.doesNotMatch(script, /[^\n -~]/);
});

test("a menu entry is looked for as Vaadin draws a button, and as a plain button too", () => {
  assert.ok(SCRIPT.includes(`const ENTRY_SELECTOR = '[role="button"], button, .v-button, .valo-menu-item';`));
  // The label is the caption's, with the icon font's glyph taken out: the two are drawn with no space between them.
  assert.ok(SCRIPT.includes(`el.querySelector('[class*="caption"]')`));
  assert.ok(SCRIPT.includes("replace(/[\\uE000-\\uF8FF]/g, ' ')"));
  // Never <button> alone again, anywhere an entry is looked for.
  assert.doesNotMatch(SCRIPT, /querySelectorAll\('button'\)\)/);
});

test("the file is ready when Inscriptions is shown: no other entry is asked for", () => {
  const ready = SCRIPT.slice(SCRIPT.indexOf("function appAuthenticated()"), SCRIPT.indexOf("// One line per step"));
  assert.ok(ready.includes("return !!visibleAppButton('Inscriptions');"));
  assert.doesNotMatch(ready, /Etat-civil|Calendrier/);
  // The two other entries are named nowhere as something to find.
  assert.doesNotMatch(SCRIPT, /visibleAppButton\('(Etat-civil|Calendrier[^']*)'\)/);
});

test("every line of the session's log that told what happened is still written", () => {
  for (const line of [
    "'loaded on ' + location.hostname",
    "'signed in on the ENT, leaving for the file'",
    "'file ready'",
    "'file never ready ('",
    "'logged-in signal sent'",
    "'no logged-in function on the bridge'",
    "'pressed Inscriptions'",
    "'Inscriptions never pressable ('",
    "'press on Inscriptions threw'",
    "'veil drawn (readyState=' + document.readyState + ')'",
    "'character drawn'",
    "'character not drawn: ' + ",
    "'veil removed: ' + why",
    "'veil failed: ' + reason",
  ]) {
    assert.ok(SCRIPT.includes(line), line);
  }
  assert.ok(SCRIPT.includes("const LOG_PREFIX = '[utoulouse-enrolment]';"));
  // A line carries counts, never what the page shows of the student.
  assert.doesNotMatch(SCRIPT, /log\([^)]*(innerText|textContent|labelOf|document\.title|location\.href)/);
});

test("the veil is the mockup's, drawn with the page's own means on the page's root", () => {
  // The founder's rule (8 and 9 Oct 2026): a portal that stands still after the sign-in reads as broken in a second
  // and a half, so nobody watches their own file move. FIGURE and drawVeil are the mockup's own text.
  const veil = SCRIPT.slice(SCRIPT.indexOf("  function drawVeil(host, position, figureSvg) {"), SCRIPT.indexOf("  let veilNow = null;"));
  for (const said of ["s.zIndex = '2147483647'; s.background = '#DDD6EB'; s.color = '#1E1633';", "line.textContent = 'Reading your enrolment.';", "sub.textContent = 'Keep this page open.';", "line.textContent = 'That did not work.';", "sub.textContent = 'Go back to Viky and try again.';", "if (turning) turning.cancel();", "orbit.style.visibility = 'hidden';", "{ capture: true, passive: false }"]) {
    assert.ok(veil.includes(said), said);
  }
  // No duration is said on it: none has been measured.
  assert.deepEqual([...veil.matchAll(/textContent = '([^']+)'/g)].map((found) => found[1]).filter((said) => /\d|minute|second/.test(said!)), []);
  // Fixed, on the root: the file redrawing its body does not take it away.
  assert.ok(SCRIPT.includes("veilNow = drawVeil(document.documentElement, 'fixed', null);"));
  // Nothing in it needs a stylesheet, a style attribute in markup, an image or a font: a page that allows none of
  // them still shows all of it. The one thing set from text is the drawing, and it carries its colours as attributes.
  assert.doesNotMatch(veil, /@font-face|@import|@keyframes|<img|<style|new Image|createElement\('(img|link|style|canvas)'\)|cssText|setAttribute\('style'/);
  const figure = SCRIPT.split("\n").find((line) => line.startsWith("  var FIGURE = "))!;
  assert.doesNotMatch(figure, /style=|<style|href|<image|<script|\son\w+=/);
  assert.deepEqual([...new Set([...figure.matchAll(/url\(([^)]+)\)/g)].map((found) => found[1]))].sort(), ["#icon-body", "#icon-edge"]);
  // The veil, the sentence and the dot first; the character after them, in a step of its own that says how it went.
  const shown = SCRIPT.slice(SCRIPT.indexOf("  function showVeil() {"), SCRIPT.indexOf("  // The path gave up"));
  assert.ok(shown.indexOf("veilNow = drawVeil(") < shown.indexOf("log('veil drawn (") && shown.indexOf("log('veil drawn (") < shown.indexOf("drawCharacter(veilNow.veil);"));
  const character = SCRIPT.slice(SCRIPT.indexOf("  function drawCharacter(veil) {"), SCRIPT.indexOf("  function removeVeil(why) {"));
  assert.match(character, /try \{[\s\S]+log\('character drawn'\);[\s\S]+\} catch \(e\) \{\s+log\('character not drawn: '/);
});

test("the veil is drawn as early as the page has a root, never over a sign-in form, and says when the path gave up", () => {
  // On the two hosts, before the page is waited for; not on the ENT once the script has left it.
  assert.ok(SCRIPT.includes("if (onTheFile || (onTheEnt && !state.applicationNavigationAttempted)) veilAtOnce();"));
  assert.ok(SCRIPT.indexOf("veilAtOnce();") < SCRIPT.indexOf("await until(() => document.readyState !== 'loading', 15000, 100);"), "before the page is waited for");
  // Never drawn over a sign-in form, and removed for one, whatever the veil says by then.
  assert.ok(SCRIPT.includes("if (document.body && hasLoginNegativeSignal()) return;"));
  assert.ok(SCRIPT.includes("if (veilNow && hasLoginNegativeSignal()) removeVeil('sign-in form');"));
  assert.deepEqual([...new Set([...SCRIPT.matchAll(/removeVeil\('([^']+)'\)/g)].map((found) => found[1]))], ["sign-in form"]);
  // It fails where the path gives up, and a minute after a press that the page outlived. Never on the press itself.
  assert.deepEqual([...SCRIPT.matchAll(/failVeil\('([^']+)'\)/g)].map((found) => found[1]).sort(), ["Inscriptions never pressable", "file never ready", "no proof 60 s after the press", "press on Inscriptions threw"]);
  assert.ok(SCRIPT.includes("setTimeout(() => failVeil('no proof 60 s after the press'), 60000);"));
  // The press is the entry's own click, which a veil over it does not stop.
  assert.ok(SCRIPT.includes("target.click();"));
  assert.doesNotMatch(SCRIPT, /MouseEvent|dispatchEvent/);
  // The call to Reclaim's bridge that did nothing on the web page is gone: the bridge is asked for the log, and for
  // the logged-in signal where it offers one.
  assert.doesNotMatch(SCRIPT, /requiresUserInteraction/);
  assert.deepEqual([...new Set([...SCRIPT.matchAll(/window\.Reclaim\.(\w+)\(/g)].map((found) => found[1]))].sort(), ["log", "reportUserLoggedIn"]);
  // It reads one university's two hosts and goes to no other address.
  const addresses = [...SCRIPT.matchAll(/https?:\/\/[^\s'"]+/g)].map((found) => found[0]);
  assert.deepEqual(addresses, ["https://mondossierweb.univ-tlse3.fr/"]);
});

test("the notes carry the record as the pin was worked out from it", () => {
  assert.ok(NOTES.includes("`POST https://mondossierweb.univ-tlse3.fr/UIDL/?v-uiId=0`"));
  assert.ok(NOTES.includes('contains `"{{academicYear}}","`'));
  assert.ok(NOTES.includes('`"tr",\\{"key":\\d+\\},"(?<academicYear>2026\\\\/2027)","[^"]+"`'));
  assert.ok(NOTES.includes("--ahead <version> --field academicYear --matches '^2026\\\\/2027$'"));
});
