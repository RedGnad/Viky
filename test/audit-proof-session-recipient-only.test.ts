// Only the person a gift is for opens a proof session for it (the review of 23 Sep 2026, finding 5, live since the
// Reclaim application was configured): a session is a Reclaim verification, counted against the account's quota.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/proof/session/route.ts", import.meta.url), "utf8");

test("the route loads the gift and refuses anybody but its recipient, before anything is asked of Reclaim", () => {
  const loaded = route.indexOf("const gift = await loadGift(giftId);");
  const refused = route.indexOf('if (gift.recipient?.toLowerCase() !== account.toLowerCase()) throw new SessionRefusal("This gift is not yours to prove");');
  const reclaim = route.indexOf("const appId = process.env.RECLAIM_APP_ID");
  assert.ok(loaded > 0 && refused > loaded, "the gift is read, then its recipient compared");
  assert.ok(reclaim > refused, "before the Reclaim application is used");
  assert.ok(route.indexOf("const auth = readAccountAuthSession(request);") < loaded, "the account is the session's");
});
