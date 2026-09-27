import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The judges page, "Our own key" (money path audit, 27 Sep 2026; the 23 Sep review, finding 3). The item said the
 * evidence signer "cannot move money ... or take anything back". The contracts let the same key say who opened a
 * gift, so whoever holds it can open a gift still waiting for its recipient into an account of their own and take it,
 * and on a gift already opened it can tip the money either way between the recipient and the funder. These tests hold
 * the item to what the two gift contracts allow, and hold the contracts to the bound the item states.
 */

const CONTRACTS = ["contracts/GiftEscrow.sol", "contracts/MilestoneGift.sol"] as const;

/** The words a judge reads in the "Our own key" item, without the markup. */
function ourOwnKey(): string {
  const page = readFileSync("app/judges/page.tsx", "utf8");
  const start = page.indexOf("<strong>Our own key.</strong>");
  assert.ok(start >= 0, "the judges page still has an item on our own key");
  const end = page.indexOf("</li>", start);
  assert.ok(end > start);
  return page
    .slice(start, end)
    .replace(/\{" "\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** The body of one Solidity function, braces matched. */
function body(source: string, name: string): string {
  const at = source.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`${name} has no end`);
}

/** Solidity without its comments, so a sentence in a comment is never mistaken for code. */
const code = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

test("the item no longer says the key cannot move money or take anything back", () => {
  const said = ourOwnKey();
  assert.doesNotMatch(said, /cannot move money/);
  assert.doesNotMatch(said, /take anything back/);
});

test("the item says what the key can do: open a waiting gift for itself, and tip an opened one either way", () => {
  const said = ourOwnKey();
  assert.ok(said.includes("and so does the opening of a gift"), said);
  assert.ok(said.includes("the owner can put another key in its place"), said);
  assert.ok(
    said.includes("could open a gift still waiting for its recipient into an account of their own, sign readings for it and take it"),
    said,
  );
  assert.ok(said.includes("the whole amount at once on a milestone, a day at a time on a daily gift"), said);
  assert.ok(said.includes("which pays the recipient what the funder should have had back"), said);
  assert.ok(said.includes("a reading after which no real one counts, which sends what was not yet earned back to the funder"), said);
});

test("the item says what the key cannot do, and no more than the contracts guarantee", () => {
  const said = ourOwnKey();
  assert.ok(
    said.includes(
      "On a gift someone has already opened, money leaves only at that person's own signed request or to the refund address the funder signed",
    ),
    said,
  );
  assert.ok(said.includes("It cannot change the terms a funder signed or take back what was already credited."), said);
  assert.ok(said.includes("detectable, for the readings whose proof is kept"), said);
});

test("the contracts: the evidence signer alone decides who opens a gift, and signs every reading", () => {
  for (const file of CONTRACTS) {
    const source = code(file);
    const claim = body(source, "claim");
    assert.match(claim, /!= evidenceSigner\) revert InvalidEvidenceSigner\(\)/, `${file}: claim checks the evidence signer`);
    assert.match(claim, /g\.recipient = c\.recipient;/, `${file}: claim binds the account the signer named`);
    assert.doesNotMatch(claim, /msg\.sender/, `${file}: nothing but the signature says who opened it`);
    const reading = file.endsWith("GiftEscrow.sol") ? body(source, "_verifyCheckInSignature") : body(source, "_verifyProofSignature");
    assert.match(reading, /!= evidenceSigner\) revert InvalidEvidenceSigner\(\)/, `${file}: a reading is the evidence signer's`);
    assert.match(body(source, "setEvidenceSigner"), /evidenceSigner = newSigner;/, `${file}: the owner can put another key in its place`);
    assert.match(source, /function setEvidenceSigner\(address newSigner\) external onlyOwner/);
  }
});

test("the contracts: money leaves only at the recipient's request or to the refund address, and nothing credited is lowered", () => {
  for (const file of CONTRACTS) {
    const source = code(file);
    // Every transfer out goes through _push, and _push goes only to _withdraw's `to` or to the funder's refund address.
    assert.equal(source.match(/safeTransfer\(/g)?.length, 1, `${file}: one transfer out`);
    assert.match(body(source, "_push"), /token\.safeTransfer\(to, amount\);/);
    const pushes = [...source.matchAll(/(?<!function )_push\(([^,]+),/g)].map((m) => m[1].trim());
    assert.deepEqual([...new Set(pushes)].sort(), ["g.refundTo", "to"], `${file}: ${pushes.join(", ")}`);
    assert.match(body(source, "_withdraw"), /_push\(to, amount\);/, `${file}: "to" is _withdraw's own`);
    // _withdraw is reached only by the recipient, or by the recipient's signature.
    assert.equal(source.match(/_withdraw\(giftId/g)?.length, 2, `${file}: two ways to withdraw`);
    assert.match(body(source, "withdrawEarned"), /if \(msg\.sender != g\.recipient\) revert NotRecipient\(\);/);
    assert.match(body(source, "withdrawEarnedWithIntent"), /!= g\.recipient\) \{\s*revert InvalidRecipientSignature\(\);/);
    // The funder's refund address is written once, from the terms they signed.
    assert.equal(source.match(/g\.refundTo = /g)?.length, 1, `${file}: refundTo is set once`);
    assert.match(body(source, "createGift"), /g\.refundTo = p\.refundTo;/);
    // What was credited is never lowered.
    assert.doesNotMatch(source, /creditedDays\s*-=|earned\s*-=|withdrawnByRecipient\s*-=/, `${file}: nothing credited is taken back`);
  }
});
