import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The first look's characters stay in the drawing file and on no product screen (the founder, 28 Sep 2026: the gift box
 * still stood on the screen after paying, and the sun diamond on screens without a scene of their own). The box is kept
 * as the kid, for later; the design laboratory under app/dev may still draw it.
 */
test("no product screen draws the gift box or the sun diamond of the first look", () => {
  const screens = globSync("app/**/*.tsx").filter((file) => !file.startsWith("app/dev/"));
  for (const file of screens) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /<Character[^>]*state="gift"/, `${file} draws the gift box`);
    assert.doesNotMatch(source, /<Character[^>]*state="diamond"/, `${file} draws the first look's diamond`);
  }
  assert.match(readFileSync("app/kit/Character.tsx", "utf8"), /kept as the kid for later/, "the box is kept, named for what it will be");
});
