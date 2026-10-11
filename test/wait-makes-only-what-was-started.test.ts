import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { draftToTerms, STARTING_DRAFT } from "../src/gift-draft";
import { PENDING_GIFT_MAX_AGE_MS, pendingGiftToStore, startedGiftFor } from "../src/pending-gift";

/**
 * A wait makes only the gift whose payment this device started (the founder, 11 Oct 2026).
 *
 * Found on a build that names a gift contract, which no pass of the CI was: a page loaded again on the wait held the
 * starting card at its first image, thirty dollars for nobody named, and the wait looked at once. An account that
 * held thirty dollars signed for that card; the request was written over the one kept for the real gift, which was
 * then signed a second time. A second signature is a second gift. What a browser does is walked in
 * test/browser/page-closed-while-making.spec.ts; the rule and where the screen holds to it are here.
 */
const NOW = Date.UTC(2026, 9, 11, 12, 0);
const PAYER = "0x00000000000000000000000000000000000000A1";
const OTHER = "0x00000000000000000000000000000000000000B2";
const card = { account: PAYER, recipientName: "Boo", funderName: "", conditionId: "duolingo-daily", username: "", dollars: "19", days: "30", target: "10" };
/** As the pay press writes it down: the card, the account that pressed, and the way in it chose. */
const started = pendingGiftToStore({ ...card, wayIn: "Rampnow" }, NOW);

test("the payment this device started is found for the card the screen holds, by the account that pressed pay", () => {
  const found = startedGiftFor(started, PAYER, card, NOW + 60_000);
  assert.equal(found?.wayIn, "Rampnow");
  assert.equal(found?.dollars, "19");
  assert.ok(startedGiftFor(started, PAYER.toLowerCase(), card, NOW + 60_000), "whatever the letter case of the account");
});

test("the starting card is nobody's gift: the page's first image is never what a wait makes", () => {
  const first = draftToTerms(STARTING_DRAFT, PAYER);
  assert.equal(first.dollars, "30");
  assert.equal(first.recipientName, "");
  // A payment was started for another card: the starting card is not it.
  assert.equal(startedGiftFor(started, PAYER, first, NOW + 1), undefined);
  // And with nothing on the device, nothing was started at all.
  assert.equal(startedGiftFor(null, PAYER, first, NOW), undefined);
  // Even written down as it stands, it is a card filled in, and no pay press is behind it.
  assert.equal(startedGiftFor(pendingGiftToStore(first, NOW), PAYER, first, NOW + 1), undefined);
});

test("a card only filled in was not started, and a payment started is never handed to another account", () => {
  assert.equal(startedGiftFor(pendingGiftToStore(card, NOW), PAYER, card, NOW + 1), undefined, "no way in: nobody pressed pay");
  assert.equal(startedGiftFor(started, OTHER, { ...card, account: OTHER }, NOW + 1), undefined);
  assert.equal(startedGiftFor(started, undefined, card, NOW + 1), undefined, "nobody signed in");
  // Written with no account behind it, as a card filled in before signing in is: not a payment this account started.
  assert.equal(startedGiftFor(pendingGiftToStore({ ...card, account: "", wayIn: "Rampnow" }, NOW), PAYER, card, NOW + 1), undefined);
  assert.equal(startedGiftFor(started, PAYER, card, NOW + PENDING_GIFT_MAX_AGE_MS + 1), undefined, "older than a gift is kept");
  for (const unreadable of ["", "{", "[]", "null"]) assert.equal(startedGiftFor(unreadable, PAYER, card, NOW), undefined);
});

test("every term is the gift's: another amount, name, length, target or goal is another card", () => {
  for (const other of [{ dollars: "30" }, { recipientName: "" }, { recipientName: "Sam" }, { funderName: "Mom" }, { days: "7" }, { target: "20" }, { conditionId: "duolingo-streak" }, { username: "boo_studies" }, { course: "es" }]) {
    assert.equal(startedGiftFor(started, PAYER, { ...card, ...other }, NOW + 1), undefined, JSON.stringify(other));
  }
  // How the amount was typed is how it is said, not what is paid: the same gift.
  assert.ok(startedGiftFor(started, PAYER, { ...card, typedAmount: "16.73", typedIn: "EUR" }, NOW + 1));
});

test("the screen holds to it where it looks and where it signs, and a look whose screen moved on does nothing", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  // Read on the device when it is asked, for the card the screen holds, and never at the page's first image.
  assert.match(pay, /const startedHere = useCallback\(\(\) => \(browser && address \? loadStartedGift\(address, draftToTerms\(draft, address\)\) : undefined\), \[browser, address, draft\]\);/);
  // The wait: before anything is watched.
  const wait = pay.slice(pay.indexOf("// While paying: watch the account"), pay.indexOf("const look = async () => {"));
  assert.match(wait, /if \(step !== "paying" \|\| !address \|\| units === null \|\| phase === "short" \|\| phase === "failed"\) return;\n(\s*\/\/[^\n]*\n)+\s+if \(!startedHere\(\)\) return;/);
  // The signature: before the passkey is asked for.
  const give = pay.slice(pay.indexOf("const give = useCallback(async () => {"), pay.indexOf("const terms = termsOf(account.address);"));
  assert.match(give, /if \(!startedHere\(\)\) throw new Error\(W\.failures\.other\);/);
  assert.ok(give.indexOf("if (!startedHere())") < give.indexOf("await ensureSigner()"));
  // One creation at a time, and none from a look that began on a screen that has since changed.
  assert.match(pay, /const make = async \(\) => \{\n(\s*\/\/[^\n]*\n)+\s+if \(!live \|\| working\.current\) return;\n\s+working\.current = true;/);
  assert.match(pay, /const read = await refresh\(\);\n(\s*\/\/[^\n]*\n)+\s+if \(!read \|\| !live\) return;/);
  // Whatever rewrites the card on the wait writes the payment with it, the card and then its way in: "Make it" after a
  // payment that fell short, and a judge credit under the gift. The third leaves the wait for the card on Home.
  const rewrites = [...pay.matchAll(/writeCardDraft\(/g)].length;
  assert.equal(rewrites, 3, "three places on this screen rewrite the card");
  assert.equal([...pay.matchAll(/writeCardDraft\(next, address\);\n\s+keepOnDevice\(next\);/g)].length, 2);
  assert.match(pay, /onMakeIt=\{\(dollars\) => \{\n(\s*\/\/[^\n]*\n)+\s+const next = \{ \.\.\.draft, dollars, typedAmount: dollars, typedIn: "USD" \};\n\s+writeCardDraft\(next, address\);\n\s+keepOnDevice\(next\);/);
  assert.match(pay, /writeCardDraft\(\{ \.\.\.draft, standing: undefined, standingReadAt: undefined \}, address\);\n\s+setPhase\("waiting"\);\n\s+router\.push\("\/"\);/);
  // The pay press is where a payment is started: the terms, the account, the way in, before the wait is opened.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.ok(sheet.indexOf("savePendingGift({ ...draftToTerms(said, account), wayIn: way.name });") > 0);
  assert.ok(sheet.indexOf("savePendingGift({ ...draftToTerms(said, account), wayIn: way.name });") < sheet.indexOf('router.push("/fund?step=paying'));
});
