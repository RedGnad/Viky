import { strict as assert } from "node:assert";
import test from "node:test";
import { EXIT_NONCE_TAG, exitNonce, hashExitTerms, NATIVE_OUT, type ExitTerms } from "../src/exit-terms.js";

/**
 * The TypeScript half of the way out's parity pin. The SAME hex is asserted in test/ExitTermsParity.t.sol.
 * If either side drifts, the token refuses every signature and nobody can be paid, so it must fail in CI.
 */

const TERMS: ExitTerms = {
  payer: "0x00000000000000000000000000000000000A11cE",
  amount: 3_000_000n,
  // The stablecoin one payout service takes; the other takes the chain's own coin (D77).
  tokenOut: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  minOut: 2_997_000n,
  exchange: "0xb3e6778480b2E488385E8205eA05E20060B813cb",
  callHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
  deadline: 1_800_000_600n,
  salt: "0x0000000000000000000000000000000000000000000000000000000000000002",
};

test("the tag, the terms and the nonce match the contract's pin", () => {
  assert.equal(EXIT_NONCE_TAG, "0x0de910a1b0f5e4b17afad1da2ba4244aa30c5610373da5d1d456c6b22b1b1d8b");
  assert.equal(hashExitTerms(TERMS), "0xc92bda34589b9e0db645b39b5d7d78af9b3add4c4f62afe742c03127d3de7d7c");
  assert.equal(exitNonce(TERMS), "0x196cac2a2acfb5bf33ca8c2f8b42d73bc790a68b3f08743a9a1afc0c5c3f8d08");
});

test("every field is part of what was signed, so no relayer can change one quietly", () => {
  const base = exitNonce(TERMS);
  const variants: ExitTerms[] = [
    // The payer is the one field whose omission would let a relayer spend somebody else's authorization on
    // terms of its own. It is also the only account in the terms: the proceeds go back to it.
    { ...TERMS, payer: "0x0000000000000000000000000000000000000B0b" },
    { ...TERMS, amount: 3_000_001n },
    // The coin decides which payout service can ever see the money, so it has to be signed like the rest.
    { ...TERMS, tokenOut: NATIVE_OUT },
    { ...TERMS, minOut: 2_996_999n },
    { ...TERMS, exchange: "0x00000000000000000000000000000000000A11cE" },
    { ...TERMS, callHash: "0x0000000000000000000000000000000000000000000000000000000000000003" },
    { ...TERMS, deadline: 1_800_000_601n },
    { ...TERMS, salt: "0x0000000000000000000000000000000000000000000000000000000000000004" },
  ];
  for (const variant of variants) assert.notEqual(exitNonce(variant), base);
});

/**
 * The tag moved from v1 to v2 to v3 with the struct. Had it not, a signature made when the terms carried a
 * destination, or when the coin lived outside them, would hash to a nonce the new contract accepts, and the
 * same bytes would be read as different terms entirely.
 */
test("the tag moved with the terms, so no older signature can be replayed against these", () => {
  for (const older of [
    "0xdd4bba613d066136bca6ad1767334a869d95213754ff7c20fb74938a5e4436b1",
    "0xbf531a040033df883262e69cd5132221c768414d020bb14241860f555f53c7ff",
  ]) {
    assert.notEqual(EXIT_NONCE_TAG, older);
  }
});
