import { getAddress, type Abi, type Hex } from "viem";
import { consentAnchorAbi } from "./consent-anchor-abi";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { giftEscrowV2Abi } from "./gift-escrow-v2-abi";
import { milestoneGiftAbi } from "./milestone-gift-abi";
import { milestoneGiftV2Abi } from "./milestone-gift-v2-abi";

/**
 * Which version of a gift contract an address is, and what it speaks (the audit of 1 Oct 2026). Browser safe.
 *
 * The second version of the two gift contracts is written and tested, and off: it exists for this code only once its
 * address is set, in one setting per contract that the server and the browser both read. Until then every function
 * here answers "the first version", no gift is made on the second, and nothing changes for a gift that exists.
 *
 * A gift is served by the contract its own record names (src/relayer.ts, `escrowOf`), so the first version's gifts are
 * read and settled on the first version for as long as one is open, whatever is set here. New gifts go where these
 * settings say.
 */

export type ContractVersion = 1 | 2;

function addressOf(value: string | undefined): Hex | null {
  const text = value?.trim();
  return text && /^0x[0-9a-fA-F]{40}$/.test(text) ? getAddress(text) : null;
}

/** The second version of the daily contract, or nothing while it is not set. The name is written out: a browser's build replaces it by its value. */
export function giftEscrowV2Address(): Hex | null {
  return addressOf(process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS);
}

/** The second version of the milestone contract, or nothing while it is not set. */
export function milestoneGiftV2Address(): Hex | null {
  return addressOf(process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS);
}

/** Where agreements are written down in public, or nothing while it is not set. */
export function consentAnchorAddress(): Hex | null {
  return addressOf(process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS);
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
}

/** The version of the daily contract at an address: the second only for the address that is set as the second. */
export function dailyVersionOf(contract: string | null | undefined): ContractVersion {
  return same(contract, giftEscrowV2Address()) ? 2 : 1;
}

export function milestoneVersionOf(contract: string | null | undefined): ContractVersion {
  return same(contract, milestoneGiftV2Address()) ? 2 : 1;
}

export function dailyAbiOf(contract: string | null | undefined): Abi {
  return (dailyVersionOf(contract) === 2 ? giftEscrowV2Abi : giftEscrowAbi) as unknown as Abi;
}

export function milestoneAbiOf(contract: string | null | undefined): Abi {
  return (milestoneVersionOf(contract) === 2 ? milestoneGiftV2Abi : milestoneGiftAbi) as unknown as Abi;
}

export const CONSENT_ANCHOR_ABI = consentAnchorAbi as unknown as Abi;

/** Every ABI a transaction's logs may have been written by, for reading a creation back without knowing its version. */
export const DAILY_ABIS: readonly Abi[] = [giftEscrowAbi as unknown as Abi, giftEscrowV2Abi as unknown as Abi];
export const MILESTONE_ABIS: readonly Abi[] = [milestoneGiftAbi as unknown as Abi, milestoneGiftV2Abi as unknown as Abi];
