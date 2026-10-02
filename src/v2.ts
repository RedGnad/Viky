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

/** The three settings of the second version: they are set together, or not at all. */
export const SECOND_VERSION_SETTINGS = ["NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS", "NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS", "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS"] as const;

/**
 * What is wrong with the three settings, or nothing (the review of 2 Oct 2026, R-08). Each is read on its own, so one
 * left out was a silence, not an error: with the anchor's address forgotten, gifts were made on the second version and
 * no agreement was ever written down in public; with a gift contract's forgotten, its gifts were read with the first
 * version's words and every reading was refused. So: all three, each an address, or none.
 */
export function secondVersionProblem(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const given = SECOND_VERSION_SETTINGS.map((name) => ({ name, value: env[name]?.trim() ?? "" }));
  const set = given.filter((one) => one.value !== "");
  if (set.length === 0) return null;
  const malformed = set.filter((one) => !/^0x[0-9a-fA-F]{40}$/.test(one.value));
  if (malformed.length > 0) return `${malformed.map((one) => one.name).join(", ")} ${malformed.length === 1 ? "is" : "are"} set and ${malformed.length === 1 ? "is" : "are"} not an address`;
  const missing = given.filter((one) => one.value === "");
  if (missing.length > 0) return `${set.map((one) => one.name).join(", ")} ${set.length === 1 ? "is" : "are"} set and ${missing.map((one) => one.name).join(", ")} ${missing.length === 1 ? "is" : "are"} not: the three are set together, or none is`;
  if (new Set(set.map((one) => one.value.toLowerCase())).size !== set.length) return "two of the three settings of the second version name the same address";
  return null;
}

export class SecondVersionHalfSet extends Error {
  constructor(problem: string) {
    super(`Refusing to start: ${problem}. A second version that is half set serves its gifts wrongly without saying so.`);
    this.name = "SecondVersionHalfSet";
  }
}

/** Refuses a half-set second version, by name. Asked when the app is built and when a server starts. */
export function assertSecondVersionWhole(env: Readonly<Record<string, string | undefined>> = process.env): void {
  const problem = secondVersionProblem(env);
  if (problem) throw new SecondVersionHalfSet(problem);
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
