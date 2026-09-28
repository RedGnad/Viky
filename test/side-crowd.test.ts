import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LANDING_COLUMN, shownFrom, SPOTS } from "../app/kit/SideCrowd";

/** The day characters beside the landing's top (the founder, 28 Sep 2026: direction A, not symmetrical). */

test("a character shows only once its side has room for it whole, clear of the column", () => {
  for (const spot of SPOTS) {
    const from = shownFrom(spot);
    const room = (from - LANDING_COLUMN) / 2;
    assert.ok(room * spot.share + spot.size + 24 <= room + 1, `spot at ${spot.share} of ${spot.side} fits at ${from}`);
    assert.ok(from > 1024, "never beside the column of a tablet or a phone");
  }
});

test("the two sides are not mirrors of each other", () => {
  const left = SPOTS.filter((spot) => spot.side === "left");
  const right = SPOTS.filter((spot) => spot.side === "right");
  assert.ok(left.length > 0 && right.length > 0);
  for (const one of left) {
    assert.ok(!right.some((other) => other.top === one.top && other.share === one.share && other.size === one.size), "no spot is the other side's mirror");
  }
  assert.notDeepEqual(left.map((spot) => spot.top), right.map((spot) => spot.top), "their heights differ");
});

test("the layer catches no press, says nothing to a reader, and sits only on the first screen of the landing", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.side-crowd \{[^}]*pointer-events: none;[^}]*\}/);
  assert.match(css, /\.side-crowd > div \{\n  display: none;/, "hidden until its own width");
  assert.match(readFileSync("app/kit/SideCrowd.tsx", "utf8"), /<div aria-hidden className="side-crowd">/);
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.equal(home.match(/<SideCrowd \/>/g)?.length, 1, "on the landing without an account only");
});
