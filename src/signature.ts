import type { Hex } from "viem";

/**
 * Puts a signature in the one shape the contract's library accepts before it is relayed.
 *
 * OpenZeppelin's ECDSA refuses two things outright, and refuses them with a plain string rather than a typed
 * error: a recovery byte that is not 27 or 28, and an `s` in the upper half of the curve (EIP-2, against
 * malleability). Both reach a person as "this could not be recorded", which says nothing, because a string
 * revert carries no name to map to a sentence.
 *
 * Neither reshaping changes who signed. Flipping `s` to its low form and the recovery byte with it yields the
 * same signer, which is exactly why EIP-2 could require it. So this can only turn a signature the contract
 * would refuse into the same signature it accepts, and never one signature into another.
 */

const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_ORDER = CURVE_ORDER / 2n;

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureError";
  }
}

export function canonicalSignature(signature: string): Hex {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new SignatureError("A signature is 65 bytes");
  const body = signature.slice(2).toLowerCase();
  const r = body.slice(0, 64);
  let s = BigInt(`0x${body.slice(64, 128)}`);
  let v = Number.parseInt(body.slice(128), 16);

  // Some signers give the recovery bit as 0 or 1 rather than 27 or 28.
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) throw new SignatureError("That signature is not readable");
  if (s === 0n || s >= CURVE_ORDER) throw new SignatureError("That signature is not readable");

  // The high form of s is the same signature said the other way round; the contract only accepts the low one.
  if (s > HALF_ORDER) {
    s = CURVE_ORDER - s;
    v = v === 27 ? 28 : 27;
  }
  return `0x${r}${s.toString(16).padStart(64, "0")}${v.toString(16).padStart(2, "0")}` as Hex;
}
