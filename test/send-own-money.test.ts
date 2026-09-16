import assert from "node:assert/strict";
import test from "node:test";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { transferAuthorizationMessage, transferAuthorizationTypedData, AUSD_DOMAIN, domainFor } from "../src/ausd-authorization";
import { AUSD, MON, USDC } from "../src/coins";

/**
 * Moving your own money with a signature, because on Monad an account below the 10 MON reserve cannot make a
 * contract call at all (D53). What matters is that the signature says everything: who, to whom, how much,
 * and until when, so a relayer that submits it can change none of those.
 */
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const to = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761" as const;

test("the signature names the destination, the amount and a deadline", async () => {
  const message = transferAuthorizationMessage({ from: account.address, to, value: 2_857_142n, nonce: `0x${"ab".repeat(32)}`, nowSeconds: 1_800_000_000 });
  assert.equal(message.validAfter, 0n);
  assert.equal(message.validBefore, 1_800_003_600n, "an hour, as for a funder");

  const typedData = transferAuthorizationTypedData(message);
  assert.deepEqual(typedData.domain, AUSD_DOMAIN, "the token's own domain, measured on mainnet");
  assert.equal(typedData.primaryType, "TransferWithAuthorization");

  const signature = await account.signTypedData(typedData as never);
  const recovered = await recoverTypedDataAddress({ ...typedData, signature } as never);
  assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
});

/**
 * Since the way out exists, an account can hold a second stablecoin as well as what a gift holds (D77), and each
 * token has its own EIP-3009 domain. This is the highest-consequence thing in that change and the quietest: a
 * signature made under the wrong name or version is not wrong by a little, it is simply refused by the token, so
 * nobody can be paid and nothing says why. Both domains were read on chain on 16 Sep 2026.
 */
test("each coin is signed under its own domain, read from the token itself", () => {
  assert.deepEqual(transferAuthorizationTypedData({} as never).domain, AUSD_DOMAIN, "what a gift holds, by default");
  assert.deepEqual(domainFor(AUSD), AUSD_DOMAIN);

  const usdc = domainFor(USDC);
  assert.equal(usdc.name, "USDC");
  assert.equal(usdc.version, "2", "version 2, not 1: read on chain, never assumed from the other token");
  assert.equal(usdc.verifyingContract, USDC.address);
  assert.equal(usdc.chainId, AUSD_DOMAIN.chainId);
});

test("a signature for one coin is worth nothing for the other", async () => {
  const message = transferAuthorizationMessage({ from: account.address, to, value: 1_000_000n, nonce: `0x${"11".repeat(32)}`, nowSeconds: 1_800_000_000 });
  const signature = await account.signTypedData(transferAuthorizationTypedData(message, AUSD) as never);
  const recovered = await recoverTypedDataAddress({ ...transferAuthorizationTypedData(message, USDC), signature } as never);
  assert.notEqual(recovered.toLowerCase(), account.address.toLowerCase(), "the same bytes must not move the other coin");
});

/**
 * The network's own coin has no domain at all, because an authorization is a feature of a token contract and it is
 * not one. Nobody can move it on somebody else's behalf, so this must refuse rather than produce a signature that
 * could never be used.
 */
test("the network's own coin cannot be signed for at all", () => {
  assert.equal(MON.domain, undefined);
  assert.throws(() => domainFor(MON), /cannot be moved by a signature/);
});

test("changing anything the person signed breaks the signature", async () => {
  const message = transferAuthorizationMessage({ from: account.address, to, value: 1_000_000n, nonce: `0x${"cd".repeat(32)}`, nowSeconds: 1_800_000_000 });
  const signature = await account.signTypedData(transferAuthorizationTypedData(message) as never);

  for (const tampered of [
    { ...message, to: account.address },
    { ...message, value: message.value + 1n },
    { ...message, validBefore: message.validBefore + 1n },
    { ...message, nonce: `0x${"ef".repeat(32)}` as const },
  ]) {
    const recovered = await recoverTypedDataAddress({ ...transferAuthorizationTypedData(tampered), signature } as never);
    assert.notEqual(recovered.toLowerCase(), account.address.toLowerCase(), "a changed field must not still verify");
  }
});
