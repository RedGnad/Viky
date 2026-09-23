import { BaseError, ContractFunctionRevertedError, createPublicClient, type Abi, type Hex } from "viem";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { milestoneGiftAbi } from "./milestone-gift-abi";
import { monadTransport, PUBLIC_RPC_URL } from "./monad/chain";

/**
 * What the chain itself says about Viky's contracts, read when the judges page is served (U2, S5).
 *
 * Nothing here is written down in the repository and repeated: the owner, the pauses and the refusal are asked of the
 * contract at that moment, so the page cannot go stale and cannot flatter. Every call below is one anybody can make
 * with `cast`, and the page prints the command beside the answer.
 *
 * The refusal is a real one: a view that asks for a gift number nobody has ever created, which the contract answers
 * with its own error. It is a read, so it costs nothing and changes nothing, and a judge can reproduce it.
 */

export type ContractFacts = Readonly<{
  label: string;
  address: string;
  /** The owner as the contract answers it now, or the reason it could not be read. */
  owner: string | null;
  /** What the contract is pausing right now, as a list of "what: yes or no", read from the chain. */
  pauses: ReadonlyArray<{ what: string; paused: boolean }>;
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

async function factsFor(label: string, address: Hex, abi: Abi, pauses: ReadonlyArray<{ what: string; getter: string }>): Promise<ContractFacts> {
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

  let refusal: ContractFacts["refusal"] = null;
  try {
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
  const jobs: Array<Promise<ContractFacts>> = [];
  if (escrow) jobs.push(factsFor("The gift contract, for a habit", escrow as Hex, giftEscrowAbi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings", getter: "checkInPaused" },
  ]));
  if (earlier && earlier !== escrow) jobs.push(factsFor("The earlier gift contract, which still runs the gifts it holds", earlier as Hex, giftEscrowAbi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings", getter: "checkInPaused" },
  ]));
  if (milestone) jobs.push(factsFor("The milestone contract, for one thing reached", milestone as Hex, milestoneGiftAbi as unknown as Abi, [
    { what: "new gifts", getter: "creationPaused" },
    { what: "readings", getter: "proofPaused" },
  ]));
  return Promise.all(jobs);
}
