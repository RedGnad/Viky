import { BaseError, ContractFunctionRevertedError, createPublicClient, type Abi, type Hex } from "viem";
import { consentAnchorAbi } from "./consent-anchor-abi";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { giftEscrowV2Abi } from "./gift-escrow-v2-abi";
import { milestoneGiftAbi } from "./milestone-gift-abi";
import { milestoneGiftV2Abi } from "./milestone-gift-v2-abi";
import { monadTransport, providersAskedFirst, PUBLIC_RPC_URL } from "./monad/chain";
import { giftEscrowV3Abi } from "./gift-escrow-v3-abi";
import { consentAnchorAddress, giftEscrowV2Address, giftEscrowV3Address, milestoneGiftV2Address } from "./v2";

/**
 * What the chain itself says about Viky's contracts, read when the judges page is served (U2, S5).
 *
 * Nothing here is written down in the repository and repeated: the owner, the pauses and the refusal are asked of the
 * contract at that moment, so the page cannot go stale and cannot flatter. Every call below is one anybody can make
 * with `cast`, and the page prints the command beside the answer.
 *
 * The refusal is a real one: a view that asks for a gift number nobody has ever created, which the contract answers
 * with its own error. It is a read, so it costs nothing and changes nothing, and a judge can reproduce it.
 *
 * Since the second version was deployed (2 Oct 2026) there are seven lines to read: the two contracts new gifts are
 * made on, the anchor of agreements, and the first version's three, which run the gifts they hold. Each gift contract
 * is also asked the key whose signature it accepts for a reading, and the second version the key it has been told
 * will replace it, so a signer announced and not yet standing shows here the day it is announced.
 */

export type ContractFacts = Readonly<{
  label: string;
  address: string;
  /** The owner as the contract answers it now, or the reason it could not be read. */
  owner: string | null;
  /** What the contract is pausing right now, as a list of "what: yes or no", read from the chain. */
  pauses: ReadonlyArray<{ what: string; paused: boolean }>;
  /** Other keys the contract answers by name: the evidence signer, one announced, the account that writes on the anchor. */
  keys: ReadonlyArray<{ what: string; address: string }>;
  /** False for a contract that holds no gift, the anchor: there is no gift number to ask it for, so no refusal to show. */
  holdsGifts: boolean;
  /** One real call anybody can repeat, with the command and what it answered. */
  call: Readonly<{ command: string; answer: string }>;
  /** One real refusal anybody can repeat: the error the contract returned, with its command. */
  refusal: Readonly<{ command: string; error: string }> | null;
  /** What could not be read, said plainly rather than left blank. */
  unread: string | null;
}>;

const UNKNOWN_GIFT = 999_999_999n;

function client() {
  return createPublicClient({ transport: monadTransport() });
}

/** The name of the error a contract returned, or null when it refused in some other way. */
function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  return reverted.data?.errorName ?? reverted.reason ?? null;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** A key the contract names: the getter, what the page calls it, and whether the zero address means "none" and is left out. */
type KeyRead = Readonly<{ what: string; getter: string; noneIsZero?: true }>;

const EVIDENCE_SIGNER: KeyRead = { what: "Evidence signer, right now", getter: "evidenceSigner" };
const ANNOUNCED_SIGNER: KeyRead = { what: "Evidence signer announced, not standing yet", getter: "pendingEvidenceSigner", noneIsZero: true };

async function factsFor(
  label: string,
  address: Hex,
  abi: Abi,
  pauses: ReadonlyArray<{ what: string; getter: string }>,
  keyReads: readonly KeyRead[] = [EVIDENCE_SIGNER],
  holdsGifts = true,
): Promise<ContractFacts> {
  const chain = client();
  const unread: string[] = [];
  let owner: string | null = null;
  try {
    owner = String(await chain.readContract({ address, abi, functionName: "owner" }));
  } catch (error) {
    unread.push(`the owner (${error instanceof Error ? error.message.split("\n")[0] : "unreadable"})`);
  }
  const read: Array<{ what: string; paused: boolean }> = [];
  for (const pause of pauses) {
    try {
      read.push({ what: pause.what, paused: Boolean(await chain.readContract({ address, abi, functionName: pause.getter })) });
    } catch {
      unread.push(pause.what);
    }
  }

  const keys: Array<{ what: string; address: string }> = [];
  for (const key of keyReads) {
    try {
      const answered = String(await chain.readContract({ address, abi, functionName: key.getter }));
      if (!(key.noneIsZero && answered.toLowerCase() === ZERO)) keys.push({ what: key.what, address: answered });
    } catch {
      unread.push(key.what.toLowerCase());
    }
  }

  let refusal: ContractFacts["refusal"] = null;
  if (holdsGifts) try {
    await chain.readContract({ address, abi, functionName: "getGift", args: [UNKNOWN_GIFT] });
    unread.push("a refusal: asking for a gift nobody created was answered rather than refused");
  } catch (error) {
    const name = revertName(error);
    refusal = name
      ? { command: `cast call ${address} "getGift(uint256)" ${UNKNOWN_GIFT} --rpc-url ${PUBLIC_RPC_URL}`, error: `${name}()` }
      : null;
    if (!name) unread.push("a refusal in the contract's own words");
  }

  return {
    label,
    address,
    owner,
    pauses: read,
    keys,
    holdsGifts,
    call: {
      command: `cast call ${address} "owner()(address)" --rpc-url ${PUBLIC_RPC_URL}`,
      answer: owner ?? "could not be read just now",
    },
    refusal,
    unread: unread.length > 0 ? unread.join("; ") : null,
  };
}

/** Every contract the product runs on, as the chain answers for them right now. A contract not configured is skipped. */
export async function contractFacts(): Promise<ContractFacts[]> {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  const earlier = process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim();
  const milestone = process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS?.trim();
  const escrowV2 = giftEscrowV2Address();
  const escrowV3 = giftEscrowV3Address();
  const milestoneV2 = milestoneGiftV2Address();
  const anchor = consentAnchorAddress();
  const jobs: Array<Promise<ContractFacts>> = [];
  // Where a gift made today goes comes first: the third daily contract once it is set, the second version before it.
  if (escrowV3) jobs.push(factsFor("The gift contract, for a habit, third version: new gifts are made here, and a day is paid the day it is read", escrowV3, giftEscrowV3Abi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings and openings", getter: "checkInPaused" },
  ], [EVIDENCE_SIGNER, ANNOUNCED_SIGNER]));
  if (escrowV2) jobs.push(factsFor(escrowV3 ? "The gift contract, for a habit, second version: it runs the gifts it holds" : "The gift contract, for a habit, second version: new gifts are made here", escrowV2, giftEscrowV2Abi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings and openings", getter: "checkInPaused" },
  ], [EVIDENCE_SIGNER, ANNOUNCED_SIGNER]));
  if (milestoneV2) jobs.push(factsFor("The milestone contract, for one thing reached, second version: new gifts are made here", milestoneV2, milestoneGiftV2Abi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings and openings", getter: "proofPaused" },
  ], [EVIDENCE_SIGNER, ANNOUNCED_SIGNER]));
  if (anchor) jobs.push(factsFor("The anchor of agreements: it holds no money", anchor, consentAnchorAbi as unknown as Abi, [], [{ what: "The one account that may write a yes or a stop here", getter: "anchorer" }], false));
  if (escrow) jobs.push(factsFor(escrowV2 ? "The gift contract, for a habit, first version: it runs the gifts it holds" : "The gift contract, for a habit", escrow as Hex, giftEscrowAbi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings", getter: "checkInPaused" },
  ]));
  if (earlier && earlier !== escrow) jobs.push(factsFor("The earlier gift contract, which still runs the gifts it holds", earlier as Hex, giftEscrowAbi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings", getter: "checkInPaused" },
  ]));
  if (milestone) jobs.push(factsFor(milestoneV2 ? "The milestone contract, for one thing reached, first version: it runs the gifts it holds" : "The milestone contract, for one thing reached", milestone as Hex, milestoneGiftAbi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings", getter: "proofPaused" },
  ]));
  return Promise.all(jobs);
}

/**
 * Who answers the app's reads of Monad first, said under Network (the founder, 10 Oct 2026): by the provider's name,
 * from this deployment's own settings, and never by the endpoint, which carries a key. Nothing is said where the first
 * endpoint is the public one, or one this code has no name for: the sentence is read, never written.
 */
export function providerWords(asked: ReturnType<typeof providersAskedFirst> = providersAskedFirst()): string | null {
  const then = "Monad RPC first, with the public endpoint above behind it.";
  if (asked.browser && asked.browser === asked.server) return `The app's own reads of Monad go through ${asked.browser}'s ${then}`;
  if (asked.browser) return `The reads a browser makes of Monad go through ${asked.browser}'s ${then}`;
  if (asked.server) return `The server's reads of Monad go through ${asked.server}'s ${then}`;
  return null;
}
