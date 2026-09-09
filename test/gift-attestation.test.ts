// The TypeScript half of the EIP-712 parity pin. Every hex here is asserted identical in
// test/GiftTypehashParity.t.sol against the contract. If either formula drifts, one side fails.

process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, recoverTypedDataAddress, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHECK_IN_TYPEHASH,
  CHECK_IN_TYPES,
  CLAIM_TYPEHASH,
  CLAIM_TYPES,
  DUOLINGO_GOAL_PROVIDER_ID,
  evidenceSignerAddress,
  GIFT_DOMAIN,
  identityPseudonym,
  serialiseMessage,
  signCheckIn,
  signClaim,
  WITHDRAW_TYPEHASH,
} from "../src/gift-attestation";

const CONTRACT = "0x00000000000000000000000000000000000000E5" as const;
const RECIPIENT = "0x79C53151315FaD9163f75a65A8Bd4D04a10e1e45" as const;

// The exact hex the contract must produce. Pinned here first; test/GiftTypehashParity.t.sol asserts the same.
const PIN_CHECK_IN_TH = keccak256(
  stringToHex(
    "CheckIn(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)",
  ),
);
const PIN_CLAIM_TH = keccak256(stringToHex("Claim(uint256 giftId,address recipient,bytes32 contactHash,uint64 issuedAt,uint64 expiresAt)"));
const PIN_WITHDRAW_TH = keccak256(stringToHex("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)"));

test("the typehashes are the keccak of the exact type strings", () => {
  assert.equal(CHECK_IN_TYPEHASH, PIN_CHECK_IN_TH);
  assert.equal(CLAIM_TYPEHASH, PIN_CLAIM_TH);
  assert.equal(WITHDRAW_TYPEHASH, PIN_WITHDRAW_TH);
  assert.equal(DUOLINGO_GOAL_PROVIDER_ID, keccak256(stringToHex("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8")));
  assert.deepEqual(GIFT_DOMAIN, { name: "Viky Gift", version: "1", chainId: 143 });
});

test("a signed check-in recovers to the evidence signer, and a tampered value does not", async () => {
  const message = {
    giftId: 1n,
    recipient: RECIPIENT,
    identityHash: identityPseudonym("duolingo", "477033640"),
    providerId: DUOLINGO_GOAL_PROVIDER_ID,
    metricValue: 8_207n,
    observedAt: 1_800_000_100n,
    nullifier: keccak256(stringToHex("check-in-nonce")),
    issuedAt: 1_800_000_100n,
    expiresAt: 1_800_000_700n,
  } as const;
  const signature = await signCheckIn(message, CONTRACT);
  const good = await recoverTypedDataAddress({
    domain: { ...GIFT_DOMAIN, verifyingContract: CONTRACT },
    types: CHECK_IN_TYPES,
    primaryType: "CheckIn",
    message,
    signature,
  });
  assert.equal(good, evidenceSignerAddress());
  const tampered = await recoverTypedDataAddress({
    domain: { ...GIFT_DOMAIN, verifyingContract: CONTRACT },
    types: CHECK_IN_TYPES,
    primaryType: "CheckIn",
    message: { ...message, metricValue: 9_000n },
    signature,
  });
  assert.notEqual(tampered, evidenceSignerAddress());
  const wrongChain = await recoverTypedDataAddress({
    domain: { ...GIFT_DOMAIN, chainId: 1, verifyingContract: CONTRACT },
    types: CHECK_IN_TYPES,
    primaryType: "CheckIn",
    message,
    signature,
  });
  assert.notEqual(wrongChain, evidenceSignerAddress());
});

test("a signed claim recovers to the evidence signer", async () => {
  const message = {
    giftId: 7n,
    recipient: RECIPIENT,
    contactHash: keccak256(stringToHex("ama@example.com")),
    issuedAt: 1_800_000_000n,
    expiresAt: 1_800_000_600n,
  } as const;
  const signature = await signClaim(message, CONTRACT);
  const recovered = await recoverTypedDataAddress({
    domain: { ...GIFT_DOMAIN, verifyingContract: CONTRACT },
    types: CLAIM_TYPES,
    primaryType: "Claim",
    message,
    signature,
  });
  assert.equal(recovered, evidenceSignerAddress());
  assert.deepEqual(serialiseMessage(message), {
    giftId: "7",
    recipient: RECIPIENT,
    contactHash: message.contactHash,
    issuedAt: "1800000000",
    expiresAt: "1800000600",
  });
});

test("the identity is an HMAC pseudonym, not a bare hash of an enumerable id", () => {
  const id = identityPseudonym("duolingo", "477033640");
  assert.match(id, /^0x[0-9a-f]{64}$/);
  assert.equal(id, identityPseudonym("duolingo", "477033640"));
  assert.notEqual(id, identityPseudonym("strava", "477033640"));
  assert.notEqual(id, keccak256(stringToHex("viky:identity:v1:duolingo:477033640")));
  assert.notEqual(id, keccak256(stringToHex("477033640")));
  assert.equal(evidenceSignerAddress(), privateKeyToAccount(process.env.EVIDENCE_SIGNER_PRIVATE_KEY as `0x${string}`).address);
});
