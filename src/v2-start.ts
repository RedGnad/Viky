import { getAddress, recoverTypedDataAddress, type Hex } from "viem";
import { startTypedData, type StartMessage, type V2Kind } from "./v2-protocol";

/**
 * The first reading of a gift of the second version (the review of 2 Oct 2026, R-15). Browser safe: no key of Viky's.
 *
 * That reading binds an identity and a starting value for good, so the contract takes it only with the signature of
 * the account the gift is for beside the evidence signer's. With the evidence key alone, somebody could otherwise bind
 * an identity nobody holds to a gift just opened, and no real reading would ever count. The signature names the reading
 * to the unit (`startTypedData`): whoever sees it on its way can send that reading and no other.
 *
 * Every reading after the first is taken in the morning with nobody there to sign, and carries the evidence signer's
 * signature alone, as before.
 */

/** A first reading that was verified and attested, and is not sent: the recipient's account has not signed it yet. */
export class StartNotSigned extends Error {
  constructor(
    readonly kind: V2Kind,
    readonly contract: Hex,
    readonly start: StartMessage,
  ) {
    super("This first reading waits for the signature of the account the gift is for");
    this.name = "StartNotSigned";
  }
}

/** What the contract reads where a reading carries no signature of the recipient: every reading after the first. */
export const NO_START_SIGNATURE: Hex = "0x";

/** Whether `signature` is the recipient's own over exactly this first reading, as the contract will check it again. */
export async function isStartSignedBy(input: { kind: V2Kind; contract: Hex; start: StartMessage; recipient: string; signature: Hex }): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.signature)) return false;
  const signer = await recoverTypedDataAddress({ ...startTypedData(input.kind, input.contract, input.start), signature: input.signature }).catch(() => null);
  return signer !== null && signer === getAddress(input.recipient);
}
