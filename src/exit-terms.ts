import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";

/**
 * The browser-safe half of the way out: what the person signs when they turn what a gift earned into money
 * a payout service will pay them. The nonce of the AUSD authorization IS the hash of these terms, exactly as
 * funding a gift works (D12), so one signature is both the payment and the consent: where the money goes,
 * the least that may come back, which exchange, and the exact bytes that will be said to it. A relayer that
 * changes any of them produces a nonce the token will not accept.
 *
 * The contract half is contracts/ExitRouter.sol. test/ExitTermsParity.t.sol pins the same hex on both sides,
 * so a drift fails in CI rather than on mainnet.
 */

export const EXIT_NONCE_TAG = keccak256(stringToHex("viky.exit.v1"));

export type ExitTerms = {
  /** Whose money. The token checks the authorization against this. */
  payer: Hex;
  /** Where the proceeds go. Theirs to choose, and nothing downstream can change it. */
  payoutTo: Hex;
  amount: bigint;
  /** The least that may come back, in the coin the payout service is owed (18 decimals). */
  minOut: bigint;
  exchange: Hex;
  /** keccak256 of the exact calldata the exchange will be sent. */
  callHash: Hex;
  deadline: bigint;
  salt: Hex;
};

/** `ExitRouter.hashTerms`, byte for byte. */
export function hashExitTerms(t: ExitTerms): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, uint256, uint256, address, bytes32, uint64, bytes32"), [
      t.payer,
      t.payoutTo,
      t.amount,
      t.minOut,
      t.exchange,
      t.callHash,
      t.deadline,
      t.salt,
    ]),
  );
}

/** `ExitRouter.exitNonce`, the nonce the person signs in `ReceiveWithAuthorization`. */
export function exitNonce(t: ExitTerms): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [EXIT_NONCE_TAG, hashExitTerms(t)]));
}
