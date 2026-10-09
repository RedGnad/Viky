import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pinDoesNotCover } from "../src/witness-portal";

/**
 * The review of two first proofs of one provider (the founder, 9 Oct 2026, before a student shows "Passed the year" and
 * "Reached a grade" on one university the same day). Reclaim's agent writes a version for each pass, so the two proofs
 * are of two versions: the pin born of the first does not cover the second, and that is no fault of the second.
 */
const pin = readFileSync("scripts/portal-pin.ts", "utf8");

test("a proof of another version, pattern or method than the pin's is one the pin does not cover, and nothing else is", () => {
  for (const code of ["WITNESS_OTHER_VERSION", "WITNESS_OTHER_PATTERN", "WITNESS_OTHER_METHOD"]) assert.equal(pinDoesNotCover(code), true, code);
  // Another site, another signer, a claim that is not signed: those are faults of the proof, whatever the pin.
  for (const code of ["WITNESS_OTHER_DOMAIN", "WITNESS_OTHER_SIGNER", "WITNESS_UNSIGNED", "WITNESS_MALFORMED", "NOT_PASSED", "NO_GRADE", "WRONG_TERM", undefined]) assert.equal(pinDoesNotCover(code), false, String(code));
});

test("a held proof the pin does not cover stays held: it is not refused, and the person is told nothing", () => {
  const settle = pin.slice(pin.indexOf("async function settle(review: PortalReview)"), pin.indexOf("async function main()"));
  const kept = settle.slice(settle.indexOf("if (error instanceof VerificationError && pinDoesNotCover(error.code)) {"), settle.indexOf("const final ="));
  assert.ok(kept.length > 0, "the case is decided before any refusal");
  assert.match(kept, /step: "still held: the pin does not cover it"/);
  assert.match(kept, /next: `pin from it: pnpm portal:pin \$\{review\.sessionId\} /);
  assert.match(kept, /\n\s*return;\n\s*\}/);
  assert.doesNotMatch(kept, /decideReview|told\(/, "nothing is decided and nothing is said");
  // Every proof held for the provider is settled after a pin, and each one goes through this same decision.
  assert.match(pin, /for \(const other of await pendingReviews\(\)\) if \(other\.portalId === portal\.portalId && other\.sense === review\.sense\) await settle\(other\);/);
});

test("naming what to read on a held proof pins the provider from that proof, whatever pin it has", () => {
  // The patterns given used to be dropped without a word where a pin stood, and the proof settled on a pin it could
  // not fit. With none named, a proof is still settled on the pin in place.
  assert.match(pin, /const pinsFromThis = review\.sense === "enrolment" \? flag\("matches"\) !== undefined : flag\("admitted"\) !== undefined \|\| flag\("scale"\) !== undefined;/);
  assert.match(pin, /if \(provider\.pin && provider\.extract && !provider\.pin\.ahead && !pinsFromThis\) \{/);
  // What the command says of itself is what it does.
  const said = pin.slice(pin.indexOf("/**"), pin.indexOf("function flag("));
  assert.match(said, /from this proof, whether or not the provider had a pin/);
  assert.match(said, /One it does not cover stays\n \*     held/);
  assert.doesNotMatch(said, /refusing by its code any that the pin does not fit/);
});
