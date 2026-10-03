import { getAddress, type Hex } from "viem";
import { consentAnchorAddress, giftEscrowV2Address, giftEscrowV3Address, milestoneGiftV2Address } from "./v2";

/**
 * Viky's own contracts on Monad mainnet, each read on chain on 29 Sep 2026 (owner: the project's Safe). Browser safe.
 *
 * Money moved to one of them by a plain transfer is not a gift and has no owner: none of them has a way to give it
 * back, so it is lost. The app never sends there (the audit, 29 Sep 2026). The way out's own address is also what the
 * browser signs a withdrawal for, rather than whatever address a server answer names (src/client/exit.ts).
 */

/** Holds the daily gifts made since 16 Sep 2026. */
export const GIFT_ESCROW = getAddress("0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233");
/** The earlier gift contract, which still runs the first gifts. */
export const EARLIER_GIFT_ESCROW = getAddress("0xE04CD59bB93765333200a9da01df83149D4C4d67");
/** Holds the milestone gifts. */
export const MILESTONE_GIFT = getAddress("0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e");
/** The way out: its token is AUSD and its nonce tag keccak256("viky.exit.v3"), both read on chain. */
export const EXIT_ROUTER = getAddress("0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223");

/**
 * The converter of card payments: the way out's contract again, its token USDC, deployed on 3 Oct 2026 and handed to
 * the Safe in its third transaction; its code is the first copy's with USDC in place of AUSD, read on chain that day.
 * The app takes its address from `NEXT_PUBLIC_USDC_ROUTER_ADDRESS` (src/usdc-router.ts); this is the one deployed.
 */
export const USDC_ROUTER = getAddress("0xf05449c8b868Ce1e6a0D7223e2ceCbbfD1498F9c");

export const VIKY_CONTRACTS: readonly Hex[] = [GIFT_ESCROW, EARLIER_GIFT_ESCROW, MILESTONE_GIFT, EXIT_ROUTER, USDC_ROUTER];

/**
 * The three contracts of the second version and the third daily contract, once their addresses are set (src/v2.ts),
 * and none before (the review of 2 Oct 2026, R-09). None of them has a way to give back money sent to it by a plain
 * transfer, the anchor no more than those that hold gifts.
 */
export function secondVersionContracts(): readonly Hex[] {
  return [giftEscrowV2Address(), milestoneGiftV2Address(), consentAnchorAddress(), giftEscrowV3Address()].filter((address): address is Hex => address !== null);
}

/** Whether an address is one of Viky's own contracts, where money sent by hand would be lost. */
export function isVikyContract(address: string): boolean {
  const lowered = address.toLowerCase();
  return [...VIKY_CONTRACTS, ...secondVersionContracts()].some((contract) => contract.toLowerCase() === lowered);
}
