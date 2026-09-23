import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { monadRpcUrl } from "./monad/chain";

/**
 * Who owns the contracts, asked of the chain as the judges page is served (D187, item 10 of the money path review
 * of 23 Sep 2026): the page used to say one wallet, the founder's, owned all four, and the chain had answered the
 * Safe since 20 Sep 2026. Nothing about the owner is written down here: each contract is asked `owner()`, and when
 * all four answer the same address, that address is asked what it is (a Safe's version, its keys and how many must
 * sign). What could not be read is said so, never filled in from memory.
 */

export type OwnedContract = Readonly<{ label: string; address: string; owner: string | null }>;

export type SafeFacts = Readonly<{ version: string; threshold: number; owners: readonly string[] }>;

export type Ownership = Readonly<{
  contracts: readonly OwnedContract[];
  /** The one address every contract answers, or null when they differ or one could not be read. */
  one: string | null;
  /** What that one address says of itself when it is a Safe; null when it is not one, or could not be read. */
  safe: SafeFacts | null;
}>;

export type OwnerReader = Readonly<{
  owner(address: Hex): Promise<string>;
  safe(address: Hex): Promise<SafeFacts>;
}>;

const OWNABLE_ABI = parseAbi(["function owner() view returns (address)"]);
const SAFE_ABI = parseAbi(["function getThreshold() view returns (uint256)", "function getOwners() view returns (address[])", "function VERSION() view returns (string)"]);

/** The reader the page uses: the server's own endpoint, never printed. */
export function chainOwnerReader(): OwnerReader {
  const chain = createPublicClient({ transport: http(monadRpcUrl()) });
  return {
    owner: async (address) => String(await chain.readContract({ address, abi: OWNABLE_ABI, functionName: "owner" })),
    safe: async (address) => {
      const [version, threshold, owners] = await Promise.all([
        chain.readContract({ address, abi: SAFE_ABI, functionName: "VERSION" }),
        chain.readContract({ address, abi: SAFE_ABI, functionName: "getThreshold" }),
        chain.readContract({ address, abi: SAFE_ABI, functionName: "getOwners" }),
      ]);
      return { version: String(version), threshold: Number(threshold), owners: (owners as readonly string[]).map(String) };
    },
  };
}

/** The contracts the product runs on, by the names the page uses; one not configured is left out. */
export function ownedContracts(env: NodeJS.ProcessEnv = process.env): ReadonlyArray<{ label: string; address: Hex }> {
  const named: Array<{ label: string; key: string }> = [
    { label: "gifts", key: "NEXT_PUBLIC_GIFT_ESCROW_ADDRESS" },
    { label: "the earlier gift contract that still runs the first gifts", key: "NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS" },
    { label: "milestone gifts", key: "NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS" },
    { label: "the way out", key: "EXIT_ROUTER_ADDRESS" },
  ];
  const out: Array<{ label: string; address: Hex }> = [];
  for (const { label, key } of named) {
    const address = env[key]?.trim();
    if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) out.push({ label, address: address as Hex });
  }
  return out;
}

export async function readOwnership(reader: OwnerReader = chainOwnerReader(), contracts = ownedContracts()): Promise<Ownership> {
  const read = await Promise.all(
    contracts.map(async ({ label, address }): Promise<OwnedContract> => {
      try {
        return { label, address, owner: await reader.owner(address) };
      } catch {
        return { label, address, owner: null };
      }
    }),
  );
  const first = read[0]?.owner ?? null;
  const one = first && read.every((contract) => contract.owner && contract.owner.toLowerCase() === first.toLowerCase()) ? first : null;
  let safe: SafeFacts | null = null;
  if (one) {
    try {
      safe = await reader.safe(one as Hex);
    } catch {
      safe = null;
    }
  }
  return { contracts: read, one, safe };
}

/** The sentence at the head of the judges page, true of the chain at the moment it was read. */
export function ownershipWords(ownership: Ownership): string {
  const { contracts, one, safe } = ownership;
  if (contracts.length === 0) return "No contract is configured here, so nothing can be said about who owns them.";
  const labels = contracts.map((contract) => contract.label).join(", ");
  const count = contracts.length === 1 ? "the one contract" : `all ${contracts.length} (${labels})`;
  if (!one) {
    const each = contracts.map((contract) => `${contract.label} ${contract.address}: ${contract.owner ?? "could not be read just now"}`).join("; ");
    return `The contracts do not answer one owner right now, read from the chain as this page was served: ${each}. Each is read again further down.`;
  }
  const what = safe
    ? `a Safe ${safe.version} that signs with ${safe.threshold} of its ${safe.owners.length} keys, the project's own`
    : "which does not answer as a Safe this page can read";
  const needs = safe ? `${safe.threshold} of those signatures` : "that owner's signature";
  return `One owner holds ${count}, read from the chain as this page was served: ${one}, ${what}. So registering a goal, replacing the evidence signer or pausing needs ${needs} on any of them, and no single key can.`;
}
