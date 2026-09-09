import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSecp256k1SigningSession, isMeraError } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deriveEvmPrivateKey, EVM_DERIVATION_PATH } from "../src/account/derive";

// A fixed 32-byte PRF output stands in for what the passkey returns. The derivation must be a pure
// function of it, follow the Mera guide's mnemonic path, and agree with viem on the address.
const PRF_OUTPUT = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

describe("deriveEvmPrivateKey", () => {
  it("is deterministic and yields a valid secp256k1 key", () => {
    const first = deriveEvmPrivateKey(PRF_OUTPUT);
    const second = deriveEvmPrivateKey(PRF_OUTPUT);
    assert.equal(first.length, 32);
    assert.deepEqual(first, second);
    assert.doesNotThrow(() => privateKeyToAccount(toHex(first)));
  });

  it("follows the mnemonic path of the Mera guide", () => {
    const mnemonic = entropyToMnemonic(PRF_OUTPUT, wordlist);
    assert.equal(mnemonic.split(" ").length, 24);
    const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(`${EVM_DERIVATION_PATH}/0`);
    assert.ok(node.privateKey);
    assert.deepEqual(deriveEvmPrivateKey(PRF_OUTPUT), new Uint8Array(node.privateKey));
  });

  it("gives the same address through Mera's session and through viem", async () => {
    const privateKey = deriveEvmPrivateKey(PRF_OUTPUT);
    const expected = privateKeyToAccount(toHex(privateKey)).address;
    const session = createSecp256k1SigningSession({ privateKey });
    const account = toViemAccount(session);
    assert.equal(account.address, expected);
    const signature = await account.signMessage({ message: "viky" });
    assert.match(signature, /^0x[0-9a-f]{130}$/);
    session.end();
  });

  it("changes the account with the index", () => {
    assert.notDeepEqual(deriveEvmPrivateKey(PRF_OUTPUT, 0), deriveEvmPrivateKey(PRF_OUTPUT, 1));
  });

  it("refuses a PRF output that is not 32 bytes", () => {
    assert.throws(() => deriveEvmPrivateKey(new Uint8Array(31)), /32 bytes/);
  });

  it("rejects signing after the session ended", async () => {
    const session = createSecp256k1SigningSession({ privateKey: deriveEvmPrivateKey(PRF_OUTPUT) });
    const account = toViemAccount(session);
    session.end();
    await assert.rejects(
      () => account.signMessage({ message: "after end" }),
      (error: unknown) => isMeraError(error) && error.code === "SESSION_ENDED",
    );
  });
});
