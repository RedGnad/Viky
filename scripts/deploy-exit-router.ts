import "../src/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
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
import { kuruQuote, NATIVE_MON } from "../src/kuru";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadRpcUrl, waitForFinality } from "../src/monad/chain";

/**
 * Deploys ExitRouter to Monad mainnet and opens it to exactly one exchange.
 *
 * The allowlisting is the delicate half and it is a measurement, not a typed constant. The address a real
 * quote asks us to call holds no logic of its own and forwards to a second contract its own owner can
 * replace at any moment (D55, D58). So this asks the exchange, on chain, where it currently points, and pins
 * that; the contract then checks it again on every payout and refuses if it has moved. Nothing here is taken
 * on trust: the exchange must be the one a live quote actually targets, and it must have code.
 *
 * Inputs (.env): DEPLOYER_PRIVATE_KEY, optional OWNER_ADDRESS (a multisig to hand ownership to),
 * optional MONAD_RPC_URL. Prints what to add to .env.local.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

const MIN_DEPLOYER_BALANCE = parseEther("11");
/** Small enough to cost nothing, large enough that the exchange returns a real route. */
const PROBE_AMOUNT = 3_000_000n;

const FORWARDER_ABI = [
  { type: "function", name: "getRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const satisfies Abi;

async function main() {
  const deployerKey = required("DEPLOYER_PRIVATE_KEY");
  const ownerRaw = process.env.OWNER_ADDRESS?.trim();
  if (ownerRaw && !isAddress(ownerRaw)) throw new Error("OWNER_ADDRESS is invalid");
  const owner = ownerRaw ? getAddress(ownerRaw) : undefined;

  const artifact = JSON.parse(readFileSync(resolve("out/ExitRouter.sol/ExitRouter.json"), "utf8")) as {
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

  // Which exchange, asked rather than typed: whatever a live quote tells us to call is what we allow.
  const quote = await kuruQuote({ userAddress: account.address, tokenIn: AUSD_ADDRESS, tokenOut: NATIVE_MON, amount: PROBE_AMOUNT });
  const exchange = getAddress(quote.to);
  const declared = process.env.EXIT_EXCHANGE_ADDRESS?.trim();
  if (declared && getAddress(declared) !== exchange) {
    throw new Error(`Refusing to deploy: a live quote targets ${exchange}, but EXIT_EXCHANGE_ADDRESS says ${getAddress(declared)}`);
  }
  const exchangeCode = await publicClient.getCode({ address: exchange });
  if (!exchangeCode || exchangeCode === "0x") throw new Error(`The exchange ${exchange} has no code`);

  // Where it points today. An address with no such function forwards nothing and takes no pin; an address
  // that answers must answer with somewhere real, because a zero answer cannot be pinned and the contract
  // refuses to allow it. This used to pass a zero straight through to the allowlist, which would have
  // deployed the router with the check permanently off and only a printed 0x0 to say so.
  const ZERO = "0x0000000000000000000000000000000000000000";
  let pointsAt: Hex = ZERO;
  let answers = true;
  try {
    pointsAt = (await publicClient.readContract({ address: exchange, abi: FORWARDER_ABI, functionName: "getRouter" })) as Hex;
  } catch {
    // Not a forwarder, which is a fact and not a failure.
    answers = false;
  }
  if (answers) {
    if (getAddress(pointsAt) === ZERO) {
      throw new Error(`Refusing to deploy: ${exchange} answers getRouter with nothing, so its target cannot be pinned`);
    }
    const targetCode = await publicClient.getCode({ address: pointsAt });
    if (!targetCode || targetCode === "0x") throw new Error(`The exchange forwards to ${pointsAt}, which has no code`);
    console.log(`\nRead this before approving the next transaction: ${exchange} currently forwards to ${pointsAt}.`);
    console.log("That is what gets pinned, and the router refuses every payout if it ever changes.\n");
  }

  console.log(JSON.stringify({ deployer: account.address, balanceMon: formatEther(balance), exchange, pointsAt, owner: owner ?? account.address }, null, 2));

  const deployGas = addMonadGasBuffer(
    await publicClient.estimateGas({
      account: account.address,
      data: (artifact.bytecode.object + AUSD_ADDRESS.slice(2).padStart(64, "0")) as Hex,
    }),
  );
  const deployHash = await walletClient.deployContract({ abi, bytecode: artifact.bytecode.object, args: [AUSD_ADDRESS], gas: deployGas });
  const deployReceipt = await waitForFinality(publicClient, deployHash);
  const address = deployReceipt.contractAddress;
  if (!address) throw new Error("Deployment produced no contract address");
  const code = await publicClient.getCode({ address });
  console.log(JSON.stringify({ step: "deployed", address, txHash: deployHash, codeHash: keccak256(code ?? "0x") }, null, 2));

  const steps: Array<{ name: string; functionName: string; args: readonly unknown[] }> = [
    { name: "allow the exchange, pinned where it points today", functionName: "setExchangeAllowed", args: [exchange, true, pointsAt] },
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
  console.log(`EXIT_ROUTER_ADDRESS=${address}`);
  console.log(`EXIT_EXCHANGE_ADDRESS=${exchange}`);
}

main().catch((error) => {
  console.error("DEPLOY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
