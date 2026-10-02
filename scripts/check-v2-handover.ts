import "../src/load-env";
import { createPublicClient, getAddress, isAddress, type Address, type Hex } from "viem";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, scriptTransport } from "../src/monad/chain";
import { handoverProblems, type AnchorRead, type GiftContractRead, type ReplacedContract } from "../src/v2-handover";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW, MILESTONE_GIFT } from "../src/viky-contracts";

/**
 * Reads whether the three contracts of the second version are the Safe's, and as the deployment left them, before
 * their addresses are set in the app (the review of 2 Oct 2026, R-05, and its delta re-read). It sends nothing and
 * holds no key.
 *
 * Between the end of the deployment and the Safe's acceptance the deploying key still owns the three. So the app is
 * told where they are only once this passes (src/v2-handover.ts says each thing and why):
 *   - `owner()` is the Safe, and `pendingOwner()` is nobody, on the three;
 *   - on the two gift contracts, no evidence signer is waiting and the signer in place is the one named;
 *   - on the two gift contracts, no pause of readings was sent: one sent before the hand-over leaves the Safe without
 *     its brake for the seven days that follow it;
 *   - creation is open on the two gift contracts and closed on the contracts they replace, and their numbering
 *     continues where those stopped;
 *   - the anchor names the relayer, which the deployment took on somebody's word.
 * Only then does it print the three settings, to be set together.
 *
 * Usage: DAILY_V2=0x… MILESTONE_V2=0x… ANCHOR=0x… OWNER_ADDRESS=0x… EVIDENCE_SIGNER_ADDRESS=0x… RELAYER_ADDRESS=0x…
 *        pnpm check:v2-handover
 */

const view = (name: string, type: string) => ({ type: "function", name, stateMutability: "view", inputs: [], outputs: [{ type }] }) as const;
const abi = [
  view("owner", "address"),
  view("pendingOwner", "address"),
  view("pendingEvidenceSigner", "address"),
  view("evidenceSigner", "address"),
  view("checkInPausedUntil", "uint64"),
  view("proofPausedUntil", "uint64"),
  view("creationPaused", "bool"),
  view("nextGiftId", "uint256"),
  view("anchorer", "address"),
] as const;
type View = (typeof abi)[number]["name"];

function named(name: string): Address {
  const value = process.env[name]?.trim();
  if (!value || !isAddress(value)) throw new Error(`${name} is missing or is not an address`);
  return getAddress(value);
}

async function main() {
  const client = createPublicClient({ chain: monadChain, transport: scriptTransport(monadRpcUrl(), Boolean(process.env.REHEARSAL)) });
  const chainId = await client.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const expected = { owner: named("OWNER_ADDRESS"), signer: named("EVIDENCE_SIGNER_ADDRESS"), relayer: named("RELAYER_ADDRESS"), nowSeconds: Number((await client.getBlock()).timestamp) };
  const settings = [
    { name: "GiftEscrowV2", setting: "NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS", address: named("DAILY_V2") },
    { name: "MilestoneGiftV2", setting: "NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS", address: named("MILESTONE_V2") },
    { name: "ConsentAnchor", setting: "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS", address: named("ANCHOR") },
  ] as const;
  const missing: string[] = [];
  for (const contract of settings) {
    const code = await client.getCode({ address: contract.address });
    if (!code || code === "0x") missing.push(`${contract.name} ${contract.address}: there is no contract at this address`);
  }
  if (missing.length > 0) {
    for (const problem of missing) console.error(`NOT READY: ${problem}`);
    throw new Error(`${missing.length} thing(s) to put right. Set nothing in the app`);
  }

  const read = <T>(address: Hex, functionName: View) => client.readContract({ address, abi, functionName }) as Promise<T>;
  const address = async (at: Hex, functionName: View) => getAddress(await read<Hex>(at, functionName));
  const replaced = async (name: string, at: Hex): Promise<ReplacedContract> => ({ name, address: at, nextGiftId: await read<bigint>(at, "nextGiftId"), creationPaused: await read<boolean>(at, "creationPaused") });
  const gift = async (contract: (typeof settings)[number], target: string, pauseAction: string, pausedUntil: View, replaces: ReplacedContract[]): Promise<GiftContractRead> => ({
    name: contract.name,
    target,
    pauseAction,
    address: contract.address,
    owner: await address(contract.address, "owner"),
    pendingOwner: await address(contract.address, "pendingOwner"),
    evidenceSigner: await address(contract.address, "evidenceSigner"),
    pendingEvidenceSigner: await address(contract.address, "pendingEvidenceSigner"),
    pausedUntil: BigInt(await read<bigint | number>(contract.address, pausedUntil)),
    creationPaused: await read<boolean>(contract.address, "creationPaused"),
    nextGiftId: await read<bigint>(contract.address, "nextGiftId"),
    replaces,
  });
  const gifts = [
    await gift(settings[0], "escrow-v2", "checkin-paused", "checkInPausedUntil", [await replaced("the daily contract", GIFT_ESCROW), await replaced("the earlier daily contract", EARLIER_GIFT_ESCROW)]),
    await gift(settings[1], "milestone-v2", "proof-paused", "proofPausedUntil", [await replaced("the milestone contract", MILESTONE_GIFT)]),
  ];
  const anchor: AnchorRead = {
    name: settings[2].name,
    address: settings[2].address,
    owner: await address(settings[2].address, "owner"),
    pendingOwner: await address(settings[2].address, "pendingOwner"),
    anchorer: await address(settings[2].address, "anchorer"),
  };
  const jsonOf = (value: unknown) => JSON.stringify(value, (_key, field: unknown) => (typeof field === "bigint" ? field.toString() : field));
  for (const contract of [...gifts, anchor]) console.log(jsonOf(contract));

  const { problems, notes } = handoverProblems(expected, gifts, anchor);
  for (const note of notes) console.log(`NOTE: ${note}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`NOT READY: ${problem}`);
    throw new Error(`${problems.length} thing(s) to put right. Set nothing in the app`);
  }
  console.log("\nHANDED OVER: the Safe owns the three, nobody else is offered them, no signer is waiting, no pause was sent, and the anchor names the relayer.");
  console.log("Set these three together, in the Vercel environment and in .env.local, and build the app again:");
  for (const contract of settings) console.log(`${contract.setting}=${contract.address}`);
  console.log("From the first gift made on the second version they are never changed, and creation is never reopened on a contract it replaced.");
}

main().catch((error) => {
  console.error("HANDOVER_CHECK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
