import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
// @scure/bip39 2.x exports the wordlists with their extension only.
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** BIP-44 path of the Viky account, the same on web and on any native wrapper. */
export const EVM_DERIVATION_PATH = "m/44'/60'/0'/0";

/**
 * Derives the account's secp256k1 private key from the 32-byte passkey PRF output, exactly as the
 * Mera guide does: the bytes become a 24-word mnemonic, the mnemonic a BIP-39 seed, the seed a
 * BIP-44 key. The account is therefore portable: the same words imported elsewhere give the same
 * address.
 *
 * The caller owns the returned bytes and zeroes them once a signing session holds a copy.
 */
export function deriveEvmPrivateKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  if (!Number.isInteger(index) || index < 0) throw new Error("Account index must be a non-negative integer");
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(`${EVM_DERIVATION_PATH}/${index}`);
  seed.fill(0);
  if (node.privateKey === null) throw new Error("Derivation produced no key");
  const privateKey = new Uint8Array(node.privateKey);
  node.wipePrivateData();
  return privateKey;
}
