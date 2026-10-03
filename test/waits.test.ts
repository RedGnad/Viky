import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { WAITS } from "../src/sentences";
import { NAME_THE_STEP_AFTER_MS } from "../src/waits";

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
      .filter(({ text }) => label.test(text) && !text.includes("name={leaving")),
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
