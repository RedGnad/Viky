import { parseSignature, type Hex } from "viem";
import { AUSD_ADDRESS, MONAD_CHAIN_ID } from "./monad/chain";

/**
 * The funder's EIP-3009 authorization, signed by the passkey account and consumed by
 * `GiftEscrow.createGift`. The domain is the one measured on mainnet (DECISIONS.md D5): name
 * `Agora Dollar`, version `1`, chain 143, the AUSD proxy. `to` is the escrow, so the signature can
 * only land there, and `nonce` is the gift's funding nonce, so it also consents to the exact terms.
 */

export const AUSD_DOMAIN = {
  name: "Agora Dollar",
  version: "1",
  chainId: MONAD_CHAIN_ID,
  verifyingContract: AUSD_ADDRESS,
} as const;

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * The same thing for a plain transfer, which is how anyone moves their own AUSD without holding MON.
 *
 * This matters more than it looks. Monad reserves 10 MON per account, and an account below that can make no
 * contract call at all, ever (DECISIONS.md D53): moving an ERC-20 is a contract call, so a recipient whose
 * account holds only what we gave it for gas could never move their own money. With this they sign, and
 * Viky's relayer submits. Their account needs nothing.
 *
 * Unlike the funding authorization, `to` is whoever they chose, so this is checked against nothing but their
 * own signature, which is exactly what a transfer of their own money should require.
 */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** An authorization stays valid for one hour: long enough for a funder, short enough to be harmless if lost. */
export const AUTHORIZATION_VALIDITY_SECONDS = 60 * 60;

export type ReceiveAuthorizationMessage = {
  from: Hex;
  to: Hex;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export function receiveAuthorizationMessage(input: {
  funder: Hex;
  escrow: Hex;
  amount: bigint;
  nonce: Hex;
  nowSeconds?: number;
}): ReceiveAuthorizationMessage {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  return {
    from: input.funder,
    to: input.escrow,
    value: input.amount,
    validAfter: 0n,
    validBefore: BigInt(now + AUTHORIZATION_VALIDITY_SECONDS),
    nonce: input.nonce,
  };
}

/** The typed-data request the browser hands to the passkey account's `signTypedData`. */
export function receiveAuthorizationTypedData(message: ReceiveAuthorizationMessage) {
  return {
    domain: AUSD_DOMAIN,
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization" as const,
    message,
  };
}

export type ContractAuthorization = {
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  v: number;
  r: Hex;
  s: Hex;
};

/** Splits the 65-byte signature into the `(v, r, s)` tuple `createGift` takes. */
export function toContractAuthorization(message: ReceiveAuthorizationMessage, signature: Hex): ContractAuthorization {
  const { v, r, s, yParity } = parseSignature(signature);
  const recovery = v !== undefined ? Number(v) : yParity === undefined ? 27 : 27 + yParity;
  return { validAfter: message.validAfter, validBefore: message.validBefore, nonce: message.nonce, v: recovery, r, s };
}

export function transferAuthorizationMessage(input: { from: Hex; to: Hex; value: bigint; nonce: Hex; nowSeconds?: number }): ReceiveAuthorizationMessage {
  const now = BigInt(input.nowSeconds ?? Math.floor(Date.now() / 1_000));
  return {
    from: input.from,
    to: input.to,
    value: input.value,
    validAfter: 0n,
    validBefore: now + BigInt(AUTHORIZATION_VALIDITY_SECONDS),
    nonce: input.nonce,
  };
}

export function transferAuthorizationTypedData(message: ReceiveAuthorizationMessage) {
  return {
    domain: AUSD_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message,
  };
}
