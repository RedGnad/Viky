import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";

/**
 * The browser-safe half of the way out: what the person signs when they turn what a gift earned into the coin
 * a payout service takes. The nonce of the AUSD authorization IS the hash of these terms, exactly as funding a
 * gift works (D12), so one signature is both the payment and the consent: how much is taken, which coin must
 * come back, the least of it, which exchange, and the exact bytes that will be said to it. A relayer that
 * changes any of them produces a nonce the token will not accept.
 *
 * There is no destination in here (D76). The router hands everything back to the person who signed, and they
 * send the payout service its coin themselves, because a transfer made by a contract is one no deposit
 * detector is known to read.
 *
 * The coin itself is in here (D77), because the two payout services cover different countries and take
 * different coins: one sells USDC and serves the euro area, the other sells the chain's own coin and serves
 * places the first refuses. Fixing it at deployment would have closed one corridor for good.
 *
 * The contract half is contracts/ExitRouter.sol. test/ExitTermsParity.t.sol pins the same hex on both sides,
 * so a drift fails in CI rather than on mainnet.
 */

export const EXIT_NONCE_TAG = keccak256(stringToHex("viky.exit.v3"));

/** The chain's own coin, as `tokenOut` names it. */
export const NATIVE_OUT = "0x0000000000000000000000000000000000000000" as const;

export type ExitTerms = {
  /** Whose money, and who receives the proceeds: the same account. The token checks the authorization against it. */
  payer: Hex;
  amount: bigint;
  /** The coin that must come back, zero meaning the chain's own. */
  tokenOut: Hex;
  /** The least that may come back, counted in that coin. A floor, not an order. */
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
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint256, address, bytes32, uint64, bytes32"), [
      t.payer,
      t.amount,
      t.tokenOut,
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
