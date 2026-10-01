import "../src/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  getAddress,
  isAddress,
  keccak256,
  parseEther,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { kuruQuote, NATIVE_MON } from "../src/kuru";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadChain, monadTransport, USDC_ADDRESS, waitForFinality } from "../src/monad/chain";

/**
 * Deploys ExitRouter to Monad mainnet and opens it to exactly one exchange.
 *
 * The allowlisting is the delicate half and it is a measurement, not a typed constant. The address a real
 * quote asks us to call holds no logic of its own and forwards to a second contract its own owner can
 * replace at any moment (D55, D58). So this asks the exchange, on chain, where it currently points, and pins
 * that; the contract then checks it again on every payout and refuses if it has moved. Nothing here is taken
 * on trust: the exchange must be the one a live quote actually targets, and it must have code.
 *
 * Inputs (.env): DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS (the multisig ownership is handed to), optional MONAD_RPC_URL.
 * Prints what to add to .env.local.
 *
 * `--takes=usdc` deploys the second copy (the founder, 1 Oct 2026): the same contract set on USDC, which changes USDC
 * a card payment delivered into what a gift holds (src/usdc-router.ts). One corridor then, USDC in and AUSD out, and
 * the exchange a live quote names for it must be the one the app already names. Without the flag, everything here is
 * what it was.
 *
 * `DRY_RUN=1` sends nothing, so it needs no key: `DEPLOYER_ADDRESS` alone answers every read, and the whole plan can
 * be inspected by somebody who holds no secret.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

const MIN_DEPLOYER_BALANCE = parseEther("11");
/** Small enough to cost nothing, large enough that the exchange returns a real route. */
const PROBE_AMOUNT = 3_000_000n;
/** The exchange rate limits per address, so the corridors are asked one at a time with a gap between. */
const PROBE_ATTEMPTS = 4;
const PROBE_SPACING_MS = 3_000;

const FORWARDER_ABI = [
  { type: "function", name: "getRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const satisfies Abi;

/** Which coin the router takes from the person: what a gift holds for the way out, USDC for the conversion. */
const TAKES_USDC = process.argv.includes("--takes=usdc");

async function main() {
  const dryRun = Boolean(process.env.DRY_RUN);
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  const deployerOnly = process.env.DEPLOYER_ADDRESS?.trim();
  if (!deployerKey && !(dryRun && deployerOnly && isAddress(deployerOnly))) required("DEPLOYER_PRIVATE_KEY");
  const takes = TAKES_USDC ? USDC_ADDRESS : AUSD_ADDRESS;
  const ownerRaw = process.env.OWNER_ADDRESS?.trim();
  if (ownerRaw && !isAddress(ownerRaw)) throw new Error("OWNER_ADDRESS is invalid");
  const owner = ownerRaw ? getAddress(ownerRaw) : undefined;

  const artifact = JSON.parse(readFileSync(resolve("out/ExitRouter.sol/ExitRouter.json"), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
  const abi: Abi = artifact.abi;

  const signer = deployerKey ? privateKeyToAccount((deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as Hex) : undefined;
  // With no key, only a dry run gets this far, and an address is all its reads need.
  const account = { address: signer ? signer.address : getAddress(deployerOnly!) };
  const transport = monadTransport();
  const publicClient = createPublicClient({ chain: monadChain, transport });

  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`Refusing to deploy: chain id ${chainId} is not Monad mainnet (${MONAD_CHAIN_ID})`);
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < MIN_DEPLOYER_BALANCE) {
    throw new Error(`Refusing to deploy: deployer ${account.address} holds ${formatEther(balance)} MON, below the 10 MON reserve plus margin`);
  }
  // Ownership does not stay on the key that deployed the contract (the funder's decision, 16 Sep). It carries
  // the exchange allowlist and the sweep and cannot be renounced, so it belongs where it was chosen to belong
  // rather than wherever the deploy happened to run. Encoded here rather than written in a note, because a
  // note is read after the irreversible thing and a refusal is read before it.
  if (!owner) throw new Error("Refusing to deploy: set OWNER_ADDRESS. Ownership is not left on the deployment key");
  if (owner === account.address) {
    throw new Error(`Refusing to deploy: OWNER_ADDRESS is the deployer ${account.address}, so ownership would stay on the deployment key`);
  }
  // Both coins, whichever way round: the one the router takes is fixed for good at deployment, and the other is
  // what it hands back (D76). Deploying against an address with no code would produce a router that can never pay
  // anybody and cannot be pointed elsewhere afterwards.
  const tokenCode = await publicClient.getCode({ address: AUSD_ADDRESS });
  if (!tokenCode || tokenCode === "0x") throw new Error("AUSD has no code at the pinned address");
  const outCode = await publicClient.getCode({ address: USDC_ADDRESS });
  if (!outCode || outCode === "0x") throw new Error("USDC has no code at the pinned address");

  // Which exchange, asked rather than typed: whatever a live quote tells us to call is what we allow. Asked
  // for both corridors, because the two payout services take different coins and the exchange that serves one
  // need not be the one that serves the other. Allowing only the coin we happen to be testing today would
  // leave the other corridor dead on arrival, with no way to open it but another owner transaction.
  const corridors = TAKES_USDC
    ? [{ name: "a card payment in USDC, changed into what a gift holds", tokenOut: AUSD_ADDRESS as string }]
    : [
        { name: "euro rail, stablecoin", tokenOut: USDC_ADDRESS as string },
        { name: "card rail, the chain's own coin", tokenOut: NATIVE_MON as string },
      ];
  const exchanges = new Map<Hex, string[]>();
  for (const corridor of corridors) {
    // Spaced and retried, because the exchange rate limits per address and answers a burst with "no route",
    // which reads exactly like no liquidity and is not: the same quote a few seconds later succeeds. Probing
    // both corridors back to back made this script abort halfway through its own checks, which is a poor
    // property for the one step that cannot be undone.
    let quoted: Awaited<ReturnType<typeof kuruQuote>> | undefined;
    let refusal: unknown;
    for (let attempt = 1; attempt <= PROBE_ATTEMPTS && !quoted; attempt += 1) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, PROBE_SPACING_MS));
      try {
        quoted = await kuruQuote({ userAddress: account.address, tokenIn: takes, tokenOut: corridor.tokenOut, amount: PROBE_AMOUNT });
      } catch (error) {
        refusal = error;
        console.log(`${corridor.name}: attempt ${attempt} of ${PROBE_ATTEMPTS} was refused, waiting`);
      }
    }
    if (!quoted) {
      throw new Error(
        `Refusing to deploy: no quote for the ${corridor.name} after ${PROBE_ATTEMPTS} spaced attempts (${refusal instanceof Error ? refusal.message : String(refusal)})`,
      );
    }
    const where = getAddress(quoted.to);
    console.log(`${corridor.name}: a live quote targets ${where}`);
    exchanges.set(where, [...(exchanges.get(where) ?? []), corridor.name]);
  }
  // Both corridors must land on the same exchange, and this refuses rather than deploying if they ever stop
  // doing so. The contract could hold both in its allowlist, but the app compares a quote against a single
  // EXIT_EXCHANGE_ADDRESS, so a second one would leave the router able to serve a corridor the routes refuse:
  // half a way out, discovered by whoever is trying to be paid. Measured 16 Sep 2026: both route to the same
  // address, so this passes today and fails loudly on the day that changes.
  if (exchanges.size !== 1) {
    const found = [...exchanges].map(([where, serves]) => `${where} (${serves.join(", ")})`).join(" and ");
    throw new Error(`Refusing to deploy: the corridors route to different exchanges, ${found}, and the app can only name one`);
  }
  const exchange = [...exchanges.keys()][0];
  const declared = process.env.EXIT_EXCHANGE_ADDRESS?.trim();
  // The conversion's routes name the exchange by the same setting as the way out's (app/api/fund/convert), so for the
  // second copy the setting must exist already: a copy opened to an exchange the app does not name could serve nobody.
  if (TAKES_USDC && !declared) throw new Error("Refusing to deploy: set EXIT_EXCHANGE_ADDRESS, the exchange the app names, before the copy that takes USDC");
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

  console.log(
    JSON.stringify(
      {
        deployer: account.address,
        balanceMon: formatEther(balance),
        takes,
        // No single coin comes back any more: each exit names its own, so both corridors run through one
        // router (D77). What is printed is which coins the corridors probed above actually asked for.
        givesBack: corridors.map((corridor) => corridor.tokenOut),
        exchange,
        serves: exchanges.get(exchange),
        pointsAt,
        owner: owner ?? account.address,
      },
      null,
      2,
    ),
  );

  // Everything above this line is a read. With DRY_RUN set, nothing below it happens: the one irreversible
  // step in this project can be inspected in full, with real addresses and a real pin target, before anybody
  // approves it. Without that, the only way to see the plan was to carry it out.
  if (dryRun) {
    console.log("\nDRY_RUN: every check passed and nothing was sent. Unset DRY_RUN to deploy for real.");
    return;
  }
  if (!signer) throw new Error("Missing DEPLOYER_PRIVATE_KEY in .env");
  const walletClient = createWalletClient({ account: signer, chain: monadChain, transport });

  // One argument again: the coin coming back is named per exit inside the signed terms, because the two
  // payout services take different ones and a router pinned to either would close the other's corridor (D77).
  const deployGas = addMonadGasBuffer(
    await publicClient.estimateGas({
      account: account.address,
      data: (artifact.bytecode.object + takes.slice(2).padStart(64, "0")) as Hex,
    }),
  );
  const deployHash = await walletClient.deployContract({ abi, bytecode: artifact.bytecode.object, args: [takes], gas: deployGas });
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

  if (TAKES_USDC) {
    // Public on purpose: the browser signs for this address and no other (src/usdc-router.ts).
    console.log("\nSet where the app is built, and in .env.local:");
    console.log(`NEXT_PUBLIC_USDC_ROUTER_ADDRESS=${address}`);
    return;
  }
  console.log("\nAdd to .env.local:");
  console.log(`EXIT_ROUTER_ADDRESS=${address}`);
  console.log(`EXIT_EXCHANGE_ADDRESS=${exchange}`);
}

main().catch((error) => {
  console.error("DEPLOY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
