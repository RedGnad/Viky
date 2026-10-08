import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeDeployData,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseEther,
  zeroAddress,
  type Abi,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import {
  AGORA_FAUCET_ABI,
  AGORA_PAIR_ABI,
  AGORA_TESTNET,
  AGORA_TESTNET_RUN,
  AGORA_WHITELISTER_ABI,
  agoraSwapCall,
  APPROVED_SWAPPER,
  MAINNET_EXIT_ROUTER,
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_RPC_URL,
  oneForOne,
  sameCodeButTheCoin,
  testAusdDomain,
  testnetAddressUrl,
  testnetSourceRecordUrl,
  testnetTransactionUrl,
} from "../src/agora-testnet";
import { RECEIVE_WITH_AUTHORIZATION_TYPES } from "../src/ausd-authorization";
import { exitRouterAbi } from "../src/exit-router-abi";
import { exitNonce, type ExitTerms } from "../src/exit-terms";
import { addMonadGasBuffer } from "../src/monad-gas";
import { AUSD_ADDRESS, PUBLIC_RPC_URL, waitForFinality } from "../src/monad/chain";
import { canonicalSignature } from "../src/signature";

/**
 * The way out through Agora's Instant Settlement pair, for real, on Monad TESTNET (chain 10143) and on nothing else.
 *
 *   pnpm agora:testnet account   makes the test account, once, and prints where to send it test coin
 *   pnpm agora:testnet run       deploys the same ExitRouter as production, set on the test AUSD, and sends one way out
 *   pnpm agora:testnet check     reads a run back from the chain, with no key at all
 *
 * What `run` does, in order: refuses any chain but 10143; refuses a build that is not the code of the way out on
 * mainnet; deploys that code set on Agora's test AUSD; allows the pair, with no pin since the pair forwards to
 * nothing; asks Agora's testnet contract for the swapper's role, which it gives to any address there; has Agora's
 * faucet hand test AUSD to a person's account made for this run; and sends that person's way out: one signature of
 * theirs, the same authorization the app's account signs, carried and paid for by the test account. The person holds
 * none of the chain's coin before or after, and never sends a transaction.
 *
 * It says nothing about mainnet, where the pair swaps only for an address Agora approved, and none of Viky's is.
 *
 * No setting of the app is read: this file loads no `.env`, and the only key it opens is the test account's, from a
 * file of its own that `account` writes and nothing prints. A key that ever sent a transaction or held anything on
 * Monad mainnet is refused. The person's key is made in memory for one run and kept nowhere: what it is left holding
 * is test coin. The copy's owner is the test account, which guards nothing of value here; the copies on mainnet
 * belong to the Safe.
 */

const KEY_FILE = join(homedir(), ".viky-agora-testnet.key");
/** Ten dollars of test AUSD: the amount the pair was quoted for, and the one the fork test walks. */
const AMOUNT = 10_000_000n;
/** Five transactions that carry no value, the deployment by far the largest: about 0.25 at the price read on 8 Oct 2026. */
const NEEDED_TEST_MON = parseEther("0.3");
const TERMS_LAST_SECONDS = 15n * 60n;

const ROUTER_ABI = exitRouterAbi as unknown as Abi;
const AUTHORIZATION_STATE_ABI = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const satisfies Abi;

const rpcUrl = process.env.MONAD_TESTNET_RPC_URL?.trim() || MONAD_TESTNET_RPC_URL;
const testnet = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
/** Mainnet is only ever read here, through the public endpoint: the code of the way out, and whether a key lived there. */
const mainnet = createPublicClient({ chain: monad, transport: http(PUBLIC_RPC_URL) });

function flag(name: string): string | undefined {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3).trim() : undefined;
}

function readTestKey(): Hex {
  if (!existsSync(KEY_FILE)) throw new Error(`There is no test account yet. Make it with: pnpm agora:testnet account`);
  const key = readFileSync(KEY_FILE, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${KEY_FILE} does not hold a key`);
  return key as Hex;
}

async function refuseAnotherChain(): Promise<void> {
  const chainId = await testnet.getChainId();
  if (chainId !== MONAD_TESTNET_CHAIN_ID) throw new Error(`Refusing: chain ${chainId} is not Monad testnet (${MONAD_TESTNET_CHAIN_ID})`);
}

/** A test key is one made for this and for nothing else. One that lived on mainnet is somebody's real account. */
async function refuseAKeyThatLivedOnMainnet(address: Hex): Promise<void> {
  const [sent, coin, ausd] = await Promise.all([
    mainnet.getTransactionCount({ address }),
    mainnet.getBalance({ address }),
    mainnet.readContract({ address: AUSD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
  ]);
  if (sent !== 0 || coin !== 0n || ausd !== 0n) {
    throw new Error(`Refusing: ${address} has sent a transaction or holds something on Monad mainnet. This takes a key made for the testnet and nothing else`);
  }
}

function account(): void {
  if (existsSync(KEY_FILE)) {
    console.log(`The test account is already there: ${privateKeyToAccount(readTestKey()).address}`);
  } else {
    const key = generatePrivateKey();
    // `wx` refuses to write over a file that appeared meanwhile, and the mode keeps it to this user.
    writeFileSync(KEY_FILE, `${key}\n`, { mode: 0o600, flag: "wx" });
    console.log(`Made the test account: ${privateKeyToAccount(key).address}`);
    console.log(`Its key is in ${KEY_FILE}, readable by you alone. It was not printed.`);
  }
  console.log(`\nSend it ${formatEther(NEEDED_TEST_MON)} test MON or more on Monad testnet (the faucet Monad's documentation names is https://faucet.monad.xyz).`);
  console.log("Then: pnpm agora:testnet run");
}

/**
 * Agora's faucet gives once in a while to everybody together, a minute when this was written, and refuses in between.
 * So a run that follows another, ours or anybody's, waits for the chain's clock to pass it.
 */
async function waitForTheFaucet(): Promise<void> {
  for (let asked = 0; asked < 200; asked += 1) {
    const [last, every, block] = await Promise.all([
      testnet.readContract({ address: AGORA_TESTNET.faucet, abi: AGORA_FAUCET_ABI, functionName: "lastDripTimestamp" }),
      testnet.readContract({ address: AGORA_TESTNET.faucet, abi: AGORA_FAUCET_ABI, functionName: "maxDripFrequency" }),
      testnet.getBlock(),
    ]);
    if (block.timestamp > last + every) return;
    if (asked === 0) console.log(`Agora's faucet gives once every ${every} seconds to everybody together: waiting ${last + every - block.timestamp + 1n} more`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Agora's faucet stayed busy. Run again in a minute, with --router= to keep the copy already deployed");
}

type RunRecord = { day: string; router: Hex; exit: Hex; block: number; payer: Hex; ausdIn: bigint; otherCoinOut: bigint };

function dayOf(timestamp: bigint): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Number(timestamp) * 1000));
}

function printRecord(record: RunRecord): void {
  console.log("\nThe run, for AGORA_TESTNET_RUN in src/agora-testnet.ts:");
  console.log(
    [
      "{",
      `  day: "${record.day}",`,
      `  router: "${record.router}",`,
      `  exit: "${record.exit}",`,
      `  block: ${record.block},`,
      `  payer: "${record.payer}",`,
      `  ausdIn: ${record.ausdIn}n,`,
      `  otherCoinOut: ${record.otherCoinOut}n,`,
      "}",
    ].join("\n"),
  );
  console.log(`\nThe way out: ${testnetTransactionUrl(record.exit)}`);
  console.log(`The copy of the router: ${testnetAddressUrl(record.router)}`);
}

/** The code at a testnet address against the way out's on mainnet: the same but for the coin, or a refusal that says so. */
async function sameCodeAsMainnet(router: Hex): Promise<void> {
  const [here, there] = await Promise.all([testnet.getCode({ address: router }), mainnet.getCode({ address: MAINNET_EXIT_ROUTER })]);
  if (!here || !there) throw new Error("One of the two copies has no code");
  if (!sameCodeButTheCoin({ code: here, coin: AGORA_TESTNET.ausd }, { code: there, coin: AUSD_ADDRESS })) {
    throw new Error(`The code at ${router} is not the code of the way out on mainnet (${MAINNET_EXIT_ROUTER})`);
  }
  console.log(JSON.stringify({ step: "same code as the way out on mainnet, but for the coin", bytes: (here.length - 2) / 2, codeHash: keccak256(here) }));
}

/** What a way out left on the chain: the router's own event, read from the receipt and from nothing we wrote down. */
async function readExit(hash: Hex): Promise<RunRecord> {
  const receipt = await testnet.getTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.to) throw new Error(`${hash} did not succeed`);
  const router = getAddress(receipt.to);
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== router) continue;
    let event: { eventName: string; args: unknown };
    try {
      event = decodeEventLog({ abi: ROUTER_ABI, data: log.data, topics: log.topics }) as { eventName: string; args: unknown };
    } catch {
      continue;
    }
    if (event.eventName !== "Exited") continue;
    const args = event.args as { payer: Hex; amountIn: bigint; tokenOut: Hex; amountOut: bigint; exchange: Hex };
    if (getAddress(args.exchange) !== getAddress(AGORA_TESTNET.pair)) throw new Error(`${hash} went through ${args.exchange}, not Agora's pair`);
    if (getAddress(args.tokenOut) !== getAddress(AGORA_TESTNET.otherCoin)) throw new Error(`${hash} paid out ${args.tokenOut}, not the pair's other coin`);
    const block = await testnet.getBlock({ blockNumber: receipt.blockNumber });
    return { day: dayOf(block.timestamp), router, exit: hash, block: Number(receipt.blockNumber), payer: getAddress(args.payer), ausdIn: args.amountIn, otherCoinOut: args.amountOut };
  }
  throw new Error(`${hash} carries no way out`);
}

async function run(): Promise<void> {
  await refuseAnotherChain();
  const sender = privateKeyToAccount(readTestKey());
  await refuseAKeyThatLivedOnMainnet(sender.address);
  const wallet = createWalletClient({ account: sender, chain: monadTestnet, transport: http(rpcUrl) });

  const artifact = JSON.parse(readFileSync(resolve("out/ExitRouter.sol/ExitRouter.json"), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
    deployedBytecode: { object: Hex };
  };
  // Before anything is paid for: the build in this folder is the code on mainnet, or nothing is deployed. In the
  // build the coin's place is still empty, which is what the zero address stands for here.
  const mainnetCode = await mainnet.getCode({ address: MAINNET_EXIT_ROUTER });
  if (!mainnetCode || !sameCodeButTheCoin({ code: artifact.deployedBytecode.object, coin: zeroAddress }, { code: mainnetCode, coin: AUSD_ADDRESS })) {
    throw new Error("Refusing: what `forge build` made here is not the code of the way out on mainnet. Build the commit production runs");
  }

  async function send(step: string, to: Hex, data: Hex): Promise<TransactionReceipt> {
    const gas = addMonadGasBuffer(await testnet.estimateGas({ account: sender.address, to, data }));
    const hash = await wallet.sendTransaction({ to, data, gas });
    const receipt = await waitForFinality(testnet as unknown as PublicClient, hash);
    if (receipt.status !== "success") throw new Error(`${step}: the transaction reverted (${hash})`);
    console.log(JSON.stringify({ step, txHash: hash }));
    return receipt;
  }

  const given = flag("router");
  if (given && !isAddress(given)) throw new Error("--router is not an address");
  let router: Hex;
  if (given) {
    // A run that stopped after its deployment goes on with the copy it already paid for.
    router = getAddress(given);
  } else {
    const held = await testnet.getBalance({ address: sender.address });
    if (held < NEEDED_TEST_MON) {
      throw new Error(`The test account ${sender.address} holds ${formatEther(held)} test MON, and a run takes ${formatEther(NEEDED_TEST_MON)}`);
    }
    const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [AGORA_TESTNET.ausd] });
    const gas = addMonadGasBuffer(await testnet.estimateGas({ account: sender.address, data }));
    const hash = await wallet.sendTransaction({ data, gas });
    const receipt = await waitForFinality(testnet as unknown as PublicClient, hash);
    if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`The deployment reverted (${hash})`);
    router = getAddress(receipt.contractAddress);
    console.log(JSON.stringify({ step: "deployed the same ExitRouter, set on the test AUSD", router, txHash: hash }));
    console.log(`If a later step stops, go on with: pnpm agora:testnet run --router=${router}`);
  }
  await sameCodeAsMainnet(router);
  const token = (await testnet.readContract({ address: router, abi: ROUTER_ABI, functionName: "token" })) as Hex;
  if (getAddress(token) !== getAddress(AGORA_TESTNET.ausd)) throw new Error(`${router} is not set on the test AUSD`);

  if (!((await testnet.readContract({ address: router, abi: ROUTER_ABI, functionName: "allowedExchanges", args: [AGORA_TESTNET.pair] })) as boolean)) {
    // No pin: asked where it points, the pair does not answer, so there is nothing that could move under it.
    await send("allowed Agora's pair, with no pin", router, encodeFunctionData({ abi: ROUTER_ABI, functionName: "setExchangeAllowed", args: [AGORA_TESTNET.pair, true, zeroAddress] }));
  }
  const approved = () => testnet.readContract({ address: AGORA_TESTNET.pair, abi: AGORA_PAIR_ABI, functionName: "hasRole", args: [APPROVED_SWAPPER, router] });
  if (!(await approved())) {
    await send("asked Agora's testnet contract for the swapper's role", AGORA_TESTNET.whitelister, encodeFunctionData({ abi: AGORA_WHITELISTER_ABI, functionName: "setApprovedSwapper", args: [router] }));
    if (!(await approved())) throw new Error("The pair still does not know the router as an approved swapper");
  }

  // The person: an account made for this run, which never holds the chain's coin and never sends anything.
  const person = privateKeyToAccount(generatePrivateKey());
  await waitForTheFaucet();
  await send("Agora's faucet handed test AUSD to the person", AGORA_TESTNET.faucet, encodeFunctionData({ abi: AGORA_FAUCET_ABI, functionName: "requestFunds", args: [person.address] }));
  const balanceOf = (coin: Hex, who: Hex) => testnet.readContract({ address: coin, abi: erc20Abi, functionName: "balanceOf", args: [who] });
  const heldBefore = await balanceOf(AGORA_TESTNET.ausd, person.address);
  if (heldBefore < AMOUNT) throw new Error(`The faucet gave the person ${heldBefore} units of test AUSD, fewer than the ${AMOUNT} of this run`);

  const owed = oneForOne(AMOUNT);
  const quoted = await testnet.readContract({ address: AGORA_TESTNET.pair, abi: AGORA_PAIR_ABI, functionName: "getAmountsOut", args: [AMOUNT, [AGORA_TESTNET.ausd, AGORA_TESTNET.otherCoin]] });
  if (quoted[1] !== owed) throw new Error(`The pair quotes ${quoted[1]} for ${AMOUNT}, which is not one for one (${owed})`);

  // The chain's clock, not this machine's: the pair and the coin both compare the deadline with it.
  const now = (await testnet.getBlock()).timestamp;
  const deadline = now + TERMS_LAST_SECONDS;
  // The floor is the whole amount: at a fixed price nothing less can come back, and nothing less is accepted.
  const callData = agoraSwapCall({ amountIn: AMOUNT, amountOutMin: owed, to: router, deadline });
  const terms: ExitTerms = {
    payer: person.address,
    amount: AMOUNT,
    tokenOut: AGORA_TESTNET.otherCoin,
    minOut: owed,
    exchange: AGORA_TESTNET.pair,
    callHash: keccak256(callData),
    deadline,
    salt: `0x${randomBytes(32).toString("hex")}`,
  };
  const nonce = exitNonce(terms);
  // The one signature: the coin's own authorization, whose nonce is the hash of the terms, as on mainnet.
  const signature = canonicalSignature(
    await person.signTypedData({
      domain: testAusdDomain(),
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: { from: person.address, to: router, value: AMOUNT, validAfter: 0n, validBefore: deadline, nonce },
    }),
  );
  const authorization = {
    validAfter: 0n,
    validBefore: deadline,
    v: Number.parseInt(signature.slice(130, 132), 16),
    r: `0x${signature.slice(2, 66)}` as Hex,
    s: `0x${signature.slice(66, 130)}` as Hex,
  };

  const exitData = encodeFunctionData({ abi: ROUTER_ABI, functionName: "exit", args: [terms, authorization, callData] });
  // Asked of the node first, as the relayer does: a refusal costs nothing and says its name.
  await testnet.call({ account: sender.address, to: router, data: exitData });
  const receipt = await send("the way out, through Agora's pair", router, exitData);

  const record = await readExit(receipt.transactionHash);
  const [personCoin, personSent, personOther, personAusd, routerAusd, routerOther, spent] = await Promise.all([
    testnet.getBalance({ address: person.address }),
    testnet.getTransactionCount({ address: person.address }),
    balanceOf(AGORA_TESTNET.otherCoin, person.address),
    balanceOf(AGORA_TESTNET.ausd, person.address),
    balanceOf(AGORA_TESTNET.ausd, router),
    balanceOf(AGORA_TESTNET.otherCoin, router),
    testnet.readContract({ address: AGORA_TESTNET.ausd, abi: AUTHORIZATION_STATE_ABI, functionName: "authorizationState", args: [person.address, nonce] }),
  ]);
  const held: Array<[boolean, string]> = [
    [record.payer === person.address && record.ausdIn === AMOUNT, "the event names the person and the amount they signed for"],
    [record.otherCoinOut === owed && personOther === owed, "one for one came back, and all of it is the person's"],
    [personAusd === heldBefore - AMOUNT, "exactly what they signed for was taken"],
    [routerAusd === 0n && routerOther === 0n, "the router keeps nothing"],
    [personCoin === 0n && personSent === 0, "the person never held the chain's coin and never sent a transaction"],
    [spent, "the terms are spent, once"],
  ];
  for (const [ok, what] of held) console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (held.some(([ok]) => !ok)) throw new Error("The way out was sent, and what it left is not what was expected");
  printRecord(record);
}

async function check(): Promise<void> {
  await refuseAnotherChain();
  const asked = flag("tx");
  if (asked && !/^0x[0-9a-fA-F]{64}$/.test(asked)) throw new Error("--tx is not a transaction");
  const hash = (asked as Hex | undefined) ?? AGORA_TESTNET_RUN?.exit;
  if (!hash) throw new Error("No run is recorded yet, and none was named with --tx=");
  const found = await readExit(hash);
  await sameCodeAsMainnet(found.router);
  const sent = await testnet.getTransactionCount({ address: found.payer });
  // The explorer's registry of sources, asked as anybody can ask it: an answer that is not an exact match, or no
  // answer at all, is said as it is.
  let source = "the registry did not answer";
  try {
    const record = (await (await fetch(testnetSourceRecordUrl(found.router), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) })).json()) as { runtimeMatch?: unknown };
    source = typeof record.runtimeMatch === "string" ? record.runtimeMatch : "no record of this address";
  } catch {
    // Kept as "did not answer".
  }
  const held: Array<[boolean, string]> = [
    [source === "exact_match", `the copy's source in the explorer's registry: ${source}`],
    [found.otherCoinOut === oneForOne(found.ausdIn), `${found.ausdIn} units of test AUSD gave ${found.otherCoinOut} of the other coin: one for one`],
    [sent === 0, "the account that signed has never sent a transaction"],
  ];
  const recorded = AGORA_TESTNET_RUN;
  if (recorded && recorded.exit.toLowerCase() === hash.toLowerCase()) {
    const same =
      getAddress(recorded.router) === found.router &&
      getAddress(recorded.payer) === found.payer &&
      recorded.block === found.block &&
      recorded.ausdIn === found.ausdIn &&
      recorded.otherCoinOut === found.otherCoinOut &&
      recorded.day === found.day;
    held.push([same, "what src/agora-testnet.ts records is what the chain says"]);
  }
  for (const [ok, what] of held) console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (held.some(([ok]) => !ok)) throw new Error("The chain does not say what was recorded");
  printRecord(found);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "account") return account();
  if (mode === "run") return run();
  if (mode === "check") return check();
  throw new Error("Say which: account, run or check");
}

main().catch((error) => {
  console.error("AGORA_TESTNET_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
