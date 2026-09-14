import { strict as assert } from "node:assert";
import test from "node:test";
import { EXIT_NONCE_TAG, exitNonce, hashExitTerms, type ExitTerms } from "../src/exit-terms.js";

/**
 * The TypeScript half of the way out's parity pin. The SAME hex is asserted in test/ExitTermsParity.t.sol.
 * If either side drifts, the token refuses every signature and nobody can be paid, so it must fail in CI.
 */

const TERMS: ExitTerms = {
  payer: "0x00000000000000000000000000000000000A11cE",
  payoutTo: "0x0000000000000000000000000000000000000B0b",
  amount: 3_000_000n,
  minOut: 126_000_000_000_000_000_000n,
  exchange: "0xb3e6778480b2E488385E8205eA05E20060B813cb",
  callHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
  deadline: 1_800_000_600n,
  salt: "0x0000000000000000000000000000000000000000000000000000000000000002",
};

test("the tag, the terms and the nonce match the contract's pin", () => {
  assert.equal(EXIT_NONCE_TAG, "0xdd4bba613d066136bca6ad1767334a869d95213754ff7c20fb74938a5e4436b1");
  assert.equal(hashExitTerms(TERMS), "0xccad8506d70276c93375f96e5ec8d7e692deebf95ff95de12e37bbafc8ae6e1d");
  assert.equal(exitNonce(TERMS), "0xa6090652bd18818b0eab2ae7c9a21f66bd3559657c7972884ce8a6136cbe0503");
});

test("every field is part of what was signed, so no relayer can change one quietly", () => {
  const base = exitNonce(TERMS);
  const variants: ExitTerms[] = [
    { ...TERMS, payoutTo: "0x00000000000000000000000000000000000A11cE" },
    { ...TERMS, amount: 3_000_001n },
    { ...TERMS, minOut: 125_000_000_000_000_000_000n },
    { ...TERMS, exchange: "0x00000000000000000000000000000000000A11cE" },
    { ...TERMS, callHash: "0x0000000000000000000000000000000000000000000000000000000000000003" },
    { ...TERMS, deadline: 1_800_000_601n },
    { ...TERMS, salt: "0x0000000000000000000000000000000000000000000000000000000000000004" },
  ];
  for (const variant of variants) assert.notEqual(exitNonce(variant), base);
});
