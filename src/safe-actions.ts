import { encodeFunctionData, getAddress, isAddress, type Abi, type Address, type Hex } from "viem";
import { consentAnchorAbi } from "./consent-anchor-abi";
import { exitRouterAbi } from "./exit-router-abi";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { giftEscrowV2Abi } from "./gift-escrow-v2-abi";
import { giftEscrowV3Abi } from "./gift-escrow-v3-abi";
import { milestoneGiftAbi } from "./milestone-gift-abi";
import { milestoneGiftV2Abi } from "./milestone-gift-v2-abi";

/**
 * What the owner of Viky's contracts can be asked to do, turned into the one call each is (scripts/safe-action.ts).
 * Key free and chain free: it reads the names it is given and encodes a call, so every action is pinned by a test
 * before anybody signs one.
 *
 * The second version's three contracts are targets of their own (the review of 2 Oct 2026, R-06). Until then the tool
 * knew the four contracts in service only, so accepting the ownership of a new contract, pausing one in an emergency
 * or changing its signer meant writing the call's bytes by hand.
 *
 * The third daily contract is a target too, `escrow-v3`. It hands its ownership over and announces a signer exactly as
 * the second version's contracts do, which is what `version: 2` says of a target here.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type SafeTarget = Readonly<{ key: string; name: string; address: Address; abi: Abi; version: 1 | 2 }>;

const TARGETS: Readonly<Record<string, Readonly<{ name: string; setting: string; abi: Abi; version: 1 | 2 }>>> = {
  escrow: { name: "gift escrow", setting: "GIFT_ESCROW_ADDRESS", abi: giftEscrowAbi as unknown as Abi, version: 1 },
  "earlier-escrow": { name: "earlier gift escrow", setting: "NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS", abi: giftEscrowAbi as unknown as Abi, version: 1 },
  milestone: { name: "milestone gift", setting: "MILESTONE_GIFT_ADDRESS", abi: milestoneGiftAbi as unknown as Abi, version: 1 },
  // The router holds none of the named actions below (it pauses nothing and signs no evidence): reach it with raw data.
  router: { name: "exit router", setting: "EXIT_ROUTER_ADDRESS", abi: exitRouterAbi as unknown as Abi, version: 1 },
  "escrow-v2": { name: "gift escrow, second version", setting: "NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS", abi: giftEscrowV2Abi as unknown as Abi, version: 2 },
  "milestone-v2": { name: "milestone gift, second version", setting: "NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS", abi: milestoneGiftV2Abi as unknown as Abi, version: 2 },
  anchor: { name: "consent anchor", setting: "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS", abi: consentAnchorAbi as unknown as Abi, version: 2 },
  "escrow-v3": { name: "gift escrow, third version", setting: "NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS", abi: giftEscrowV3Abi as unknown as Abi, version: 2 },
};

export const SAFE_TARGETS: readonly string[] = Object.keys(TARGETS);

/**
 * The contract an action is for. A contract of the second version is named by TARGET_ADDRESS when the app does not
 * know it yet, which is the case when its ownership is accepted: the three addresses are set in the app only after
 * that. When the app knows one too, the two must agree.
 */
export function safeTarget(env: Env): SafeTarget {
  const key = (env.TARGET?.trim() ?? "escrow").toLowerCase();
  const target = TARGETS[key];
  if (!target) throw new Error(`TARGET is ${SAFE_TARGETS.join(", ")}, and ${key} is none of them`);
  const set = env[target.setting]?.trim();
  const given = env.TARGET_ADDRESS?.trim();
  if (given && target.version === 1) throw new Error(`TARGET_ADDRESS names a contract of the second version or the third only: the ${target.name} is read from ${target.setting}`);
  if (given && !isAddress(given)) throw new Error("TARGET_ADDRESS is not an address");
  if (given && set && getAddress(given) !== getAddress(set)) throw new Error(`TARGET_ADDRESS is ${given}, and ${target.setting} says ${set}: one of the two is wrong`);
  const value = given || set;
  if (!value) throw new Error(target.version === 2 ? `No address for the ${target.name}: give TARGET_ADDRESS, as the deployment printed it` : `No address for ${target.name}`);
  return { key, name: target.name, address: getAddress(value), abi: target.abi, version: target.version };
}

/** The first four bytes of `renounceOwnership()`. */
export const RENOUNCE_OWNERSHIP = "0x715018a6";

export const SAFE_ACTIONS = ["creation-paused", "checkin-paused", "proof-paused", "evidence-signer", "anchorer", "accept-ownership", "raw"] as const;

/** Which contracts each named action exists on: asked of another, it is refused here rather than by the encoder. */
const ACTION_TARGETS: Readonly<Record<string, readonly string[]>> = {
  "creation-paused": ["escrow", "earlier-escrow", "milestone", "escrow-v2", "milestone-v2", "escrow-v3"],
  "checkin-paused": ["escrow", "earlier-escrow", "escrow-v2", "escrow-v3"],
  "proof-paused": ["milestone", "milestone-v2"],
  "evidence-signer": ["escrow", "earlier-escrow", "milestone", "escrow-v2", "milestone-v2", "escrow-v3"],
  anchorer: ["anchor"],
  "accept-ownership": ["escrow-v2", "milestone-v2", "anchor", "escrow-v3"],
};

export type SafeActionCall = Readonly<{ step: string; to: Address; data: Hex; target: SafeTarget | null; action: string }>;

/** The action in words, turned into the one call it is. Anything else goes through ACTION=raw with its own data. */
export function safeActionCall(env: Env): SafeActionCall {
  const action = (env.ACTION?.trim() ?? "").toLowerCase();
  if (action === "raw") {
    const to = getAddress(String(env.TO?.trim()));
    const data = String(env.DATA?.trim()) as Hex;
    if (!/^0x([0-9a-fA-F]{2})+$/.test(data)) throw new Error("DATA must be the call's own bytes, as 0x followed by an even number of hex figures");
    // `renounceOwnership()`, by its selector: it leaves a contract with no owner for good, and no step of Viky's ever
    // needs it. The contracts that refuse it say so themselves; this refuses before two people are asked to sign it.
    if (data.toLowerCase().startsWith(RENOUNCE_OWNERSHIP)) throw new Error("Refusing to run: DATA is renounceOwnership(), which gives a contract's ownership up for good");
    return { step: `raw call to ${to}`, to, data, target: null, action };
  }
  if (!ACTION_TARGETS[action]) throw new Error(`ACTION is ${SAFE_ACTIONS.join(", ")}`);
  const target = safeTarget(env);
  if (!ACTION_TARGETS[action].includes(target.key)) throw new Error(`${action} is not an action of the ${target.name}: it is one of ${ACTION_TARGETS[action].join(", ")}`);
  const { name, address, abi } = target;
  const call = (step: string, functionName: string, args: readonly unknown[] = []): SafeActionCall => ({ step, to: address, data: encodeFunctionData({ abi, functionName, args }), target, action });

  if (action === "creation-paused" || action === "checkin-paused" || action === "proof-paused") {
    const said = env.PAUSED?.trim();
    const value = said === "true" ? true : said === "false" ? false : undefined;
    if (value === undefined) throw new Error("PAUSED must be true or false");
    const functionName = action === "creation-paused" ? "setCreationPaused" : action === "checkin-paused" ? "setCheckInPaused" : "setProofPaused";
    return call(`${value ? "pause" : "unpause"} ${action.replace("-paused", "")} on the ${name}`, functionName, [value]);
  }
  if (action === "evidence-signer") {
    const signer = getAddress(String(env.VALUE?.trim()));
    // On the second version this announces the signer, which stands a day later; zero calls an announcement off.
    const step = target.version === 2 ? (/^0x0{40}$/.test(signer) ? `call off the evidence signer announced on the ${name}` : `announce ${signer} as the evidence signer of the ${name}, to stand in 24 hours`) : `set the evidence signer of the ${name} to ${signer}`;
    return call(step, "setEvidenceSigner", [signer]);
  }
  if (action === "anchorer") {
    const anchorer = getAddress(String(env.VALUE?.trim()));
    return call(`name ${anchorer} as the anchorer of the ${name}`, "setAnchorer", [anchorer]);
  }
  // Ownership of a contract of the second version moves in two steps: the deployment hands it over, the Safe accepts.
  return call(`accept the ownership of the ${name} at ${address}`, "acceptOwnership");
}
