// The back key steps back only when the page before is one of Viky's (7 Oct 2026). A person brought back to their gift
// by the verification page had Reclaim's page before it: the key led there and seemed dead.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextSteps, stepsAtLoad } from "../src/client/inside-steps";

test("a step inside Viky is added when the browser's history grew with it", () => {
  let steps = nextSteps([], "/", false);
  steps = nextSteps(steps, "/gifts", true);
  steps = nextSteps(steps, "/g/1000006", true);
  assert.deepEqual(steps, ["/", "/gifts", "/g/1000006"]);
  // Drawn again with nothing changed: nothing is added.
  assert.deepEqual(nextSteps(steps, "/g/1000006", false), steps);
  // A task's steps are pages of their own, told apart by the query.
  assert.deepEqual(nextSteps(["/fund"], "/fund?step=2", true), ["/fund", "/fund?step=2"]);
});

test("a step back cuts the list where the page was, whether one step or several", () => {
  const steps = ["/", "/gifts", "/g/1000006", "/help"];
  assert.deepEqual(nextSteps(steps, "/g/1000006", false), ["/", "/gifts", "/g/1000006"]);
  assert.deepEqual(nextSteps(steps, "/", false), ["/"]);
  // The same page twice in the history: the nearest one is where a step back lands.
  assert.deepEqual(nextSteps(["/gifts", "/g/1", "/gifts", "/help"], "/gifts", false), ["/gifts", "/g/1", "/gifts"]);
});

test("a page put in the place of another keeps the list as long as it was, never longer", () => {
  // `replaceState`: the history did not grow and the page is not one already kept.
  assert.deepEqual(nextSteps(["/", "/fund?step=2"], "/fund?step=3", false), ["/", "/fund?step=3"]);
  // Alone in the list, a page that replaces it stays alone: the key then goes where it names, not a step back.
  assert.deepEqual(nextSteps(["/g/1000006"], "/g/1000006?shown=1", false), ["/g/1000006?shown=1"]);
});

test("what is unsure shortens the list: a step forward after a step back, a page pushed from the middle", () => {
  // Stepped back to the first page, then on to a new one: the history is no longer than before, so it is taken as a
  // page in the place of another. The key then goes to the place it names, which is a page of Viky.
  const back = nextSteps(["/", "/gifts"], "/", false);
  assert.deepEqual(nextSteps(back, "/me", false), ["/me"]);
});

test("a page arrived at from anywhere else starts the list anew; a page loaded again keeps it", () => {
  const kept = ["/gifts", "/g/1000006"];
  assert.deepEqual(stepsAtLoad(kept, "reload"), kept);
  assert.deepEqual(stepsAtLoad(kept, "back_forward"), kept);
  // Brought here by the verification page, a link, an address typed: what came before is not Viky's to step back to.
  assert.deepEqual(stepsAtLoad(kept, "navigate"), []);
  assert.deepEqual(stepsAtLoad(kept, undefined), []);
  // So the gift's page reached from Reclaim holds one page, and the key goes to "My gifts".
  assert.deepEqual(nextSteps(stepsAtLoad(kept, "navigate"), "/g/1000006", false), ["/g/1000006"]);
});

test("the back key asks the list, and the list is told of every page from the root layout", () => {
  const key = readFileSync("app/kit/BackLink.tsx", "utf8");
  assert.match(key, /if \(!follow && pageBeforeIsOurs\(\)\) router\.back\(\);\s+else router\.push\(href\);/);
  assert.doesNotMatch(key, /window\.history\.length > 1\) router\.back/);
  assert.match(readFileSync("src/client/inside-steps.ts", "utf8"), /return typeof window !== "undefined" && window\.history\.length > 1 && \(steps\?\.length \?\? 0\) > 1;/);
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<Suspense fallback=\{null\}>\s+<InsideSteps \/>\s+<\/Suspense>/);
  assert.match(readFileSync("app/kit/InsideSteps.tsx", "utf8"), /pageShown\(query \? `\$\{path\}\?\$\{query\}` : path\);/);
});
