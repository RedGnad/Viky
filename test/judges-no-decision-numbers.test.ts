// The judges page prints no decision number and no name of a decisions file (the audit of 9 Oct 2026; the founder:
// the file is not put back). It printed "DECISIONS.md" three times and twenty-five numbers, which pointed a judge to
// a file that is not in the tree. Comments keep theirs: they are for whoever reads the code, who has the history.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/** A file's lines that are not comments: what can reach a screen. */
function printed(path: string): string[] {
  const kept: string[] = [];
  let inBlock = false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    const opens = line.includes("/*") && !line.slice(line.indexOf("/*")).includes("*/");
    const comment = inBlock || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("{/*");
    if (inBlock && line.includes("*/")) inBlock = false;
    else if (!inBlock && opens) inBlock = true;
    if (!comment) kept.push(line);
  }
  return kept;
}

const PAGE = [...readdirSync("app/judges").filter((name) => name.endsWith(".tsx")).map((name) => `app/judges/${name}`), "app/components/MilestoneJudges.tsx", "src/condition-proof.ts"];

test("no decision number and no decisions file is named in what the judges page prints", () => {
  assert.ok(PAGE.length > 10, "the page's own files, the milestone block and the register it prints");
  for (const path of PAGE) {
    for (const line of printed(path)) {
      assert.doesNotMatch(line, /\bD\d{2,3}\b/, `${path}: ${line.trim().slice(0, 120)}`);
      assert.doesNotMatch(line, /DECISIONS/, `${path}: ${line.trim().slice(0, 120)}`);
    }
  }
});

test("a comment keeps its decision numbers, and what is printed beside it is still read", () => {
  // The page's own first comment names a decision, and its steps for a judge are read as printed.
  const source = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(source, /\{\/\* The judges' own path \(D291/);
  const lines = printed("app/judges/page.tsx");
  assert.ok(!lines.some((line) => line.includes("The judges' own path")));
  assert.ok(lines.some((line) => line.includes("Open Viky by the link in the submission portal")));
});
