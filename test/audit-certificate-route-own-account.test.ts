// The generic certificate route never reads a marathon or a WCA time from the link the browser sends (the money path
// audit of 27 Sep 2026): those goals are read from the account their own route builds from the gift's record.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/gift/[id]/certificate/route.ts", import.meta.url), "utf8");

test("the certificate route refuses the goals read from their own record, before anything is read", () => {
  const guarded = /const READ_FROM_ITS_OWN_RECORD = new Set\(\[([^\]]*)\]\)/.exec(route)?.[1] ?? "";
  for (const goal of ["marathon-finish", "wca-time"]) assert.ok(guarded.includes(`"${goal}"`), `${goal} is refused on the generic route`);
  const refusal = route.indexOf("READ_FROM_ITS_OWN_RECORD.has(milestone.conditionId)");
  const reading = route.indexOf("proveCertificate({ giftId: id, link })");
  assert.ok(refusal > 0 && reading > 0 && refusal < reading, "the refusal comes before the reading");
});
