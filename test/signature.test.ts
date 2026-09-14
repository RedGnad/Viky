import assert from "node:assert/strict";
import test from "node:test";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalSignature, SignatureError } from "../src/signature";

const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const typedData = {
  domain: { name: "Viky Gift", version: "1", chainId: 143, verifyingContract: "0xE04CD59bB93765333200a9da01df83149D4C4d67" },
  types: {
    Withdraw: [
      { name: "giftId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
  },
  primaryType: "Withdraw",
  message: { giftId: 1n, to: account.address, amount: 2_857_142n, nonce: 0n, deadline: 99_999_999_999n },
} as const;

function withHighS(signature: string): string {
  const body = signature.slice(2);
  const s = CURVE_ORDER - BigInt(`0x${body.slice(64, 128)}`);
  const v = Number.parseInt(body.slice(128), 16) === 27 ? 28 : 27;
  return `0x${body.slice(0, 64)}${s.toString(16).padStart(64, "0")}${v.toString(16).padStart(2, "0")}`;
}

test("a signature the contract would refuse becomes one it accepts, signed by the same person", async () => {
  const signed = await account.signTypedData(typedData);
  // Already canonical: untouched.
  assert.equal(canonicalSignature(signed), signed.toLowerCase());

  // The two shapes the contract's library refuses with a plain string, which reaches a person as nothing.
  const lowRecoveryByte = `${signed.slice(0, -2)}0${Number.parseInt(signed.slice(-2), 16) - 27}`;
  const upperHalfS = withHighS(signed);

  for (const refused of [lowRecoveryByte, upperHalfS]) {
    const fixed = canonicalSignature(refused);
    assert.equal(fixed, signed.toLowerCase(), "the same signature, in the shape the contract accepts");
    // And it still belongs to the same person, which is the whole point of reshaping rather than rejecting.
    assert.equal(
      (await recoverTypedDataAddress({ ...typedData, signature: fixed })).toLowerCase(),
      account.address.toLowerCase(),
    );
  }
});

test("anything that is not a signature is refused, never guessed at", () => {
  const signed = "0x" + "11".repeat(64) + "1b";
  for (const bad of ["", "0x", "0x1234", `${signed}ff`, signed.slice(0, -2) + "05", `0x${"00".repeat(65)}`]) {
    assert.throws(() => canonicalSignature(bad), SignatureError, JSON.stringify(bad.slice(0, 20)));
  }
});
