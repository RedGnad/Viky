import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attestedSourceIds } from "../src/attested-sources";

/**
 * `pnpm check:sources` (the audit of 1 Oct 2026, F-24): the command that asks every public source whether it still
 * answers in the shape the readers expect. It reads the live sources, so it is run by hand and not here; what is held
 * here is what must stay true of the file itself.
 */

const script = readFileSync("scripts/check-sources.ts", "utf8");

test("the command exists, and is named where an operator looks", () => {
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  assert.equal(scripts["check:sources"], "tsx scripts/check-sources.ts");
  // Among the operator's commands, which moved from the README to docs/ with the pages and routes (5 Oct 2026).
  assert.match(readFileSync("docs/PAGES-AND-ROUTES.md", "utf8"), /`pnpm check:sources`/);
});

test("it names no private person's certificate: those samples come from a file that is never committed", () => {
  // The only ids written in the file are the ones nobody holds, used to see a source refuse.
  const uuids = script.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
  assert.deepEqual([...new Set(uuids)], ["00000000-0000-4000-8000-000000000000"]);
  assert.match(script, /const SAMPLES_FILE = "private-fixtures\/check-sources\.json";/);
  assert.match(readFileSync(".gitignore", "utf8"), /^private-fixtures\/$/m);
  for (const source of ["det", "coursera", "edx", "mitx", "credly", "accredible", "breizh", "raceresult"]) {
    assert.match(script, new RegExp(`samples\\.${source}`), `${source} takes its sample from the local file`);
  }
});

test("every source asked for its patterns is one the readers know, and a missing sample is said, never passed over", () => {
  const known = new Set(attestedSourceIds());
  const asked = [...script.matchAll(/patterns\("([a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(asked.length >= 12);
  for (const id of asked) assert.ok(known.has(id), `${id} is an attested source`);
  // The chess ratings are asked by cadence, built in a loop.
  for (const mode of ["rapid", "blitz", "bullet", "daily"]) assert.ok(known.has(`chess-ratings-${mode}`));
  assert.match(script, /say\(\{ source, what, result: "skip", detail: `no sample in \$\{SAMPLES_FILE\}`, ms: 0 \}\)/);
  assert.match(script, /if \(failed\.length > 0\) throw new Error/, "a line that fails fails the command");
});
