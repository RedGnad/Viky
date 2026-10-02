import "../src/load-env";
import { createPublicClient, getAddress, isAddress, type Address } from "viem";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, scriptTransport } from "../src/monad/chain";

/**
 * Reads whether the three contracts of the second version are the Safe's, before their addresses are set in the app
 * (the review of 2 Oct 2026, R-05). It sends nothing and holds no key.
 *
 * Between the end of the deployment and the Safe's acceptance the deploying key still owns the three. So the app is
 * told where they are only once this passes, for each of the three:
 *   - `owner()` is the Safe, and `pendingOwner()` is nobody;
 *   - on the two gift contracts, no evidence signer is waiting (`pendingEvidenceSigner()` is zero), and the signer in
 *     place is the one named.
 * Only then does it print the three settings, to be set together.
 *
 * Usage: DAILY_V2=0x… MILESTONE_V2=0x… ANCHOR=0x… OWNER_ADDRESS=0x… EVIDENCE_SIGNER_ADDRESS=0x… pnpm check:v2-handover
 */

const abi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingOwner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingEvidenceSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "evidenceSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

function named(name: string): Address {
  const value = process.env[name]?.trim();
  if (!value || !isAddress(value)) throw new Error(`${name} is missing or is not an address`);
  return getAddress(value);
}

const nobody = (address: string) => /^0x0{40}$/.test(address);

async function main() {
  const client = createPublicClient({ chain: monadChain, transport: scriptTransport(monadRpcUrl(), Boolean(process.env.REHEARSAL)) });
  const chainId = await client.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const owner = named("OWNER_ADDRESS");
  const signer = named("EVIDENCE_SIGNER_ADDRESS");
  const contracts = [
    { name: "GiftEscrowV2", setting: "NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS", address: named("DAILY_V2"), signs: true },
    { name: "MilestoneGiftV2", setting: "NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS", address: named("MILESTONE_V2"), signs: true },
    { name: "ConsentAnchor", setting: "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS", address: named("ANCHOR"), signs: false },
  ];
  const problems: string[] = [];
  for (const contract of contracts) {
    const read = (functionName: "owner" | "pendingOwner" | "pendingEvidenceSigner" | "evidenceSigner") => client.readContract({ address: contract.address, abi, functionName });
    const code = await client.getCode({ address: contract.address });
    if (!code || code === "0x") {
      problems.push(`${contract.name} ${contract.address}: there is no contract at this address`);
      continue;
    }
    const [ownedBy, offeredTo] = [getAddress(await read("owner")), getAddress(await read("pendingOwner"))];
    const line: Record<string, string> = { contract: contract.name, address: contract.address, owner: ownedBy, pendingOwner: offeredTo };
    if (ownedBy !== owner) problems.push(`${contract.name}: its owner is ${ownedBy}, not the Safe ${owner}. The Safe has not accepted it yet`);
    if (!nobody(offeredTo)) problems.push(`${contract.name}: its ownership is still offered to ${offeredTo}`);
    if (contract.signs) {
      const [waiting, inPlace] = [getAddress(await read("pendingEvidenceSigner")), getAddress(await read("evidenceSigner"))];
      line.pendingEvidenceSigner = waiting;
      line.evidenceSigner = inPlace;
      if (!nobody(waiting)) problems.push(`${contract.name}: an evidence signer is waiting, ${waiting}. Nobody announced one on purpose: call it off from the Safe before anything else`);
      if (inPlace !== signer) problems.push(`${contract.name}: its evidence signer is ${inPlace}, not ${signer}`);
    }
    console.log(JSON.stringify(line));
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`NOT READY: ${problem}`);
    throw new Error(`${problems.length} thing(s) to put right. Set nothing in the app`);
  }
  console.log("\nHANDED OVER: the Safe owns the three, nobody else is offered them, and no signer is waiting.");
  console.log("Set these three together, in the Vercel environment and in .env.local, and build the app again:");
  for (const contract of contracts) console.log(`${contract.setting}=${contract.address}`);
  console.log("From the first gift made on the second version they are never changed, and creation is never reopened on a contract it replaced.");
}

main().catch((error) => {
  console.error("HANDOVER_CHECK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
