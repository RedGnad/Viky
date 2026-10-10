import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { GiftRequest } from "../src/client/gift";
import { attemptFor, attemptKept, attemptToKeep, GIFT_ATTEMPT_MAX_AGE_MS } from "../src/gift-attempt";
import { madeSince, PENDING_GIFT_MAX_AGE_MS } from "../src/pending-gift";

/**
 * A page closed while the gift was being made (the final audit of 9 Oct 2026, A4). The screen says "You can close this
 * page"; the gift was made, and for three days the device went on saying it was "set up on this device and not made
 * yet", over a button that made a second gift when the account still held the amount: the signed request was kept for
 * the tab, and went with it.
 */
const NOW = Date.UTC(2026, 9, 10, 9, 0);
const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761";
const kept = { recipientName: "Léa", dollars: "25", days: "30", savedAtMs: NOW };
const made = (over: Record<string, unknown> = {}) => ({ role: "funder", recipientName: "Léa", amountDisplay: "$25.00", durationDays: 30, fundedAt: Math.floor(NOW / 1000) + 40, ...over });

test("a kept gift whose twin is in the account's list was made, and only its twin says so", () => {
  assert.equal(madeSince(kept, [made()]), true);
  assert.equal(madeSince({ ...kept, recipientName: " Léa " }, [made()]), true, "a first name is a first name, spaces or not");
  // Each of the four has to agree, and the gift has to be one this account paid for, after this one was written down.
  assert.equal(madeSince(kept, []), false);
  assert.equal(madeSince(kept, [made({ recipientName: "Noah" })]), false);
  assert.equal(madeSince(kept, [made({ amountDisplay: "$30.00" })]), false);
  assert.equal(madeSince(kept, [made({ durationDays: 7 })]), false);
  assert.equal(madeSince(kept, [made({ role: "recipient" })]), false, "a gift made out to this account is not one it made");
  assert.equal(madeSince(kept, [made({ fundedAt: Math.floor(NOW / 1000) - 3_600 })]), false, "the same gift made an hour before is another gift");
  // A kept gift whose amount cannot be read is never taken for one that was made.
  assert.equal(madeSince({ ...kept, dollars: "a lot" }, [made()]), false);
  // The figure the list prints is the one the kept gift's dollars print as, whatever was typed.
  assert.equal(madeSince({ ...kept, dollars: "50.51" }, [made({ amountDisplay: "$50.51" })]), true);
});

test("Home and Gifts hand the block their gifts, and a gift that was made is forgotten with nothing said", () => {
  const block = readFileSync("app/kit/FinishTheGift.tsx", "utf8");
  assert.match(block, /made: gifts \? madeSince\(kept, gifts\) : false \}\);\n\s+\}, \[address, gifts\]\),/);
  assert.match(block, /useEffect\(\(\) => \{\n\s+if \(!made\) return;\n\s+forgetPendingGift\(\);\n\s+clearedCardDraft\(\);\n\s+\}, \[made\]\);/);
  assert.match(block, /if \(!waiting \|\| made\) return null;/);
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /<FinishTheGift gifts=\{gifts\} \/>/);
  assert.match(readFileSync("app/kit/Gifts.tsx", "utf8"), /<FinishTheGift gifts=\{gifts\} \/>/);
});

const terms = { account: A, username: "ama_learns", recipientName: "Léa", funderName: "Mom", goalType: 1, dailyTarget: 10, durationDays: 30, amount: "25000000" };
const request = { authorization: { nonce: "0x01" }, salt: "0x02" } as unknown as GiftRequest;

test("the signed request is kept for the device, for as long as the gift is, and never longer", () => {
  assert.equal(GIFT_ATTEMPT_MAX_AGE_MS, PENDING_GIFT_MAX_AGE_MS);
  const stored = attemptToKeep({ terms, request }, NOW);
  const back = attemptKept(stored, NOW + 12 * 60_000);
  assert.deepEqual(back, { terms, request });
  assert.deepEqual(attemptFor(back, terms), request, "found again by the same terms");
  assert.equal(attemptFor(back, { ...terms, account: "0x91C964e745ffd6265c75df33cA9137D81c3c454d" }), undefined, "never another account's");
  assert.ok(attemptKept(stored, NOW + GIFT_ATTEMPT_MAX_AGE_MS - 1));
  assert.equal(attemptKept(stored, NOW + GIFT_ATTEMPT_MAX_AGE_MS + 1), null);
  assert.equal(attemptKept(stored, NOW - 10 * 60_000), null, "written in the future is not a request anybody made");
  for (const unreadable of [null, "", "{", "[]", JSON.stringify({ terms, request }), JSON.stringify({ terms, keptAtMs: NOW })]) assert.equal(attemptKept(unreadable, NOW), null);
  // Where the page keeps it: the device's own storage, and no longer the tab's.
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(pay, /return attemptKept\(window\.localStorage\.getItem\(GIFT_ATTEMPT_KEY\), Date\.now\(\)\);/);
  assert.match(pay, /else window\.localStorage\.setItem\(GIFT_ATTEMPT_KEY, attemptToKeep\(attempt, Date\.now\(\)\)\);/);
  assert.doesNotMatch(pay, /sessionStorage\.(set|remove)Item/, "the pay screen writes nothing for the tab alone any more");
});

test("the wait sends the kept request again at its first look, whatever the account holds, and once", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  const look = pay.slice(pay.indexOf("const look = async () => {"), pay.indexOf("const next = nextFundingStep("));
  assert.match(look, /if \(!sentKept\.current\) \{\n\s+sentKept\.current = true;\n\s+const terms = termsOf\(address\);\n\s+if \(terms && attemptFor\(readAttempt\(\), terms\)\) \{\n\s+await make\(\);\n\s+return;\n\s+\}\n\s+\}/);
  assert.ok(look.indexOf("if (!sentKept.current)") < look.indexOf("const read = await refresh();"), "before the account is read");
  // The same terms the creation signs for: written once, used by both.
  assert.match(pay, /const terms = termsOf\(account\.address\);\n\s+if \(!terms\) throw new Error\(W\.failures\.other\);/);
  assert.equal(pay.split("goalType: milestone ? (cadence?.goalType ?? 0)").length - 1, 1, "the terms are written in one place");
});

test("a gift read as already made is forgotten when it is read, not when a button is pressed", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(pay, /setPhase\("failed"\);\n(\s*\/\/[^\n]*\n)+\s+if \(error instanceof ApiError && error\.code === "ALREADY_MADE"\) \{\n\s+forgetPendingGift\(\);\n\s+setKept\(undefined\);\n\s+\}/);
});
