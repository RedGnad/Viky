import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { WAITS } from "../src/sentences";
import { DONE_SHOWN_MS, NAME_THE_STEP_AFTER_MS } from "../src/waits";

// Every wait that follows a press (the founder, 3 Oct 2026): the wheel inside the button from the press, and past ten
// seconds a line under the button that names the step in progress. It was a button whose words changed and nothing
// that moved.

const waiting = readFileSync("app/kit/Waiting.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

function screens(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "dev" || name === "judges" || name === "api" ? [] : screens(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

test("the wheel is the product's one ring, in the button's own ink, and the step is named after ten seconds", () => {
  assert.equal(NAME_THE_STEP_AFTER_MS, 10_000);
  assert.match(waiting, /<span className="working-ring working-ring-inline" aria-hidden="true" \/>\s+<span>\{doing\}<\/span>/);
  assert.match(waiting, /window\.setTimeout\(\(\) => setLong\(true\), NAME_THE_STEP_AFTER_MS\)/);
  assert.match(waiting, /return long && step \? \(\s+<p className=\{HELP\} role="status" data-step-in-progress="">/);
  // The inline ring declares no animation of its own: it turns by the ring's, which reduced motion stops.
  const inline = css.slice(css.indexOf(".working-ring-inline {"), css.indexOf("}", css.indexOf(".working-ring-inline {")));
  assert.doesNotMatch(inline, /animation/);
  assert.match(inline, /border-top-color: currentColor;/);
});

test("no button of a screen swaps its words for a waiting label without the wheel", () => {
  // The old form: a condition, then one of the waiting labels, straight in a button's braces.
  const label = /\?\s*(?:[A-Z]|words)\.(?:opening|reading|checking|working|busy|paying|pricing|finding|asking|taking|takingBack|gettingLink|leaving|code\.using)\s*:/;
  const found = screens("app").flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .map((text, index) => ({ path, line: index + 1, text: text.trim() }))
      // The one button takes what is being done as its `doing`, and draws the wheel itself (app/kit/Button.tsx).
      .filter(({ text }) => label.test(text) && !text.includes("name={leaving") && !/\bdoing=\{/.test(text)),
  );
  assert.deepEqual(found, []);
});

test("each step's name says one thing the page is waiting on, and none says a word a person must never read", () => {
  const said = Object.values(WAITS).map((step) => (typeof step === "function" ? step("Duolingo") : step));
  for (const sentence of said) {
    assert.ok(sentence.length <= 90, sentence);
    assert.doesNotMatch(sentence, /wallet|gas|chain|seed|token|transaction|address/i, sentence);
    assert.match(sentence, /\.$/, sentence);
  }
  assert.equal(WAITS.firstReading("Duolingo"), "Asking Duolingo for your profile, and certifying its answer.");
  assert.equal(WAITS.passkey, "Waiting for your face or your fingerprint.");
  // The first reading names its steps as they really follow each other: the source, the passkey, the writing.
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /const startStep = \(at: StartStep\) => setStep\(at === "reading" \? WAITS\.firstReading\(source\) : at === "signing" \? WAITS\.passkey : WAITS\.recordingStart\);/);
  const client = readFileSync("src/client/v2.ts", "utf8");
  assert.ok(client.indexOf('onStep?.("signing");') < client.indexOf("const account = await signer();"));
  assert.ok(client.indexOf('onStep?.("recording");') < client.indexOf("return postJson<T>(`/api/gift/${giftId}/bind`, { startSignature: signature });"));
});

// The one button and its four states (the UI pass of 8 Oct 2026, rule 3): at rest, doing with the wheel and the verb
// of what is being done, done with the mark, failed back at rest with a line under it. Each screen wrote its own
// before: a button that faded and kept its words, a "Copied" that never went away, a refusal somewhere in the sheet.

const button = readFileSync("app/kit/Button.tsx", "utf8");

test("the button says what it is doing with the wheel, that it is done with the mark, and what failed under itself", () => {
  // Doing: the same wheel as every wait, beside the words, found by the mark the waits already carry.
  assert.match(button, /\{doing \? \(\s+<span className="inline-flex items-center justify-center gap-\[var\(--space-sm\)\]" data-waiting="">\s+<span className="working-ring working-ring-inline" aria-hidden="true" \/>\s+<span>\{doing\}<\/span>/);
  // Done: the mark, drawn in the button's own ink, and the word.
  assert.match(button, /\) : done \? \(\s+<span className="inline-flex items-center justify-center gap-\[var\(--space-sm\)\]" data-done="">\s+<svg aria-hidden focusable="false" viewBox="0 0 24 24"[^>]*stroke="currentColor"/);
  // Failed: the button is back at rest, and the line is the refusal every field has.
  assert.match(button, /\{failed && !state \? <FieldRefusal id=\{failedId \?\? "button-refused"\}>\{failed\}<\/FieldRefusal> : null\}/);
  // The step in progress is named under it after ten seconds, as for every wait.
  assert.match(button, /<StepInProgress busy=\{Boolean\(doing\)\} step=\{step\} \/>/);
});

test("doing or done, the button is not pressed again and does not fade; one that cannot be pressed yet does", () => {
  assert.match(button, /const state = doing \? "doing" : done \? "done" : undefined;/);
  assert.match(button, /data-state=\{state\}\s+aria-busy=\{doing \? true : undefined\}\s+aria-disabled=\{state \? true : undefined\}/);
  // The fade is the look of a button that waits for something else: never the look of one at work.
  assert.match(button, /disabled=\{waiting && !state\}/);
  // A press while it works is dropped, a form's own included (`submits`): the form is sent once.
  assert.match(button, /onClick=\{\(event\) => \{\n[^\n]*\n\s+if \(state\) event\.preventDefault\(\);\s+else onPress\?\.\(\);\s+\}\}/);
  assert.match(button, /type=\{submits \? "submit" : "button"\}/);
  // It stays down where the press put it, on no relief, and no pointer lifts it meanwhile.
  assert.match(css, /\.control-relief\[data-state\],\n\.action-relief\[data-state\] \{\n  transform: translateY\(var\(--control-relief-depth\)\);\n  box-shadow: none;\n  cursor: default;\n\}/);
  assert.match(css, /\.small-button\[data-state\] \{\n  transform: translateY\(3px\);\n  box-shadow: none;/);
  for (const key of [".control-relief", ".small-button", ".action-relief"]) assert.ok(css.includes(`${key}:hover:not(:active):not(:disabled):not([data-state]) {`), key);
  // Done, the one action gives its sun back, with the page's ink on the tone: readable in the night's colours too.
  assert.match(css, /\.action-relief\[data-state="done"\] \{\n  background: var\(--tonal\);\n  color: var\(--text\);\n\}/);
});

test("done lasts long enough to be read, and then the button is there to press again", () => {
  assert.equal(DONE_SHOWN_MS, 2_200);
  assert.match(button, /const timer = window\.setTimeout\(\(\) => setAt\(0\), DONE_SHOWN_MS\);/);
  // A copy is the plain case: it said "Copied" for good, and the link could not be seen to copy a second time.
  const link = readFileSync("app/kit/LinkAgain.tsx", "utf8");
  assert.match(link, /const \[copied, markCopied\] = useDone\(\);/);
  assert.match(link, /<Button done=\{copied \? W\.copied : null\} failed=\{refusal\} failedId=\{`link-refused-\$\{giftId\}`\} onPress=\{\(\) => copy\(link\)\} data-copy-the-link="">/);
});

test("the gift's own path uses the one button too: the connection, the proofs, the agreement, the decisions, the door", () => {
  // The rest of rule 3 of the UI pass of 8 Oct 2026, on the screens of the person a gift is for. Each of these drew
  // its own button, faded while it worked, with the wheel and the step under it written beside.
  const uses: Record<string, readonly RegExp[]> = {
    "app/kit/ConnectTheAccount.tsx": [
      /<Button doing=\{busy === "starting" \? W\.reading : null\} step=\{WAITS\.connecting\(condition\?\.source \?\? ""\)\} waiting=\{working && busy !== "starting"\} onPress=\{\(\) => void start\(\)\}>/,
      /<Button look="secondary" doing=\{busy === "erasing" \? W\.working : null\} step=\{WAITS\.erasing\} waiting=\{working && busy !== "erasing"\} onPress=\{\(\) => void erase\(\)\}>/,
    ],
    "app/kit/ConnectTheSource.tsx": [
      /<Button doing=\{busy === "starting" \? W\.reading : null\} step=\{step\} waiting=\{working && busy !== "starting"\} onPress=\{onStart\}>/,
      /<Button doing=\{busy === "naming" \? W\.checking : null\} step=\{step\} waiting=\{working && busy !== "naming"\} onPress=\{onAskCode\}>/,
      /<Button submits doing=\{busy === "naming" \? W\.checking : null\} step=\{step\} waiting=\{\(working && busy !== "naming"\) \|\| typed\.trim\(\) === ""\}>/,
    ],
    "app/kit/CertificateProof.tsx": [/<Button submits doing=\{busy \? words\.checking : null\} step=\{WAITS\.proof\} waiting=\{link\.trim\(\) === ""\}>/],
    "app/kit/MarathonProof.tsx": [/<Button doing=\{state\.at === "reading" \|\| state\.at === "proving" \? W\.reading : null\} step=\{WAITS\.proof\}/],
    "app/kit/WcaProof.tsx": [/<Button submits doing=\{state\.at === "checking" \? W\.checking : null\} step=\{WAITS\.registration\}/, /<Button doing=\{state\.at === "reading" \|\| state\.at === "proving" \? W\.reading : null\} step=\{WAITS\.proof\}/],
    "app/kit/Consent.tsx": [/<Button doing=\{busy \? C\.working : null\} step=\{WAITS\.choice\} onPress=\{onStop\}>/, /<Button look="small" doing=\{busy \? C\.working : null\} onPress=\{\(\) => void agree\(\)\}>/],
    "app/kit/YouDecide.tsx": [/<Button doing=\{busy \? C\.working : null\} step=\{WAITS\.choice\} onPress=\{\(\) => void takeABreak\(\)\}>/, /<Button doing=\{ending\.busy \? E\.working : null\} step=\{WAITS\.ending\} onPress=\{\(\) => void endIt\(\)\}>/],
    "app/kit/SignInDoor.tsx": [/<Button doing=\{busy \? W\.busy : null\} step=\{WAITS\.account\} onPress=\{\(\) => void make\(\)\}>/],
  };
  for (const [file, patterns] of Object.entries(uses)) {
    const source = readFileSync(file, "utf8");
    for (const use of patterns) assert.match(source, use, file);
  }
  // A button that works is one of these everywhere on that path: no wheel is written by hand any more, but inside the
  // two controls that are not buttons of this kind, the header's door and a line of the sheet "You decide".
  for (const file of ["ConnectTheAccount", "ConnectTheSource", "CertificateProof", "MarathonProof", "WcaProof", "Consent"]) assert.doesNotMatch(readFileSync(`app/kit/${file}.tsx`, "utf8"), /<ButtonWords|<StepInProgress/, file);
  assert.equal((readFileSync("app/kit/YouDecide.tsx", "utf8").match(/<ButtonWords/g) ?? []).length, 1, "the option 'Start again', a line of the sheet");
  assert.equal((readFileSync("app/kit/SignInDoor.tsx", "utf8").match(/<ButtonWords/g) ?? []).length, 1, "the header's door, one width whatever it says");
});

test("the screens of the person who pays use the one button for every press that waits", () => {
  const uses: Record<string, RegExp> = {
    "app/kit/TakeItBack.tsx": /<Button doing=\{busy \? W\.takingBack : null\} step=\{WAITS\.takingBack\} waiting=\{working\} failed=\{refusal\}/,
    "app/kit/LinkAgain.tsx": /<Button doing=\{busy \? W\.gettingLink : null\} step=\{WAITS\.newLink\} failed=\{refusal\}/,
    "app/kit/offer/JudgeCode.tsx": /<Button look="small" className="self-start" doing=\{busy \? W\.code\.using : null\} step=\{WAITS\.code\}/,
    "app/kit/offer/PaySheet.tsx": /<Button waiting=\{!ready \|\| !settled \|\| status === "busy"\} doing=\{busy \? W\.paying : null\} step=\{WAITS\.account\}/,
  };
  for (const [file, use] of Object.entries(uses)) {
    const source = readFileSync(file, "utf8");
    assert.match(source, use, file);
    assert.doesNotMatch(source, /<ButtonWords/, `${file} draws no wheel of its own`);
  }
});
