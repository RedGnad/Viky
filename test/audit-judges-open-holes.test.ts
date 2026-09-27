// The discrepancies of the money path audit of 27 Sep 2026 that no pull request closes are written on the judges page,
// as they are (the audit's brief).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/judges/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");

test("the judges page names the three holes left open, in its list of risks", () => {
  const risks = page.slice(page.indexOf("Risks and holes, written as they are"));
  for (const hole of ["The relayer&apos;s one key, found by the audit of 27 Sep 2026.", "A step whose confirmation runs out, found by the same audit.", "A gift card or top-up whose invoice lapses, found by the same audit."]) {
    assert.ok(risks.includes(hole), hole);
  }
});
