import "../src/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseEther,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DUOLINGO_GOAL_PROVIDER_ID, GOAL_TYPE_DUOLINGO_XP } from "../src/gift-attestation";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "../src/monad/chain";

/**
 * Deploys GiftEscrow to Monad mainnet, registers the Duolingo goal and unpauses. Every transaction waits for
 * finality (k = 3 blocks) before the next one, and every gas limit is declared explicitly with the 7.5 %
 * Monad margin, because Monad charges the declared limit. Refuses to run below the 10 MON reserve plus a
 * working margin.
 *
 * Inputs (.env): DEPLOYER_PRIVATE_KEY, EVIDENCE_SIGNER_ADDRESS, optional OWNER_ADDRESS (a multisig to hand
 * ownership to), optional MONAD_RPC_URL.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

const MIN_DEPLOYER_BALANCE = parseEther("11");

async function main() {
  const deployerKey = required("DEPLOYER_PRIVATE_KEY");
  const evidenceSigner = getAddress(required("EVIDENCE_SIGNER_ADDRESS"));
  const ownerRaw = process.env.OWNER_ADDRESS?.trim();
  const owner = ownerRaw ? getAddress(ownerRaw) : undefined;
  if (ownerRaw && !isAddress(ownerRaw)) throw new Error("OWNER_ADDRESS is invalid");

  const artifact = JSON.parse(readFileSync(resolve("out/GiftEscrow.sol/GiftEscrow.json"), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
  const abi: Abi = artifact.abi;

  const account = privateKeyToAccount((deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as Hex);
  const transport = http(monadRpcUrl());
  const publicClient = createPublicClient({ chain: monadChain, transport });
  const walletClient = createWalletClient({ account, chain: monadChain, transport });

  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to deploy: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < MIN_DEPLOYER_BALANCE) {
    throw new Error(`Refusing to deploy: deployer ${account.address} holds ${formatEther(balance)} MON, below the 10 MON reserve plus margin`);
  }
  const tokenCode = await publicClient.getCode({ address: AUSD_ADDRESS });
  if (!tokenCode || tokenCode === "0x") throw new Error("AUSD has no code at the pinned address");

  console.log(JSON.stringify({ deployer: account.address, balanceMon: formatEther(balance), evidenceSigner, owner: owner ?? account.address }, null, 2));

  const constructorArguments = encodeAbiParameters([{ type: "address" }, { type: "address" }], [AUSD_ADDRESS, evidenceSigner]);
  const deployGas = addMonadGasBuffer(
    await publicClient.estimateGas({
      account: account.address,
      data: (artifact.bytecode.object + constructorArguments.slice(2)) as Hex,
    }),
  );
  const deployHash = await walletClient.deployContract({ abi, bytecode: artifact.bytecode.object, args: [AUSD_ADDRESS, evidenceSigner], gas: deployGas });
  const deployReceipt = await waitForFinality(publicClient, deployHash);
  const address = deployReceipt.contractAddress;
  if (!address) throw new Error("Deployment produced no contract address");
  const code = await publicClient.getCode({ address });
  console.log(JSON.stringify({ step: "deployed", address, txHash: deployHash, codeHash: keccak256(code ?? "0x") }, null, 2));

  const steps: Array<{ name: string; functionName: string; args: readonly unknown[] }> = [
    { name: "register Duolingo goal", functionName: "registerGoal", args: [GOAL_TYPE_DUOLINGO_XP, DUOLINGO_GOAL_PROVIDER_ID] },
    { name: "unpause creation", functionName: "setCreationPaused", args: [false] },
    { name: "unpause check-in", functionName: "setCheckInPaused", args: [false] },
  ];
  if (owner && owner !== account.address) steps.push({ name: "transfer ownership", functionName: "transferOwnership", args: [owner] });

  for (const step of steps) {
    const gas = addMonadGasBuffer(
      await publicClient.estimateGas({
        account: account.address,
        to: address,
        data: encodeFunctionData({ abi, functionName: step.functionName, args: step.args }),
      }),
    );
    const hash = await walletClient.writeContract({ address, abi, functionName: step.functionName, args: step.args, gas });
    await waitForFinality(publicClient, hash);
    console.log(JSON.stringify({ step: step.name, txHash: hash }));
  }

  console.log("\nAdd to .env.local:");
  console.log(`GIFT_ESCROW_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_GIFT_ESCROW_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error("DEPLOY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
