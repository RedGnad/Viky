// Two sentences passed for half a second before the page knew what it was saying (a screen recording of 12 Oct 2026).
// A gift's link opened on "This link is missing its key. Ask for the link again." under a greyed button, until the
// browser took the page over and read the key after the `#`. And a press that paid from the account landed on "Waiting
// for your payment" with a card to pay by, until the wait had read the account. Each said what it did not know yet.
// The wait's own images are watched in test/browser/card-payment-wait.spec.ts; here, the rule each screen holds.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GIFT_PAGE } from "../src/sentences";

test("a link that was not read yet is not a link without its key", () => {
  assert.equal(GIFT_PAGE.missingKey, "This link is missing its key. Ask for the link again.");
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  // The server is sent nothing of what follows a `#`: it answers "not read", never "absent".
  assert.match(page, /function useOpeningSecret\(\): string \| null \| undefined \{\s+return useSyncExternalStore\(onHashChange, \(\) => openingSecretOf\(window\.location\.hash\), \(\) => undefined\);/);
  // The refusal and the greyed button are for a link read and found without a key.
  assert.match(page, /waiting=\{\(working && busy !== "opening"\) \|\| openingKey === null\}/);
  assert.match(page, /\{openingKey \? answerAt\("open"\) : openingKey === null \? <FieldRefusal id="gift-no-key">\{W\.missingKey\}<\/FieldRefusal> : null\}/);
  assert.doesNotMatch(page, /\|\| !openingKey\}/);
  // A press with no key is refused as before, with the same sentence.
  assert.match(page, /if \(!openingKey\) throw new ApiError\(\{ status: 400, code: "NO_KEY", message: W\.missingKey \}\);/);
});

test("a wait whose press paid from the account says the gift is being made from its first image", () => {
  // The press says so only when the account's own dollars cover the whole gift: nothing to take from a gift first,
  // nothing to change, no card.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /const heldCovers = enough && held\.state === "read" && units !== undefined && held\.parts\.ausd >= units;/);
  assert.match(sheet, /router\.push\(heldCovers \? "\/fund\?step=paying&held=1" : "\/fund\?step=paying"\);/);
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /const \[heldAtThePress\] = useState\(params\.get\("held"\) === "1"\);/);
  // Only until the first look, only with no refusal on the screen, only for a payment this device started.
  assert.match(wait, /const madeFromTheAccount = phase === "waiting" && heldAtThePress && !looked && !problem && Boolean\(startedHere\(\)\);/);
  assert.match(wait, /if \(phase === "taking" \|\| phase === "converting" \|\| phase === "giving" \|\| madeFromTheAccount\) \{/);
  // The look ends it, whether it read the account or failed to read it.
  assert.equal(wait.match(/setLooked\(true\);/g)?.length, 2);
  assert.ok(wait.indexOf("if (!read || !live) return;") < wait.indexOf("setLooked(true);"));
});
