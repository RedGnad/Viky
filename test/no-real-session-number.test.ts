import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * No real session number in this repository (the founder, 10 Oct 2026).
 *
 * A session number of the verification service names one person's pass: its public record answers, for a number, with
 * what the device and the connection said of themselves. Real ones were written into tests and notes on 7 and 8 Oct
 * 2026, taken out of the tree, and left in the history that was then copied again without them. A note or a test
 * cites the transaction that paid, never the session.
 *
 * The rule a machine can hold: a session number is ten hex characters, and every invented one here alternates a
 * letter and a digit ("a1c3e5f7b9"), which a real one does about once in seven hundred. So any token of ten hex
 * characters standing alone, anywhere in the tree, must be of the invented kind. The refusal names the file and the
 * line, not the token.
 */
const TEN_HEX_ALONE = /(?<![0-9A-Za-z])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{10}(?![0-9A-Za-z])/g;
const INVENTED = /^(?:[a-f][0-9]){5}$|^(?:[0-9][a-f]){5}$/;

test("every token of ten hex characters standing alone is an invented number, letters and digits alternating", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|lock)$/.test(file));
  assert.ok(files.length > 500, `the tree was read: ${files.length} files`);
  const real: string[] = [];
  let invented = 0;
  for (const file of files) {
    let body: string;
    try {
      body = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    body.split("\n").forEach((line, at) => {
      for (const found of line.matchAll(TEN_HEX_ALONE)) {
        if (INVENTED.test(found[0])) invented += 1;
        else real.push(`${file}:${at + 1}`);
      }
    });
  }
  assert.deepEqual(real, [], "a number that looks real: cite the transaction instead, or put an invented number in its place");
  assert.ok(invented > 10, "the invented ones are found, so the search does see them");
});

test("the rule tells the two kinds apart", () => {
  for (const made of ["a1c3e5f7b9", "c3e5a7b9d1", "1a2b3c4d5e"]) assert.ok(INVENTED.test(made), made);
  // Shapes a real number has: a run of digits, a run of letters, no order. None of these is anybody's, and each is
  // put together here, so that this file holds no such token itself.
  for (const shaped of [["01234", "56abc"], ["abcde", "f0123"], ["00aa1", "1bb22"], ["a12b3", "4c56d"]].map((halves) => halves.join(""))) {
    assert.ok(!INVENTED.test(shaped), shaped);
    assert.equal([...`session ${shaped}.`.matchAll(TEN_HEX_ALONE)].length, 1, "and the search finds it standing alone");
  }
  // Inside a longer run it is part of a hash or an address, not a session number.
  assert.equal([..."0x0123456abc0123456abc".matchAll(TEN_HEX_ALONE)].length, 0);
  assert.equal([..."1234567890 abcdefabcd".matchAll(TEN_HEX_ALONE)].length, 0, "digits alone, or letters alone, are not one");
});
