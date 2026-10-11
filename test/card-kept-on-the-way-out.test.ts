import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * From the press that pays to the page that follows, the card never changes (the founder, 11 Oct 2026).
 *
 * The paying screen reads the card on the device, and the device forgets it the moment a gift is made: until the
 * gift's page had come, the screen drew the starting card, thirty dollars and no first name. What a browser shows of
 * it is walked in test/browser/card-kept-on-the-way-out.spec.ts, on a build that names a gift contract; what is held
 * here is the rule in the screen's own code, which every build has.
 */
const pay = readFileSync("app/components/PayGift.tsx", "utf8");

test("the screen draws the card it had when it began to leave, whatever the device has forgotten since", () => {
  assert.match(pay, /const stored = useSyncExternalStore\(subscribeToCardDraft, cardDraft, startingCardDraft\);/);
  assert.match(pay, /const \[leftWith, setLeftWith\] = useState<GiftDraft \| null>\(null\);\n\s+const draft = leftWith \?\? stored;/);
  // Settled on the screen before anything is forgotten: a state set and left to wait would be drawn after the device's
  // own change, which is the image the founder saw.
  assert.match(pay, /const keepTheCardOnScreen = \(\) => \{\n\s+leaving\.current = true;\n\s+flushSync\(\(\) => setLeftWith\(cardDraft\(\)\)\);\n\s+\};/);
});

test("at each of the three ways out the card is kept first, then forgotten: a gift made, a different gift, a gift made already", () => {
  const kept = [...pay.matchAll(/keepTheCardOnScreen\(\);\n\s+forgetPendingGift\(\);\n\s+clearedCardDraft\(\);/g)];
  assert.equal(kept.length, 3);
  assert.equal(pay.split("clearedCardDraft();").length - 1, 3, "and the card is forgotten nowhere else on this screen");
  // A different gift: nothing on the screen is emptied before Home has come.
  const different = pay.slice(pay.indexOf("const differentGift = () => {"), pay.indexOf('router.push("/");', pay.indexOf("const differentGift = () => {")));
  assert.doesNotMatch(different, /setKept|setPhase|setProblem/);
});

test("a screen on its way out makes nothing more: the card it keeps is a whole gift, and the wait makes one when the account holds its amount", () => {
  assert.match(pay, /const look = async \(\) => \{\n\s+if \(!live \|\| working\.current \|\| leaving\.current\) return;/);
});
