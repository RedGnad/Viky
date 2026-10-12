// The six gestures of "One Passkey, Many Keys" on the judges page name keys that exist (12 Oct 2026). The third said
// "press Agree on the line under its card", and a new gift has no such key: its yes is signed by the press that asks
// for the first reading.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONSENT, GIFT_PAGE } from "../src/sentences";

test("the judges' third gesture names the press that signs the yes, by the words its key carries", () => {
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.equal(GIFT_PAGE.startCounting, "Start counting");
  assert.equal(GIFT_PAGE.iAddedIt, "Check my profile");
  assert.equal(CONSENT.agree, "Agree");
  // A new gift has no key named Agree: a judge following the six gestures looked for one (12 Oct 2026).
  assert.doesNotMatch(page, /press Agree/);
  assert.match(page, /<li data-gesture-yes>\s+Open a gift made for you and press the key that starts its first reading, &quot;\{GIFT_PAGE\.startCounting\}&quot;\s+or &quot;\{GIFT_PAGE\.iAddedIt\}&quot; on a daily gift: that press signs your yes with this key, before anything is\s+read\.\s+<\/li>/);
  // The press that starts a gift is where the yes is signed, and those two labels are the ones that press carries.
  const gift = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(gift, /const start = \(\) =>\s+run\(\s+"starting",\s+"start",\s+async \(\) => \{\s+await agreeFirst\(giftId\);/);
  assert.match(gift, /start: W\.startCounting,\s+added: W\.iAddedIt,/);
  // The key named Agree stands only under a gift already under way that holds no yes.
  const consent = readFileSync("app/kit/Consent.tsx", "utf8");
  assert.equal(consent.match(/label = C\.agree;/g)?.length, 2);
  assert.match(consent, /\} else if \(state === null && underWay\) \{\s+line = C\.nothingRead;\s+label = C\.agree;/);
});
