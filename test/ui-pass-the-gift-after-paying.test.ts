import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followGiftLinks, giftLinkOnThisDevice, rememberGiftLink } from "../src/gift-link-memory";
import { liveOf, type LiveInput } from "../src/gift-live";
import { forgetJustMade, markJustMade, wasJustMade } from "../src/just-made";
import { FUND, GIFT_PAGE, MILESTONE_FUND } from "../src/sentences";

/**
 * The person who offered a gift has just paid (the UI pass of 8 Oct 2026, screen 3). What follows is the gift's own
 * page in its first state, not a screen of its own: the card says "Send it to Boo.", the link is under it with one
 * button, and nothing says the amount and the condition a second time. The page in a browser is walked by
 * test/browser/funder-page.spec.ts.
 */

const read = (file: string) => readFileSync(file, "utf8");

const UNOPENED: LiveInput = {
  moment: "unopened",
  voice: "funder",
  funderName: "Mom",
  recipientName: "Boo",
  source: "their university",
  amountDisplay: "$5.00",
  theirsDisplay: "$0.00",
  returnedDisplay: "$0.00",
  todayReading: null,
  target: 1,
  started: false,
  shown: true,
  shape: "stamp",
  lastJudged: null,
  openBy: "22 Oct 2026",
  connectBy: null,
  nextReadingInWords: null,
  cameBackOnInWords: null,
};

test("the card of a gift just paid for says to send it, on the device that holds the link", () => {
  const here = liveOf({ ...UNOPENED, linkHere: true });
  assert.equal(here.headline, "Send it to Boo.");
  assert.equal(here.next, "Whoever opens the link takes the gift.");
  assert.deepEqual(here.figure, { label: "In their name", value: "$5.00" });
  assert.equal(liveOf({ ...UNOPENED, linkHere: true, recipientName: null }).headline, "Send the link.");
  // On a device that does not hold it: where the gift stands, and the day it comes back if nobody opens it.
  const elsewhere = liveOf({ ...UNOPENED, linkHere: false });
  assert.equal(elsewhere.headline, "Boo has not opened it yet.");
  assert.equal(elsewhere.next, "By 22 Oct 2026, or it comes back to you.");
  assert.equal(liveOf(UNOPENED).headline, "Boo has not opened it yet.", "nothing is claimed of a link before the browser has read its own memory");
  // The person it is for reads their own card, whatever this device holds.
  assert.equal(liveOf({ ...UNOPENED, voice: "recipient", linkHere: true }).headline, "Mom put this in your name.");
});

test("the day an unopened gift comes back is the contract's fourteen days, never the gift's own last day", () => {
  const page = read("app/components/GiftPage.tsx");
  assert.match(page, /const openBy = moment === "unopened" \? dateInWords\(\(status\.createdAtChain \+ 14 \* 86_400\) \* 1000, zone\) : null;/);
  assert.match(read("contracts/MilestoneGiftV2.sol"), /DORMANT_REFUND_DELAY = 14 days/);
});

test("the link stands in the gift's card with one button, and nothing says where it is kept", () => {
  const block = read("app/kit/LinkAgain.tsx");
  assert.doesNotMatch(block, /className=\{CARD\}|<h2/, "no frame and no title of its own");
  assert.match(block, /<p\s+onClick=\{\(\) => copy\(link\)\}/, "a press on the field copies");
  assert.match(block, /<Button done=\{copied \? W\.copied : null\} failed=\{refusal\}[^>]*onPress=\{\(\) => copy\(link\)\}/);
  assert.equal(GIFT_PAGE.copyLink, "Copy the link");
  assert.equal(GIFT_PAGE.copied, "Copied");
  for (const gone of ["copyLinkAgain", "linkOnlyHere", "linkAgainTitle", "linkFind", "linkFindWhy"]) assert.equal(gone in GIFT_PAGE, false, gone);
  // With a link here, the way to find one is not offered: the link is right above.
  const held = block.slice(block.indexOf("if (link) {"), block.indexOf("if (found) {"));
  assert.doesNotMatch(held, /findTheLink|getLinkAgain|setAsking/);
  // A clipboard that refuses says to hold the link, which stays text.
  assert.equal(GIFT_PAGE.linkCopyRefused, "Your browser would not let us copy it. Press and hold the link, then choose Copy.");
});

test("on a device that does not hold it, a gift of today finds the same link on one press, and a gift of the first contract still reads the sheet", () => {
  const block = read("app/kit/LinkAgain.tsx");
  const finds = block.slice(block.indexOf("if (found) {"), block.indexOf("  return (\n    <div className=\"flex flex-col gap-[var(--space-md)]\" data-gift-link-block=\"\">\n      {/* A gift of the first contract"));
  assert.match(finds, /<Button look="secondary" doing=\{busy \? W\.findingLink : null\} failed=\{refusal\}[^>]*onPress=\{\(\) => void bring\(\)\}/);
  assert.match(finds, /<p className=\{HELP\}>\{W\.sameLink\}<\/p>/);
  assert.doesNotMatch(finds, /<Sheet/, "a step with no decision is the button's own state");
  assert.equal(GIFT_PAGE.findTheLink, "Find the link");
  assert.equal(GIFT_PAGE.sameLink, "The same link you sent. It still works.");
  // True of the code: the link of a gift of the second version is made again from the funder's own signature.
  assert.match(block, /found \? await giftLinkFound\(await ensureSigner\(\), giftId\) : await giftLinkAgain\(giftId\)/);
  // The first contract replaces the key: said before the press, in the sentences of before.
  assert.equal(GIFT_PAGE.linkAgainWhy, "Lost the link, or sent it from another device? Get a new one. The link you had stops working the moment you do.");
  assert.match(block, /<p className=\{BODY\}>\{W\.linkAgainWhy\}<\/p>/);
});

test("the device's memory of a link tells whoever follows it, so the card says 'Send it' the moment a link is found", () => {
  const kept = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) } };
  let told = 0;
  const leave = followGiftLinks(() => (told += 1));
  assert.equal(giftLinkOnThisDevice("1000042"), null);
  rememberGiftLink("1000042", "https://viky.cash/g/1000042?t=preview#secret");
  assert.equal(told, 1);
  assert.equal(giftLinkOnThisDevice("1000042"), "https://viky.cash/g/1000042?t=preview#secret");
  leave();
  rememberGiftLink("1000043", "https://viky.cash/g/1000043?t=preview#secret");
  assert.equal(told, 1, "nobody is told once they have left");
  const page = read("app/components/GiftPage.tsx");
  assert.match(page, /const linkHere = useSyncExternalStore\(followGiftLinks, \(\) => giftLinkOnThisDevice\(giftId\) !== null, \(\) => false\);/);
});

test("paying leads to the gift's page, and the screen that stood between them is gone", () => {
  const pay = read("app/components/PayGift.tsx");
  assert.match(pay, /rememberGiftLink\(result\.giftId, claimUrl\);/, "the device keeps the link before the page that shows it");
  assert.match(pay, /router\.replace\(`\/g\/\$\{result\.giftId\}`\);/);
  assert.doesNotMatch(pay, /data-made-figures|data-made-next|W\.made\.|M\.made\./);
  // An address kept from before the change leads to the gift, and to the pay screen when no gift was kept.
  assert.match(pay, /if \(step === "done"\) \{\n\s*const before = readSession<\{ giftId\?: string \}>\(MADE_KEY\)\?\.giftId;\n\s*if \(before && \/\^\\d\{1,78\}\$\/\.test\(before\)\) router\.replace\(`\/g\/\$\{before\}`\);\n\s*else replace\("pay"\);/);
  assert.equal("made" in FUND, false);
  assert.equal("made" in MILESTONE_FUND, false);
  // What that screen said twice is said once: the date and the number are a line of "What was agreed".
  const page = read("app/components/GiftPage.tsx");
  assert.match(page, /const madeRow: Row \| null = readerIsFunder \? \(\[W\.lines\.made, W\.lines\.madeOn\(dateInWords\(status\.createdAtChain \* 1000, zone\), giftId\)\] as const\) : null;/);
  // Before the opening it comes straight after what the gift is, so the fold's four lines never cut it: a gift of
  // today has more than four, and the line was the last.
  assert.match(page, /const madeBeforeOpening = status\.opened \? null : madeRow;/);
  assert.match(page, /\[W\.lines\.missedDay, backToFunder\] as const, madeBeforeOpening\]/);
  assert.match(page, /twoWeeksLater\(backToFunder\) : backToFunder\] as const,\n\s*madeBeforeOpening,/);
  assert.match(page, /status\.opened \? madeRow : null,\n\s*\]\n\s*\.filter\(\(row\): row is Row => Boolean\(row\)\)\n\s*\.slice\(0, MOST_LINES_IN_A_FOLD\);/);
});

test("the payment's arrival is played once on that page, and a reload plays nothing", () => {
  const kept = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value), removeItem: (key: string) => void kept.delete(key) },
  };
  assert.equal(wasJustMade("1000042"), false);
  markJustMade("1000042");
  assert.equal(wasJustMade("1000042"), true);
  assert.equal(wasJustMade("1000042"), true, "reading changes nothing: a page drawn twice reads the same");
  assert.equal(wasJustMade("1000043"), false, "another gift's page plays nothing");
  forgetJustMade();
  assert.equal(wasJustMade("1000042"), false);
});
