// The TypeScript half of the pin between src/v2-protocol.ts and the second version's contracts. Every hex here is
// asserted identical in test/V2TypehashParity.t.sol against the contracts. If either formula drifts, one side fails.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hashStruct, recoverTypedDataAddress, verifyMessage, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHECK_IN_TYPEHASH, FUND_NONCE_TAG, WITHDRAW_TYPEHASH } from "../src/gift-terms";
import { claimTokenHash, newClaimToken } from "../src/gift-store";
import { MILESTONE_FUND_NONCE_TAG, MILESTONE_PROOF_TYPEHASH } from "../src/milestone-protocol";
import {
  CONSENT_KEY_TYPEHASH,
  CONSENT_KEY_TYPES,
  consentAnchorMessage,
  consentKeyTypedData,
  consentTextDigest,
  END_TYPEHASH,
  END_TYPES,
  endTypedData,
  FUND_NONCE_TAG_V2,
  fundingNonceV2,
  GIFT_V2_DOMAIN,
  giftLinkTypedData,
  hashGiftParamsV2,
  hashMilestoneParamsV2,
  LINK_SECRET,
  linkFingerprint,
  linkSecretFrom,
  MAX_OBSERVATION_AGE_SECONDS,
  MAX_PAUSE_SECONDS,
  MILESTONE_FUND_NONCE_TAG_V2,
  MILESTONE_V2_DOMAIN,
  milestoneFundingNonceV2,
  OPEN_TYPEHASH,
  OPEN_TYPES,
  openingAccount,
  openTypedData,
  SIGNER_DELAY_SECONDS,
  withdrawTypedDataV2,
} from "../src/v2-protocol";

const FUNDER = "0x00000000000000000000000000000000000A11cE" as const;
const RECIPIENT = "0x79C53151315FaD9163f75a65A8Bd4D04a10e1e45" as const;
const CONTRACT = "0x00000000000000000000000000000000000000c2" as const;
const SECRET = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const ONE: Hex = `0x${"0".repeat(63)}1`;
const ZERO: Hex = `0x${"0".repeat(64)}`;
const daily = readFileSync("contracts/GiftEscrowV2.sol", "utf8");
const milestone = readFileSync("contracts/MilestoneGiftV2.sol", "utf8");
const anchor = readFileSync("contracts/ConsentAnchor.sol", "utf8");

test("the typehashes and the tags match the Solidity pin, and the first version's never fund the second", () => {
  assert.equal(OPEN_TYPEHASH, "0xc04f410f844e05bb80e2244e4132269824ec9cef30df4ff39c994fff894ff348");
  assert.equal(END_TYPEHASH, "0xe350fd57abfb620d7e481dc2480c7d476343ce19cf7460bd586c7b0f6b563468");
  assert.equal(FUND_NONCE_TAG_V2, "0x49fb844f043b01c05dcd937faae3fbc842cc045c7ff721fc9b9aa42e1e7030e5");
  assert.equal(MILESTONE_FUND_NONCE_TAG_V2, "0xee77a665ab5d2ae1fca00b3d90f467d42246a1bd70af954c88254551761f6f64");
  assert.equal(CONSENT_KEY_TYPEHASH, "0x8e2674bed6524066ecb8ac2080be24b484f38b0933235c8f1a6fbd254d47eeaf");
  // The readings and the withdrawal keep the first version's types: the domain's version is what keeps them apart.
  assert.equal(CHECK_IN_TYPEHASH, "0x9d466a7ca50fa84a8a3809bebe71bfcb6d60214fb0f8f371d9920593436a90bd");
  assert.equal(WITHDRAW_TYPEHASH, "0x934fbda9a8be236a524d3f7d43c9cc2c829b9a8ab1c9e54726f96800fa14137e");
  assert.equal(MILESTONE_PROOF_TYPEHASH, "0x2e334597ad17c7a0a6d0115c0a1bd40455a3d23a5358a913c0613e9d33f0558f");
  assert.notEqual(FUND_NONCE_TAG_V2, FUND_NONCE_TAG);
  assert.notEqual(MILESTONE_FUND_NONCE_TAG_V2, MILESTONE_FUND_NONCE_TAG);
  assert.notEqual(FUND_NONCE_TAG_V2, MILESTONE_FUND_NONCE_TAG_V2);
  assert.deepEqual([GIFT_V2_DOMAIN.name, GIFT_V2_DOMAIN.version, MILESTONE_V2_DOMAIN.name, MILESTONE_V2_DOMAIN.version], ["Viky Gift", "2", "Viky Milestone", "2"]);
  assert.match(daily, /EIP712\("Viky Gift", "2"\)/);
  assert.match(milestone, /EIP712\("Viky Milestone", "2"\)/);
  assert.match(anchor, /EIP712\("Viky Consent", "1"\)/);
});

test("the terms' hashes and the funding nonces match the Solidity pin", () => {
  const openingKey: Hex = openingAccount(SECRET).address;
  // Compared as text: the assertion would otherwise narrow the address to a plain string for the lines below.
  assert.equal(String(openingKey), "0x519F812ccB8121840C592066052B9e196d9d03c2");
  const gift = { funder: FUNDER, refundTo: FUNDER, openingKey, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: ONE };
  assert.equal(hashGiftParamsV2(gift), "0x6305fe0ce52213b871ff22430d8bfa0c0eb5e6ae9d42f0f085b02b8c8d705504");
  assert.equal(fundingNonceV2(gift), "0x45e13353459322b8459e64e829d386754a233662e90bc237e83f57b70830c17d");
  const climb = { funder: FUNDER, refundTo: FUNDER, openingKey, goalType: 1, shape: 0, target: 1500n, maximumStart: 1300n, subject: ZERO, durationDays: 30, amount: 25_000_000n, salt: ONE };
  assert.equal(hashMilestoneParamsV2(climb), "0x74017d6c0fd6c44acb402e796b4a85a705d28f8a4959d7f7aea760abddc816c6");
  assert.equal(milestoneFundingNonceV2(climb), "0x1b6199c91b7cd2b9effdb8e147b527024732a55a9a713a367cc135e9dbfc09a9");
  // Another opening key is other terms: the signature that paid for one gift cannot pay for a gift another link opens.
  assert.notEqual(fundingNonceV2({ ...gift, openingKey: FUNDER }), fundingNonceV2(gift));
});

test("the structs a browser signs match the Solidity pin", () => {
  assert.equal(hashStruct({ data: { giftId: 7n, recipient: FUNDER, deadline: 1_800_000_600n }, primaryType: "Open", types: OPEN_TYPES }), "0xc85c263b170f997da2fd082a3451f57123b07ab088b84af1fc08c61c2d336fe0");
  assert.equal(
    hashStruct({ data: { giftId: 7n, keep: 2_000_000n, giveBack: 5_000_000n, nonce: 3n, deadline: 1_800_000_600n }, primaryType: "End", types: END_TYPES }),
    "0x8a6ff1bcda58ec2ddf303e89f8008a97b59a58237c136344b1924ff055e56a06",
  );
  assert.equal(hashStruct({ data: { account: FUNDER, key: `0x${"ab".repeat(32)}` }, primaryType: "ConsentKey", types: CONSENT_KEY_TYPES }), "0x939d1d5f290262fe9769a2a4153985279ccb2bf13f9336ba43f173a23ad9822d");
});

test("whoever holds the link makes the key that opens the gift, and what it signs names one account", async () => {
  const key = openingAccount(SECRET);
  const typed = openTypedData("daily", CONTRACT, { giftId: 7n, recipient: RECIPIENT, deadline: 1_800_000_600n });
  const signature = await key.signTypedData(typed);
  assert.equal(await recoverTypedDataAddress({ ...typed, signature }), key.address);
  // The same signature read as an opening for another account, another gift or the other contract is somebody else's.
  for (const other of [
    openTypedData("daily", CONTRACT, { giftId: 7n, recipient: FUNDER, deadline: 1_800_000_600n }),
    openTypedData("daily", CONTRACT, { giftId: 8n, recipient: RECIPIENT, deadline: 1_800_000_600n }),
    openTypedData("milestone", CONTRACT, { giftId: 7n, recipient: RECIPIENT, deadline: 1_800_000_600n }),
  ]) {
    assert.notEqual(await recoverTypedDataAddress({ ...other, signature }), key.address);
  }
  // Another link, another key; and nothing that is not a link's key is made into one.
  assert.notEqual(openingAccount("AbCdEfGhIjKlMnOpQrStUvWxYz012346").address, key.address);
  assert.throws(() => openingAccount("short"));
  assert.throws(() => openingAccount("with a space in it, and more"));
});

test("the fingerprint Viky keeps of a link is the one it has always kept, and opens nothing", () => {
  for (const secret of [SECRET, newClaimToken(), newClaimToken()]) assert.equal(linkFingerprint(secret), claimTokenHash(secret));
  assert.equal(linkFingerprint(SECRET), "5c554efc55854459e5940997af635d9dd51707672d428a8934a131cedeff5b30");
  // The key is made from the secret, never from its fingerprint.
  assert.throws(() => openingAccount(`${linkFingerprint(SECRET)}!`));
  assert.notEqual(openingAccount(linkFingerprint(SECRET)).address, openingAccount(SECRET).address);
});

test("a funder finds the link again: the same account and the same salt make the same secret, on any device", async () => {
  const funder = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const here = linkSecretFrom(await funder.signTypedData(giftLinkTypedData(ONE)));
  // Another device: the same passkey makes the same account, which signs the same salt.
  const there = linkSecretFrom(await privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80").signTypedData(giftLinkTypedData(ONE)));
  assert.equal(here, there);
  assert.match(here, LINK_SECRET);
  assert.equal(here.length, 32);
  // Another gift of theirs, and the same salt signed by anybody else, are other secrets.
  const twoSalt: Hex = `0x${"0".repeat(63)}2`;
  assert.notEqual(linkSecretFrom(await funder.signTypedData(giftLinkTypedData(twoSalt))), here);
  const stranger = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  assert.notEqual(linkSecretFrom(await stranger.signTypedData(giftLinkTypedData(ONE))), here);
  assert.equal(linkSecretFrom(`0x${"11".repeat(65)}`), "mD3rZHQwj5k1J4Y6aOBbZhWTSUHJ_oQq");
});

test("an ending and a withdrawal are signed under the second version's domain, by the recipient's own account", async () => {
  const recipient = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const end = endTypedData("daily", CONTRACT, { giftId: 7n, keep: 2_000_000n, giveBack: 5_000_000n, nonce: 0n, deadline: 1_800_000_600n });
  assert.equal(end.domain.version, "2");
  assert.equal(await recoverTypedDataAddress({ ...end, signature: await recipient.signTypedData(end) }), recipient.address);
  const withdraw = withdrawTypedDataV2("milestone", CONTRACT, { giftId: 1_000_007n, to: recipient.address, amount: 1n, nonce: 0n, deadline: 1_800_000_600n });
  assert.deepEqual([withdraw.domain.name, withdraw.domain.version], ["Viky Milestone", "2"]);
});

test("the constants a screen says are the contracts' own", () => {
  assert.equal(MAX_OBSERVATION_AGE_SECONDS, 30 * 60);
  assert.match(daily, /MAX_OBSERVATION_AGE = 30 minutes;/);
  assert.equal(MAX_PAUSE_SECONDS, 7 * 86_400);
  assert.match(daily, /MAX_PAUSE = 7 days;/);
  assert.match(milestone, /MAX_PAUSE = 7 days;/);
  assert.equal(SIGNER_DELAY_SECONDS, 24 * 3_600);
  assert.match(daily, /SIGNER_DELAY = 24 hours;/);
  assert.match(milestone, /SIGNER_DELAY = 24 hours;/);
});

test("the public record of an agreement: the account binds its key, and the anchored message is rebuilt from the chain alone", async () => {
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const key: Hex = `0x${"ab".repeat(32)}`;
  const binding = consentKeyTypedData(CONTRACT, account.address, key);
  assert.equal(await recoverTypedDataAddress({ ...binding, signature: await account.signTypedData(binding) }), account.address);
  const digest = consentTextDigest("Viky agreement, version 1\nAccount: 0xabc\nGift: 7");
  assert.match(digest, /^0x[0-9a-f]{64}$/);
  assert.equal(
    consentAnchorMessage({ anchor: CONTRACT, account: account.address, giftId: "7", kind: "yes", sequence: 0, digest }),
    ["Viky consent anchor, version 1", "Chain: 143", `Contract: ${CONTRACT}`, `Account: ${account.address.toLowerCase()}`, "Gift: 7", "Kind: yes", "Sequence: 0", `Text: ${digest}`].join("\n"),
  );
  // A stop, or the next place, is another message: nothing signed for one is valid for the other.
  const yes = consentAnchorMessage({ anchor: CONTRACT, account: account.address, giftId: "7", kind: "yes", sequence: 0, digest });
  assert.notEqual(consentAnchorMessage({ anchor: CONTRACT, account: account.address, giftId: "7", kind: "stop", sequence: 0, digest }), yes);
  assert.notEqual(consentAnchorMessage({ anchor: CONTRACT, account: account.address, giftId: "7", kind: "yes", sequence: 2, digest }), yes);
  assert.equal(await verifyMessage({ address: account.address, message: yes, signature: await account.signMessage({ message: yes }) }), true);
});
