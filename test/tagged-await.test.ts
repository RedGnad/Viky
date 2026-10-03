import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// A statement tagged on an awaited call, `(await db())` followed by a template, is compiled by the production build to
// `await await db()` followed by it: the template then tags the promise and the call fails, in the build only. Every
// call of the mobile money ledger failed that way on viky.cash on 3 Oct 2026 while its tests passed on the source.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return /\.(ts|tsx|mts)$/.test(name) ? [path] : [];
  });
}

test("no statement is tagged on an awaited call anywhere the build compiles", () => {
  const found = ["src", "app", "scripts"].flatMap(files).flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .map((line, index) => ({ path, line: index + 1, text: line }))
      .filter(({ text }) => /\(await [^()`]*\([^()`]*\)\)\s*`/.test(text)),
  );
  assert.deepEqual(found, []);
});
