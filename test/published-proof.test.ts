// `pnpm verify:day --reading` on a Chess.com climb (the founder, 13 Oct 2026). The reading keeps two proofs, the
// profile then the ratings, and publishes the second's fingerprint, the one the contract records. The command took the
// first of the file and answered no twice on a true reading.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { claimFingerprint } from "../src/duolingo-public";
import { proofOfFingerprint } from "../src/published-proof";

const profile = { claimData: { identifier: `0x${"a1".repeat(32)}` }, signatures: ["0x01"] };
const ratings = { claimData: { identifier: `0x${"b2".repeat(32)}` }, signatures: ["0x02"] };

test("of the proofs a reading kept, the one verified is the one the published fingerprint is of", () => {
  const published = claimFingerprint(ratings.claimData.identifier);
  assert.notEqual(published, claimFingerprint(profile.claimData.identifier));
  assert.equal(proofOfFingerprint([profile, ratings], published), ratings, "the second, which the contract recorded");
  assert.equal(proofOfFingerprint([profile, ratings], published.toUpperCase().replace("0X", "0x")), ratings, "whatever the case it is written in");
  assert.equal(proofOfFingerprint([ratings, profile], published), ratings, "by its fingerprint, never by its place");
  // One proof, as a day of lessons keeps: itself, with or without a fingerprint.
  assert.equal(proofOfFingerprint(profile, claimFingerprint(profile.claimData.identifier)), profile);
  assert.equal(proofOfFingerprint([profile], undefined), profile);
  // Nothing published, or a fingerprint that is none of theirs: the first, and the command's own question says no.
  assert.equal(proofOfFingerprint([profile, ratings], undefined), profile);
  assert.equal(proofOfFingerprint([profile, ratings], `0x${"00".repeat(32)}`), profile);
});

test("the command chooses that way for a file and for the example a site publishes", () => {
  const script = readFileSync("scripts/verify-day.ts", "utf8");
  assert.match(script, /proof: proofOfFingerprint\(raw as Proof \| Proof\[\], fingerprint\),/);
  assert.match(script, /proof: proofOfFingerprint\(example\.proof as Proof \| Proof\[\], example\.fingerprint\)/);
  assert.doesNotMatch(script, /\? raw\[0\] : raw|example\.proof\[0\]/, "never the first by its place");
});
