import { getAddress, type Abi, type Hex } from "viem";
import { consentAnchorAbi } from "./consent-anchor-abi";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { giftEscrowV2Abi } from "./gift-escrow-v2-abi";
import { giftEscrowV3Abi } from "./gift-escrow-v3-abi";
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
 *
 * The third version is of the daily contract alone (`contracts/GiftEscrowV3.sol`, 3 Oct 2026): the second version's
 * contract with one rule changed, a day is paid by a reading taken that same day. It is off in the same way, until its
 * own address is set, a fourth setting beside the three. The milestone contract and the anchor have no third version.
 */

export type ContractVersion = 1 | 2 | 3;

function addressOf(value: string | undefined): Hex | null {
  const text = value?.trim();
  return text && /^0x[0-9a-fA-F]{40}$/.test(text) ? getAddress(text) : null;
}

/** The second version of the daily contract, or nothing while it is not set. The name is written out: a browser's build replaces it by its value. */
export function giftEscrowV2Address(): Hex | null {
  return addressOf(process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS);
}

/** The third version of the daily contract, or nothing while it is not set. Written out, as above. */
export function giftEscrowV3Address(): Hex | null {
  return addressOf(process.env.NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS);
}

/**
 * The daily contract new gifts are made on, among those a gift's link opens: the third version once it is set, the
 * second before it, nothing while neither is. Gifts already made stay on the contract that holds them.
 */
export function newDailyGiftsContract(): Hex | null {
  return giftEscrowV3Address() ?? giftEscrowV2Address();
}

/** Every daily contract a gift's link opens that this build knows: the second version's, and the third's. */
export function linkOpenedDailyContracts(): readonly Hex[] {
  return [giftEscrowV2Address(), giftEscrowV3Address()].filter((address): address is Hex => address !== null);
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
/** The one setting of the third version, which stands on the second: it is set only once those three are. */
export const THIRD_VERSION_SETTING = "NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS";

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

/**
 * What is wrong with the third version's setting, or nothing. It stands on the second version: its gifts are opened
 * by their link's key and their agreements are written at the anchor, so its address without the three is refused,
 * and so is an address that is one of the three, which would read the second version's gifts by the third's rule.
 */
export function thirdVersionProblem(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = env[THIRD_VERSION_SETTING]?.trim() ?? "";
  if (value === "") return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return `${THIRD_VERSION_SETTING} is set and is not an address`;
  const second = SECOND_VERSION_SETTINGS.map((name) => env[name]?.trim() ?? "");
  if (second.some((one) => one === "")) return `${THIRD_VERSION_SETTING} is set and the three settings of the second version are not: the third version stands on them`;
  if (second.some((one) => one.toLowerCase() === value.toLowerCase())) return `${THIRD_VERSION_SETTING} names the address of one of the three settings of the second version`;
  return null;
}

export class SecondVersionHalfSet extends Error {
  constructor(problem: string) {
    super(`Refusing to start: ${problem}. A second version that is half set serves its gifts wrongly without saying so.`);
    this.name = "SecondVersionHalfSet";
  }
}

/** Refuses a half-set second version, or a third set without it, by name. Asked when the app is built and when a server starts. */
export function assertSecondVersionWhole(env: Readonly<Record<string, string | undefined>> = process.env): void {
  const problem = secondVersionProblem(env) ?? thirdVersionProblem(env);
  if (problem) throw new SecondVersionHalfSet(problem);
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
}

/** The version of the daily contract at an address: the third or the second only for the address set as such. */
export function dailyVersionOf(contract: string | null | undefined): ContractVersion {
  return same(contract, giftEscrowV3Address()) ? 3 : same(contract, giftEscrowV2Address()) ? 2 : 1;
}

/**
 * Whether a daily contract is one whose gifts are opened by their link's key, started with the signature of the
 * person they are for, and ended by that person: the second version and the third, which changed none of that.
 */
export function opensByItsLink(version: ContractVersion | undefined): boolean {
  return (version ?? 1) >= 2;
}

/** Whether a daily contract pays a day by a reading taken that same day: the third version's rule, and its alone. */
export function paysTheSameDay(version: ContractVersion | undefined): boolean {
  return version === 3;
}

export function milestoneVersionOf(contract: string | null | undefined): ContractVersion {
  return same(contract, milestoneGiftV2Address()) ? 2 : 1;
}

export function dailyAbiOf(contract: string | null | undefined): Abi {
  const version = dailyVersionOf(contract);
  return (version === 3 ? giftEscrowV3Abi : version === 2 ? giftEscrowV2Abi : giftEscrowAbi) as unknown as Abi;
}

export function milestoneAbiOf(contract: string | null | undefined): Abi {
  return (milestoneVersionOf(contract) === 2 ? milestoneGiftV2Abi : milestoneGiftAbi) as unknown as Abi;
}

export const CONSENT_ANCHOR_ABI = consentAnchorAbi as unknown as Abi;

/** Every ABI a transaction's logs may have been written by, for reading a creation back without knowing its version. */
export const DAILY_ABIS: readonly Abi[] = [giftEscrowAbi as unknown as Abi, giftEscrowV2Abi as unknown as Abi, giftEscrowV3Abi as unknown as Abi];
export const MILESTONE_ABIS: readonly Abi[] = [milestoneGiftAbi as unknown as Abi, milestoneGiftV2Abi as unknown as Abi];
