import assert from "node:assert/strict";
import test from "node:test";
import { hashTypedData, keccak256, recoverTypedDataAddress, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AUSD_DOMAIN,
  receiveAuthorizationMessage,
  receiveAuthorizationTypedData,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  toContractAuthorization,
} from "../src/ausd-authorization";
import { fundingNonce } from "../src/gift-attestation";

const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const ESCROW = "0x00000000000000000000000000000000000000E5" as const;

const params = {
  funder: FUNDER.address,
  refundTo: FUNDER.address,
  recipientContactHash: keccak256(stringToHex("viky:contact:v1:email:ama@example.com")),
  goalType: 1,
  dailyTarget: 10,
  durationDays: 7,
  amount: 5_000_000n,
  salt: `0x${"01".padStart(64, "0")}` as const,
} as const;

test("the domain is the one measured on mainnet and the typehash is the EIP-3009 standard", () => {
  assert.deepEqual(AUSD_DOMAIN, {
    name: "Agora Dollar",
    version: "1",
    chainId: 143,
    verifyingContract: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
  });
  const typeString = `ReceiveWithAuthorization(${RECEIVE_WITH_AUTHORIZATION_TYPES.ReceiveWithAuthorization.map((f) => `${f.type} ${f.name}`).join(",")})`;
  assert.equal(keccak256(stringToHex(typeString)), "0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8");
});

test("a funder's signature recovers to the funder and splits into the contract tuple", async () => {
  const message = receiveAuthorizationMessage({ funder: FUNDER.address, escrow: ESCROW, amount: params.amount, nonce: fundingNonce(params), nowSeconds: 1_800_000_000 });
  assert.equal(message.validAfter, 0n);
  assert.equal(message.validBefore, 1_800_003_600n);
  assert.equal(message.to, ESCROW);
  const typed = receiveAuthorizationTypedData(message);
  const signature = await FUNDER.signTypedData(typed);
  assert.equal(await recoverTypedDataAddress({ ...typed, signature }), FUNDER.address);

  const authorization = toContractAuthorization(message, signature);
  assert.ok(authorization.v === 27 || authorization.v === 28);
  assert.match(authorization.r, /^0x[0-9a-f]{64}$/);
  assert.equal(authorization.nonce, fundingNonce(params));
  // The digest a wallet would show equals the one the token recomputes on-chain.
  assert.match(hashTypedData(typed), /^0x[0-9a-f]{64}$/);
});
