// The TypeScript half of the milestone protocol pin. Every hex here is asserted identical in
// test/MilestoneTypehashParity.t.sol against the contract. If either formula drifts, one side fails.

process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHESS_CLIMBS, CHESS_MODES, chessGoalType, chessClimbOfGoal, chessProviderId } from "../src/chess-com";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { CLAIM_TYPEHASH, WITHDRAW_TYPEHASH } from "../src/gift-terms";
import { signMilestoneClaim, signMilestoneProof } from "../src/milestone-attestation";
import {
  hashMilestoneParams,
  isMilestoneGiftId,
  MILESTONE_CLAIM_TYPEHASH,
  MILESTONE_CLAIM_TYPES,
  MILESTONE_DOMAIN,
  MILESTONE_FIRST_ID,
  MILESTONE_FUND_NONCE_TAG,
  MILESTONE_PROOF_TYPEHASH,
  MILESTONE_PROOF_TYPES,
  MILESTONE_WITHDRAW_TYPEHASH,
  milestoneFundingNonce,
  SHAPE_CLIMB,
  ZERO_SUBJECT,
} from "../src/milestone-protocol";

const CONTRACT = "0x00000000000000000000000000000000000000c2" as const;
const RECIPIENT = "0x79C53151315FaD9163f75a65A8Bd4D04a10e1e45" as const;

test("the typehashes, the tag, the terms' hash and the funding nonce match the Solidity pin", () => {
  assert.equal(MILESTONE_CLAIM_TYPEHASH, "0x2cc2ef1342b642e75667cc06ec45e6fcd050584c714b83316da1360cdfa9a44f");
  assert.equal(MILESTONE_PROOF_TYPEHASH, "0x2e334597ad17c7a0a6d0115c0a1bd40455a3d23a5358a913c0613e9d33f0558f");
  assert.equal(MILESTONE_WITHDRAW_TYPEHASH, "0x934fbda9a8be236a524d3f7d43c9cc2c829b9a8ab1c9e54726f96800fa14137e");
  assert.equal(MILESTONE_FUND_NONCE_TAG, "0x3f630561bddd9d392e0f5542a24baa7d9db51ac2d836df26e18886f03cff1860");
  // Same struct shapes as the daily contract; the domain is what keeps the two apart.
  assert.equal(MILESTONE_CLAIM_TYPEHASH, CLAIM_TYPEHASH);
  assert.equal(MILESTONE_WITHDRAW_TYPEHASH, WITHDRAW_TYPEHASH);
  assert.deepEqual(MILESTONE_DOMAIN, { name: "Viky Milestone", version: "1", chainId: 143 });

  assert.equal(NO_CONTACT_HASH, "0x6159a8d5bbbbf3f243f3b1bc36324cf58617b4a0c69727ee4c35188b65423b97");
  const params = {
    funder: "0x00000000000000000000000000000000000A11cE" as Hex,
    refundTo: "0x00000000000000000000000000000000000A11cE" as Hex,
    recipientContactHash: NO_CONTACT_HASH as Hex,
    goalType: 1,
    shape: SHAPE_CLIMB,
    target: 1500n,
    maximumStart: 1430n,
    subject: ZERO_SUBJECT,
    durationDays: 30,
    amount: 25_000_000n,
    salt: `0x${"0".repeat(63)}1` as Hex,
  };
  assert.equal(hashMilestoneParams(params), "0xbe1cf1f6253514a1ff39971b7ef2300b04b4dd227dfd808c913d3d825e4f5eea");
  assert.equal(milestoneFundingNonce(params), "0x6b2b0396432e5429078494d52f7c45bf6d41bd08504ea384e3422eafcd863d8b");
});

test("each cadence has its own goal type and provider id, pinned against the contract test", () => {
  assert.deepEqual(
    CHESS_MODES.map((mode) => [mode, chessGoalType(mode), chessProviderId(mode)]),
    [
      ["rapid", 1, "0x56c9a42f353c58f8ef74b979c6a74fa6144562aed8f7fe5cf93c9cbeeef93b40"],
      ["blitz", 2, "0xc57bd1392946f1743380ebedbe6561e03e5a6e8bdaa6af8879b89caa5dc3fd36"],
      ["bullet", 3, "0x2b19a55b3e63943851b302dd0601451792be3cb97fadfa8047cb876900084330"],
      ["daily", 4, "0xb55b5e37e9fa879c5bc5adbffa5ca98372cc00d8fe21279e827cf9c94d3706e3"],
    ],
  );
  for (const climb of CHESS_CLIMBS) assert.equal(chessClimbOfGoal(chessGoalType(climb)), climb);
  assert.equal(chessClimbOfGoal(5), undefined, "the number after the four cadences belongs to another source");
});

test("a milestone gift number can never be a daily one", () => {
  assert.equal(MILESTONE_FIRST_ID, 1_000_000n);
  assert.match(readFileSync("contracts/MilestoneGift.sol", "utf8"), /FIRST_ID_FLOOR = 1_000_000;/);
  assert.equal(isMilestoneGiftId("999999"), false);
  assert.equal(isMilestoneGiftId("1000000"), true);
  assert.equal(isMilestoneGiftId("not a number"), false);
});

test("the evidence signer's claims and proofs recover to it under the milestone domain only", async () => {
  const signer = privateKeyToAccount(process.env.EVIDENCE_SIGNER_PRIVATE_KEY as Hex).address;
  const claim = { giftId: 1_000_000n, recipient: RECIPIENT, contactHash: NO_CONTACT_HASH, issuedAt: 1_789_000_000n, expiresAt: 1_789_000_600n };
  const claimSignature = await signMilestoneClaim(claim, CONTRACT);
  const domain = { ...MILESTONE_DOMAIN, verifyingContract: CONTRACT };
  assert.equal(await recoverTypedDataAddress({ domain, types: MILESTONE_CLAIM_TYPES, primaryType: "Claim", message: claim, signature: claimSignature }), signer);
  // The daily contract's domain recovers someone else, so a milestone claim can never open a daily gift.
  const daily = { name: "Viky Gift", version: "1", chainId: 143, verifyingContract: CONTRACT } as const;
  assert.notEqual(await recoverTypedDataAddress({ domain: daily, types: MILESTONE_CLAIM_TYPES, primaryType: "Claim", message: claim, signature: claimSignature }), signer);

  const proof = {
    giftId: 1_000_000n,
    recipient: RECIPIENT,
    identityHash: `0x${"1d".repeat(32)}` as Hex,
    providerId: chessProviderId("rapid"),
    metricValue: 1904n,
    eventAt: 0n,
    observedAt: 1_789_000_000n,
    nullifier: `0x${"ee".repeat(32)}` as Hex,
    issuedAt: 1_789_000_010n,
    expiresAt: 1_789_000_610n,
  };
  const proofSignature = await signMilestoneProof(proof, CONTRACT);
  assert.equal(await recoverTypedDataAddress({ domain, types: MILESTONE_PROOF_TYPES, primaryType: "Proof", message: proof, signature: proofSignature }), signer);
});

test("every relayer floor sits above the Foundry gas report of 17 Sep 2026, and the declared limit adds the Monad margin", async () => {
  const { MILESTONE_GAS_CEILING, milestoneGasLimit } = await import("../src/milestone-gas");
  const observed = { createGift: 312_200, claim: 103_275, prove: 127_740, expire: 80_579, refundUnearned: 84_714, withdrawEarned: 119_689, withdrawEarnedWithIntent: 123_196, cancel: 120_078 } as const;
  for (const [name, max] of Object.entries(observed) as Array<[keyof typeof observed, number]>) {
    assert.ok(MILESTONE_GAS_CEILING[name] > max, `${name}: ${MILESTONE_GAS_CEILING[name]} must exceed ${max}`);
    assert.equal(milestoneGasLimit(name), BigInt(MILESTONE_GAS_CEILING[name]) + (BigInt(MILESTONE_GAS_CEILING[name]) * 750n + 9_999n) / 10_000n);
  }
});
