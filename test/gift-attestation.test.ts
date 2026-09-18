// The TypeScript half of the EIP-712 parity pin. Every hex here is asserted identical in
// test/GiftTypehashParity.t.sol against the contract. If either formula drifts, one side fails.

process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { giftSalt } from "../src/gift-terms";
import { keccak256, recoverTypedDataAddress, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { contactHash } from "../src/contact-hash";
import {
  CHECK_IN_TYPEHASH,
  CHECK_IN_TYPES,
  CLAIM_TYPEHASH,
  CLAIM_TYPES,
  DUOLINGO_GOAL_PROVIDER_ID,
  DUOLINGO_SESSION_PROVIDER_ID,
  evidenceSignerAddress,
  FUND_NONCE_TAG,
  fundingNonce,
  GIFT_DOMAIN,
  hashGiftParams,
  identityPseudonym,
  serialiseMessage,
  signCheckIn,
  signClaim,
  WITHDRAW_TYPEHASH,
} from "../src/gift-attestation";

const CONTRACT = "0x00000000000000000000000000000000000000E5" as const;
const RECIPIENT = "0x79C53151315FaD9163f75a65A8Bd4D04a10e1e45" as const;

// The exact hex the contract produces (see test/GiftTypehashParity.t.sol, which pins the same values).
const PIN_CHECK_IN_TH = "0x9d466a7ca50fa84a8a3809bebe71bfcb6d60214fb0f8f371d9920593436a90bd";
const PIN_CLAIM_TH = "0x2cc2ef1342b642e75667cc06ec45e6fcd050584c714b83316da1360cdfa9a44f";
const PIN_WITHDRAW_TH = "0x934fbda9a8be236a524d3f7d43c9cc2c829b9a8ab1c9e54726f96800fa14137e";
const PIN_FUND_NONCE_TAG = "0x778db84091eb415c574d04413372a2e9ce3882b8dbf9b23ad62e7ceef3f52408";
const PIN_CONTACT = "0x051ba1efa40687e649c5a3403f00a0031510d61c8355521acc2eac285f4a7a7c";
const PIN_PARAMS_HASH = "0x32fa16f869d1afa32edc136fee91a503f143f3b6b1122b9774c47d4803d85bf2";
const PIN_FUNDING_NONCE = "0x1f43cae02ca8df344a572307cad4a8c47cb1ec23a3c234d96eacf201e86ec5ee";

test("the typehashes and the funding nonce match the Solidity pin", () => {
  assert.equal(CHECK_IN_TYPEHASH, PIN_CHECK_IN_TH);
  assert.equal(CLAIM_TYPEHASH, PIN_CLAIM_TH);
  assert.equal(WITHDRAW_TYPEHASH, PIN_WITHDRAW_TH);
  assert.equal(FUND_NONCE_TAG, PIN_FUND_NONCE_TAG);
  // The registry id for Duolingo is the public mode since D27; the session-proof id stays pinned for the verifier-app path.
  assert.equal(DUOLINGO_SESSION_PROVIDER_ID, keccak256(stringToHex("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8")));
  assert.equal(DUOLINGO_GOAL_PROVIDER_ID, keccak256(stringToHex("viky:provider:duolingo-public-zkfetch:v1")));
  assert.equal(DUOLINGO_GOAL_PROVIDER_ID, "0x95160f9e5c0e1752b7128f3aeffd36d5906b2cedb43432391d1dc6c7ec958e34");
  assert.deepEqual(GIFT_DOMAIN, { name: "Viky Gift", version: "1", chainId: 143 });

  assert.equal(contactHash("ama@example.com"), PIN_CONTACT);
  const params = {
    funder: "0x00000000000000000000000000000000000A11cE",
    refundTo: "0x00000000000000000000000000000000000A11cE",
    recipientContactHash: PIN_CONTACT,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 5_000_000n,
    salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
  } as const;
  assert.equal(hashGiftParams(params), PIN_PARAMS_HASH);
  assert.equal(fundingNonce(params), PIN_FUNDING_NONCE);
  assert.notEqual(fundingNonce({ ...params, amount: 5_000_001n }), PIN_FUNDING_NONCE, "the nonce binds the terms");
  assert.notEqual(fundingNonce({ ...params, salt: `0x${"02".padStart(64, "0")}` }), PIN_FUNDING_NONCE, "the salt separates twins");
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

/**
 * The salt is what makes one signature commit to the account a gift is read on, and to the course a day is counted in
 * (D102). It used to be random, so between that signature and the first reading only Viky's own record said which
 * account was meant. The contract pins the identity at the first reading; this closes the window before it.
 */
test("the salt says the account and the course, and stays unique per gift", () => {
  const seed = `0x${"0a".repeat(32)}` as const;
  const ama = giftSalt({ account: "ama_learns", course: "DUOLINGO_ES_EN", seed });

  // The same three things always give the same salt, which is what lets the server rebuild it or refuse.
  assert.equal(giftSalt({ account: "ama_learns", course: "DUOLINGO_ES_EN", seed }), ama);
  // The account as the source spells it, as the person typed it, with a stray space: one account, one salt.
  assert.equal(giftSalt({ account: "Ama_Learns", course: "DUOLINGO_ES_EN", seed }), ama);
  assert.equal(giftSalt({ account: " ama_learns ", course: "DUOLINGO_ES_EN", seed }), ama);

  // Anything else is another salt, so a signature for one gift cannot be offered for another.
  assert.notEqual(giftSalt({ account: "someone_else", course: "DUOLINGO_ES_EN", seed }), ama);
  assert.notEqual(giftSalt({ account: "ama_learns", course: "DUOLINGO_IT_EN", seed }), ama);
  assert.notEqual(giftSalt({ account: "ama_learns", course: undefined, seed }), ama);
  assert.notEqual(giftSalt({ account: "ama_learns", course: "DUOLINGO_ES_EN", seed: `0x${"0b".repeat(32)}` }), ama);

  // The job it already had (D19): two gifts with the same terms still get distinct salts, through the seed.
  assert.notEqual(giftSalt({ account: "ama_learns", seed: `0x${"01".repeat(32)}` }), giftSalt({ account: "ama_learns", seed: `0x${"02".repeat(32)}` }));

  // A gift whose account nobody named yet is a salt of its own, and still a valid one.
  assert.match(giftSalt({ seed }), /^0x[0-9a-f]{64}$/);

  // The account and the course cannot be run together into one another: "ab" + "c" is not "a" + "bc".
  assert.notEqual(giftSalt({ account: "ab", course: "c", seed }), giftSalt({ account: "a", course: "bc", seed }));
});
