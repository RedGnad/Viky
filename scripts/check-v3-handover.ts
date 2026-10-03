import "../src/load-env";
import { createPublicClient, getAddress, isAddress, type Abi, type Address, type Hex } from "viem";
import { DAILY_GOALS } from "../src/daily-goals";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { giftEscrowV3Abi } from "../src/gift-escrow-v3-abi";
import { MONAD_CHAIN_ID, monadChain, monadRpcUrl, scriptTransport } from "../src/monad/chain";
import { giftEscrowV2Address, THIRD_VERSION_SETTING } from "../src/v2";
import { GOAL_NUMBERS, type GoalsHeld } from "../src/v2-handover";
import { thirdHandoverProblems, type EarlierDaily, type ThirdDailyRead } from "../src/v3-handover";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW } from "../src/viky-contracts";

/**
 * Reads whether the third daily contract is the Safe's, and as the deployment left it, before its address is set in
 * the app (3 Oct 2026). It sends nothing and holds no key.
 *
 * Between the end of the deployment and the Safe's acceptance the deploying key still owns the contract. So the app is
 * told where it is only once this passes (src/v3-handover.ts says each thing and why):
 *   - `owner()` is the Safe, and `pendingOwner()` is nobody;
 *   - no evidence signer is waiting and the signer in place is the one named;
 *   - no pause of readings was sent, and creation is open;
 *   - it answers schema 3: it is the third daily contract and no other;
 *   - its numbering is past every earlier daily contract's, and one that still makes gifts has numbers left before it;
 *   - each of the 255 goal numbers holds what the register says, and nothing where the register holds nothing.
 * Only then does it print the setting, to be set beside the three of the second version.
 *
 * Usage: DAILY_V3=0x… OWNER_ADDRESS=0x… EVIDENCE_SIGNER_ADDRESS=0x… pnpm check:v3-handover
 */

/** How many goal numbers are asked for at once: the public endpoint is not asked for 255 answers in one breath. */
const GOALS_AT_ONCE = 15;

function named(name: string): Address {
  const value = process.env[name]?.trim();
  if (!value || !isAddress(value)) throw new Error(`${name} is missing or is not an address`);
  return getAddress(value);
}

async function main() {
  const client = createPublicClient({ chain: monadChain, transport: scriptTransport(monadRpcUrl(), Boolean(process.env.REHEARSAL)) });
  const chainId = await client.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const expected = { owner: named("OWNER_ADDRESS"), signer: named("EVIDENCE_SIGNER_ADDRESS"), nowSeconds: Number((await client.getBlock()).timestamp) };
  const at = named("DAILY_V3");
  const second = giftEscrowV2Address();
  if (!second) throw new Error("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS is not set here: the third daily contract stands on the second version");
  const code = await client.getCode({ address: at });
  if (!code || code === "0x") throw new Error(`GiftEscrowV3 ${at}: there is no contract at this address. Set nothing in the app`);

  const abi = giftEscrowV3Abi as unknown as Abi;
  const read = <T>(functionName: string, args: readonly unknown[] = []) => client.readContract({ address: at, abi, functionName, args }) as Promise<T>;
  const address = async (functionName: string) => getAddress(await read<Hex>(functionName));
  // The views asked of an earlier contract are the same on every version: the first version's ABI reads them all.
  const earlierAbi = giftEscrowAbi as unknown as Abi;
  const earlier: EarlierDaily[] = [];
  for (const [name, contract] of [["the second version's daily contract", second], ["the first version's daily contract", GIFT_ESCROW], ["the earlier daily contract", EARLIER_GIFT_ESCROW]] as const) {
    earlier.push({
      name,
      address: contract,
      nextGiftId: (await client.readContract({ address: contract, abi: earlierAbi, functionName: "nextGiftId" })) as bigint,
      creationPaused: (await client.readContract({ address: contract, abi: earlierAbi, functionName: "creationPaused" })) as boolean,
    });
  }
  const providers: Hex[] = [];
  for (let from = 1; from <= GOAL_NUMBERS; from += GOALS_AT_ONCE) {
    const numbers = Array.from({ length: Math.min(GOALS_AT_ONCE, GOAL_NUMBERS - from + 1) }, (_unused, index) => from + index);
    providers.push(...(await Promise.all(numbers.map((goalType) => read<Hex>("goalProviders", [goalType])))));
  }
  const goals: GoalsHeld = { providers };
  const third: ThirdDailyRead = {
    name: "GiftEscrowV3",
    target: "escrow-v3",
    pauseAction: "checkin-paused",
    address: at,
    owner: await address("owner"),
    pendingOwner: await address("pendingOwner"),
    evidenceSigner: await address("evidenceSigner"),
    pendingEvidenceSigner: await address("pendingEvidenceSigner"),
    pausedUntil: BigInt(await read<bigint | number>("checkInPausedUntil")),
    creationPaused: await read<boolean>("creationPaused"),
    nextGiftId: await read<bigint>("nextGiftId"),
    schemaId: Number(await read<bigint | number>("CONTRACT_SCHEMA_ID")),
    earlier,
    goals,
    register: DAILY_GOALS,
  };
  const jsonOf = (value: unknown) => JSON.stringify(value, (_key, field: unknown) => (typeof field === "bigint" ? field.toString() : field));
  console.log(jsonOf({ ...third, goals: `${providers.filter((provider) => !/^0x0{64}$/.test(provider)).length} registered of ${GOAL_NUMBERS} numbers read`, register: `${DAILY_GOALS.length} goals` }));

  const { problems, notes } = thirdHandoverProblems(expected, third);
  for (const note of notes) console.log(`NOTE: ${note}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`NOT READY: ${problem}`);
    throw new Error(`${problems.length} thing(s) to put right. Set nothing in the app`);
  }
  console.log("\nHANDED OVER: the Safe owns it, nobody else is offered it, no signer is waiting, no pause was sent, its numbering meets no earlier contract's, and every goal is the register's.");
  console.log("Set this one beside the three of the second version, in the Vercel environment and in .env.local, and build the app again:");
  console.log(`${THIRD_VERSION_SETTING}=${at}`);
  console.log("From the first gift made on the third contract it is never changed.");
}

main().catch((error) => {
  console.error("HANDOVER_CHECK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
