// The script of the Toulouse enrolment provider (8 Oct 2026), kept in docs/reclaim as it is pasted at Reclaim. A
// student's pass on version 3.0.0 ended on "file never ready": the script looked for <button> elements where the
// file draws its menu with Vaadin buttons, which are divs. What is pinned here is what that pass taught; the script
// itself is run on stand-in pages by test/browser/utoulouse-provider-script.spec.ts.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const SCRIPT = readFileSync("docs/reclaim/utoulouse-enrolment.js", "utf8");
const NOTES = readFileSync("docs/reclaim/utoulouse-enrolment-provider.md", "utf8");

test("the notes name the script by its hash, so the file pasted at Reclaim is the file kept here", () => {
  const hash = createHash("sha256").update(SCRIPT, "utf8").digest("hex");
  assert.ok(NOTES.includes(`sha256 \`${hash}\``), `the notes do not carry ${hash}`);
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
  ]) {
    assert.ok(SCRIPT.includes(line), line);
  }
  assert.ok(SCRIPT.includes("const LOG_PREFIX = '[utoulouse-enrolment]';"));
  // A line carries counts, never what the page shows of the student.
  assert.doesNotMatch(SCRIPT, /log\([^)]*(innerText|textContent|labelOf|document\.title|location\.href)/);
});

test("the wait is asked of Reclaim as soon as the student is signed in, in a try, and the log says what came of it", () => {
  // The founder's rule (8 Oct 2026): a portal that stands still after the sign-in reads as broken in a second and a
  // half, so the wait comes back at the sign-in and nobody watches their own file move.
  const signedIn = SCRIPT.indexOf("log('signed in on the ENT, leaving for the file');");
  const asked = SCRIPT.indexOf("userHasToAct(false, 'signed in on the ENT');");
  const leaves = SCRIPT.indexOf("location.assign(TARGET_URL);");
  assert.ok(signedIn > 0 && asked > signedIn && leaves > asked, "asked after the line that says signed in, and before the page leaves");
  const helper = SCRIPT.slice(SCRIPT.indexOf("function userHasToAct(needed, where) {"), SCRIPT.indexOf("// A press as a finger makes it"));
  assert.match(helper, /try \{\s+known = !!window\.Reclaim && typeof window\.Reclaim\.requiresUserInteraction === 'function';\s+if \(known\) \{\s+window\.Reclaim\.requiresUserInteraction\(needed\);/);
  for (const outcome of ["said + 'told'", "said + 'the call threw'", "said + 'no such function on the bridge'"]) assert.ok(helper.includes(`log(${outcome});`), outcome);
  // Asked again once the file is ready, and the page is given back if the file asks for a sign-in after all.
  assert.ok(SCRIPT.includes("userHasToAct(false, 'file ready');"));
  assert.ok(SCRIPT.includes("userHasToAct(true, 'sign-in form on the file');"));
  // The bridge is called for this and for the log, and for nothing else that acts.
  assert.deepEqual([...new Set([...SCRIPT.matchAll(/window\.Reclaim\.(\w+)\(/g)].map((found) => found[1]))].sort(), ["log", "reportUserLoggedIn", "requiresUserInteraction"]);
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
