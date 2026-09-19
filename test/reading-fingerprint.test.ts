import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fingerprintOfContents, READING_FILES, READING_FINGERPRINT } from "../src/reading-fingerprint";

/**
 * The number the app carries has to be the number of the files it ships. If this fails, either the two files changed
 * and the line in src/reading-fingerprint.ts has to be updated, or somebody changed the line without the files.
 *
 * Either way it is the moment to redeploy the attested-fetch worker before merging: docs/OPERATIONS.md says how.
 */

function contents(): string[] {
  return READING_FILES.map((name) => readFileSync(name, "utf8"));
}

test("the fingerprint in the code is the one the two files make", () => {
  assert.equal(
    READING_FINGERPRINT,
    fingerprintOfContents(contents()),
    "src/attested-sources.ts or src/chess-com.ts changed: put the number below into READING_FINGERPRINT, and redeploy the worker before merging",
  );
});

test("a change in either file is a change in the number, and the two files are not interchangeable", () => {
  const [sources, chess] = contents();
  const mine = fingerprintOfContents([sources, chess]);
  assert.notEqual(fingerprintOfContents([`${sources}\n// one more line`, chess]), mine);
  assert.notEqual(fingerprintOfContents([sources, `${chess}\n// one more line`]), mine);
  assert.notEqual(fingerprintOfContents([chess, sources]), mine);
  assert.throws(() => fingerprintOfContents([sources]), /takes 2 files/);
});
