import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INTRO_BOOT_SCRIPT, INTRO_SEEN_KEY, INTRO_TIMING, introGroundStyle } from "../src/launch-intro";

/** The installed app's first opening (the founder, 28 Sep 2026, direction C). */

function decide(options: { path: string; standalone: boolean; reduced: boolean; seen: boolean }): boolean {
  const attributes = new Set<string>();
  const run = new Function("location", "matchMedia", "localStorage", "document", INTRO_BOOT_SCRIPT);
  run(
    { pathname: options.path },
    (query: string) => ({ matches: query.includes("standalone") ? options.standalone : options.reduced }),
    { getItem: (key: string) => (key === INTRO_SEEN_KEY && options.seen ? "1" : null) },
    { documentElement: { setAttribute: (name: string) => attributes.add(name) } },
  );
  return attributes.has("data-intro");
}

test("it plays only in the installed app, on Home, the first time, with motion allowed", () => {
  assert.equal(decide({ path: "/", standalone: true, reduced: false, seen: false }), true);
  assert.equal(decide({ path: "/", standalone: false, reduced: false, seen: false }), false, "never in a browser tab");
  assert.equal(decide({ path: "/gift/12", standalone: true, reduced: false, seen: false }), false, "never on a gift link");
  assert.equal(decide({ path: "/", standalone: true, reduced: false, seen: true }), false, "once per device");
  assert.equal(decide({ path: "/", standalone: true, reduced: true, seen: false }), false, "never against reduced motion");
});

test("it is short, it is in the page before any paint, and a tap ends it", () => {
  assert.ok(INTRO_TIMING.holdMs + INTRO_TIMING.fadeMs <= 1_500, "about a second after the launch screen");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<head>[\s\S]*__html: INTRO_BOOT_SCRIPT[\s\S]*__html: introGroundStyle\(FIGURE_ICON_SVG\)[\s\S]*<\/head>/, "decided and grounded in the head, before any paint");
  assert.match(layout, /<LaunchIntro \/>/);
  const intro = readFileSync("app/kit/LaunchIntro.tsx", "utf8");
  assert.match(intro, /onPointerDown=/);
  assert.match(intro, /localStorage\.setItem\(INTRO_SEEN_KEY, "1"\)/);
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
