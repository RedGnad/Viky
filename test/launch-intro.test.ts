import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INTRO_BOOT_SCRIPT, INTRO_SESSION_KEY, INTRO_TIMING, introGroundStyle } from "../src/launch-intro";

/** The installed app's first opening (the founder, 28 Sep 2026, direction C). */

const session = new Map<string, string>();

function decide(options: { path: string; standalone: boolean; reduced: boolean; seen: boolean; type?: string }): boolean {
  const attributes = new Set<string>();
  session.clear();
  if (options.seen) session.set(INTRO_SESSION_KEY, "1");
  const run = new Function("location", "matchMedia", "sessionStorage", "document", "performance", INTRO_BOOT_SCRIPT);
  run(
    { pathname: options.path },
    (query: string) => ({ matches: query.includes("standalone") ? options.standalone : options.reduced }),
    { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value) },
    { documentElement: { setAttribute: (name: string) => attributes.add(name) } },
    { getEntriesByType: () => [{ type: options.type ?? "navigate" }] },
  );
  return attributes.has("data-intro");
}

test("it plays at every launch of the installed app, on Home, with motion allowed", () => {
  assert.equal(decide({ path: "/", standalone: true, reduced: false, seen: false }), true, "a launch");
  assert.equal(decide({ path: "/", standalone: false, reduced: false, seen: false }), false, "never in a browser tab");
  assert.equal(decide({ path: "/gift/12", standalone: true, reduced: false, seen: false }), false, "never on a gift link");
  assert.equal(decide({ path: "/", standalone: true, reduced: true, seen: false }), false, "never against reduced motion");
});

test("nothing inside a launch plays it again: a reload, the landing after a sign-out, a page reached from another", () => {
  assert.equal(decide({ path: "/", standalone: true, reduced: false, seen: false, type: "reload" }), false, "a reload is not a launch");
  assert.equal(decide({ path: "/", standalone: true, reduced: false, seen: true }), false, "the session already started");
  decide({ path: "/gift/12", standalone: true, reduced: false, seen: false });
  assert.equal(session.get(INTRO_SESSION_KEY), "1", "a launch on another page marks the session too, so Home after it does not play");
  decide({ path: "/", standalone: false, reduced: false, seen: false });
  assert.equal(session.get(INTRO_SESSION_KEY), "1", "every page marks it");
});

test("it is short, it is in the page before any paint, and a tap ends it", () => {
  assert.ok(INTRO_TIMING.holdMs + INTRO_TIMING.fadeMs <= 1_500, "about a second after the launch screen");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<head>[\s\S]*__html: INTRO_BOOT_SCRIPT[\s\S]*__html: introGroundStyle\(FIGURE_ICON_SVG\)[\s\S]*<\/head>/, "decided and grounded in the head, before any paint");
  assert.match(layout, /<LaunchIntro \/>/);
  const intro = readFileSync("app/kit/LaunchIntro.tsx", "utf8");
  assert.match(intro, /onPointerDown=/);
  assert.doesNotMatch(intro, /localStorage/, "the screen itself remembers nothing: the boot script already has");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.launch-intro \{\n  display: none;\n\}/, "hidden unless the document is marked");
  assert.match(css, /html\[data-intro\] \.launch-intro \{[^}]*background: #ddd6eb;/, "the launch screen's own lavender");
});

test("the page's own ground is the launch screen's image while it plays, so no painted image is ever empty", () => {
  const css = introGroundStyle('<svg viewBox="0 0 64 40"><g/></svg>');
  assert.match(css, /^html\[data-intro\]:not\(\[data-intro-shown\]\),html\[data-intro\]:not\(\[data-intro-shown\]\) body\{background:#ddd6eb url\("data:image\/svg\+xml,/, "only until the screen itself is on the page");
  assert.match(readFileSync("app/kit/LaunchIntro.tsx", "utf8"), /root\.setAttribute\(INTRO_SHOWN_ATTRIBUTE, ""\)/);
  assert.match(decodeURIComponent(css), /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox/, "an image an SVG file can be");
  assert.match(css, /no-repeat fixed center\/66vw auto\}$/, "the screen's place: two thirds of the width, in the middle of the view");
});
