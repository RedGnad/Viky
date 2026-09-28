import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { awayAt, BAND, CLEAR_OF_COLUMN, columnAt, CROWD_FROM, FULL_ROOM, placedAt, SPOTS, topOf } from "../app/kit/SideCrowd";

/** The day characters beside the landing's top (the founder, 28 Sep 2026: direction A, then C, a scene wider than the window). */

test("the scene: every character clear of the column, none covering another, all of it shown on a 1728 window", () => {
  for (const spot of SPOTS) assert.ok(spot.away >= CLEAR_OF_COLUMN, "clear of the column");
  for (const height of [800, 900, 1080]) {
    const drawn = SPOTS.map((spot) => placedAt(spot, 1728, height));
    for (const place of drawn) {
      assert.equal(place.inside, 1, "a 1728 window shows the whole scene");
      assert.ok(place.top >= BAND.top && place.top + place.size <= height - BAND.aboveFoldEnd + 0.01, `inside the band at ${height}`);
    }
    drawn.forEach((one, index) => drawn.slice(index + 1).forEach((other) => {
      const apart = one.left + one.size <= other.left || other.left + other.size <= one.left || one.top + one.size <= other.top || other.top + other.size <= one.top;
      assert.ok(apart, `two characters overlap at ${height}`);
    }));
  }
});

test("as the window narrows its edge passes over them: never resized, never pushed together, the farthest leaving first", () => {
  const place = (width: number) => SPOTS.map((spot) => ({ spot, at: placedAt(spot, width, 900) }));
  for (let width = CROWD_FROM; width <= 2560; width += 16) {
    for (const { spot, at } of place(width)) {
      assert.equal(at.size, spot.size, "its own size at every width");
      // Its distance from the column is its place, plus its parallax as the window loses room: never closer.
      const columnWidth = columnAt(width);
      const column = spot.side === "left" ? (width - columnWidth) / 2 - (at.left + at.size) : at.left - (width + columnWidth) / 2;
      assert.ok(column >= spot.away - 0.01, "never pushed towards the column");
      assert.ok(Math.abs(column - awayAt(spot, (width - columnWidth) / 2)) < 0.01);
    }
  }
  const whole = (width: number) => place(width).filter(({ at }) => at.inside === 1).length;
  assert.ok(whole(1100) < whole(1280) && whole(1280) < whole(1440) && whole(1440) < whole(1728), "more of the scene as the window widens");
  assert.ok(whole(1440) >= 10, "most of it on the founder's own screen, about 1440");
  assert.equal(whole(1728), SPOTS.length);
  // One by one: at some width a character is only partly in, cut by the edge, on its way out.
  assert.ok([1100, 1280, 1440].some((width) => place(width).some(({ at }) => at.inside > 0 && at.inside < 1)), "cut by the edge, not popped");
  // Parallax: narrowing by the same amount, a near one moves out further than a far one.
  const near = SPOTS.slice().sort((a, b) => b.depth - a.depth)[0];
  const far = SPOTS.slice().sort((a, b) => a.depth - b.depth)[0];
  const moved = (spot: (typeof SPOTS)[number]) => awayAt(spot, (1100 - columnAt(1100)) / 2) - awayAt(spot, (1728 - columnAt(1728)) / 2);
  assert.ok(moved(near) > 3 * moved(far), "the near ones slide out faster than the far ones");
  assert.equal(awayAt(near, FULL_ROOM), near.away, "at the full scene, every one at its place");
  const byAway = SPOTS.slice().sort((a, b) => b.away + b.size - (a.away + a.size));
  assert.ok(placedAt(byAway[0], 1200, 900).inside <= placedAt(byAway[byAway.length - 1], 1200, 900).inside, "the farthest leave first");
});

test("a little bigger, circles and triangles only, never a pill, scattered, each side its own", () => {
  assert.ok(Math.min(...SPOTS.map((spot) => spot.size)) >= 42 && Math.max(...SPOTS.map((spot) => spot.size)) >= 100, "bigger than before");
  assert.ok(SPOTS.every((spot) => spot.state === "earned" || spot.state === "today" || spot.state === "catchable"), "the card's row already shows the pill");
  for (const side of ["left", "right"] as const) {
    const heights = SPOTS.filter((spot) => spot.side === side).map((spot) => spot.height).sort((a, b) => a - b);
    const gaps = heights.slice(1).map((height, index) => Math.round((height - heights[index]) * 100));
    assert.equal(new Set(gaps).size, gaps.length, `${side}: no two gaps alike`);
  }
  const left = SPOTS.filter((spot) => spot.side === "left");
  for (const one of SPOTS.filter((spot) => spot.side === "right")) assert.ok(!left.some((other) => other.height === one.height && other.away === one.away), "no mirror");
  assert.ok(SPOTS.some((spot) => spot.tilt >= 18) && SPOTS.some((spot) => spot.tilt <= -18), "tilts both ways");
  assert.match(readFileSync("app/kit/SideCrowd.tsx", "utf8"), /standing=\{false\}/, "no floor, so no shadow");
});

test("the column is the landing's own: 880 from 1024 until the growing headline passes it, 903 at most", () => {
  assert.equal(columnAt(1024), 880);
  assert.equal(columnAt(1400), 880);
  assert.ok(Math.abs(columnAt(1440) - 903) < 0.5);
  assert.equal(columnAt(2560), 903);
  assert.equal(CROWD_FROM, 1024, "not under the width where the page changes its own layout");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /--crowd-column: clamp\(880px, calc\(81\.39vw - 268\.95px\), 903px\);/);
});

test("the page rising faster than itself: each character by its own depth, a parallax that shows", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /animation-range: 0px 100vh;/);
  assert.match(css, /translateY\(calc\(var\(--depth\) \* -480px\)\)/);
  assert.ok(Math.max(...SPOTS.map((spot) => spot.depth)) - Math.min(...SPOTS.map((spot) => spot.depth)) >= 0.7, "far apart in depth, so the layers separate");
});

test("only colours already on the screen, the band above the card's view, and a decoration only", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const layer = css.slice(css.indexOf(".side-crowd {\n  position: absolute;"), css.indexOf("}", css.indexOf(".side-crowd {\n  position: absolute;")));
  assert.match(layer, /--character-1: var\(--character-hero-edge\);/);
  assert.match(layer, /--character-2: var\(--character-hero-edge-deep\);/);
  assert.match(layer, /height: calc\(100svh - 182px\);/);
  assert.match(layer, /overflow: hidden;/, "the window's edge cuts them");
  assert.match(layer, /pointer-events: none;/);
  assert.doesNotMatch(css.slice(css.indexOf(".side-crowd > div {"), css.indexOf("}", css.indexOf(".side-crowd > div {"))), /transition|opacity/, "nothing fades: the edge passes over them");
  assert.equal(BAND.aboveFoldEnd, 182);
  for (const spot of SPOTS) assert.match(topOf(spot), /^calc\(96px \+ \(100svh - \d+px\) \* [\d.]+\)$/);
  assert.match(readFileSync("app/kit/SideCrowd.tsx", "utf8"), /<div aria-hidden className="side-crowd">/);
  assert.equal(readFileSync("app/kit/Home.tsx", "utf8").match(/<SideCrowd \/>/g)?.length, 1, "on the landing without an account only");
});
