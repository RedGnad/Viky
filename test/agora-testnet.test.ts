// Agora's Instant Settlement, on Monad testnet only (the founder, 8 Oct 2026): what the script says to the pair, what
// it refuses, and what the judges page may say of it. The chain itself is asked by test/AgoraPairFork.t.sol and by
// `pnpm agora:testnet check`; nothing here reaches a network.

import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeFunctionData } from "viem";
import { JudgesInstantSettlement } from "../app/judges/JudgesInstantSettlement";
import {
  AGORA_PAIR_ABI,
  AGORA_TESTNET,
  AGORA_TESTNET_RUN,
  agoraSwapCall,
  lostToTheMarket,
  MAINNET_EXIT_ROUTER,
  MARKET_PATH_MEASURE,
  MONAD_TESTNET_CHAIN_ID,
  oneForOne,
  sameCodeButTheCoin,
  testAusdDomain,
  type AgoraTestnetRun,
} from "../src/agora-testnet";
import { AUSD_ADDRESS, MONAD_CHAIN_ID } from "../src/monad/chain";

const SCRIPT = readFileSync("scripts/agora-testnet-exit.ts", "utf8");
const MODULE = readFileSync("src/agora-testnet.ts", "utf8");
const FORK_TEST = readFileSync("test/AgoraPairFork.t.sol", "utf8");

const ROUTER = "0x8bCa87c2661e68f29734ef47ABf520409adeda61";
const A_RUN: AgoraTestnetRun = {
  day: "8 Oct 2026",
  router: ROUTER,
  exit: "0x0e1e0a7663e9c65d5e5974973aa9ba148425f0733c99b15c7f91884e436d0d64",
  block: 69_209_224,
  payer: "0xf9F54dDeCA3E7910911BD81929D807A14862cf19",
  ausdIn: 10_000_000n,
  otherCoinOut: 10_000_000_000_000_000_000n,
};

test("one for one is the same count of a coin that has twelve more decimals", () => {
  assert.equal(oneForOne(10_000_000n), 10_000_000_000_000_000_000n);
  assert.equal(oneForOne(1n), 1_000_000_000_000n);
  assert.throws(() => oneForOne(0n));
});

test("what the way out says to the pair is the Uniswap v2 call, AUSD first, paid to whoever is named", () => {
  const call = agoraSwapCall({ amountIn: 10_000_000n, amountOutMin: oneForOne(10_000_000n), to: ROUTER, deadline: 1_791_449_000n });
  assert.equal(call.slice(0, 10), "0x38ed1739");
  const said = decodeFunctionData({ abi: AGORA_PAIR_ABI, data: call });
  assert.equal(said.functionName, "swapExactTokensForTokens");
  assert.deepEqual(said.args, [10_000_000n, 10_000_000_000_000_000_000n, [AGORA_TESTNET.ausd, AGORA_TESTNET.otherCoin], ROUTER, 1_791_449_000n]);
});

test("the person signs under AUSD's own name and version, on the testnet's chain and the test coin", () => {
  assert.deepEqual(testAusdDomain(), { name: "Agora Dollar", version: "1", chainId: 10143, verifyingContract: AGORA_TESTNET.ausd });
  assert.equal(MONAD_TESTNET_CHAIN_ID, 10143);
  assert.notEqual(MONAD_TESTNET_CHAIN_ID, MONAD_CHAIN_ID);
  assert.notEqual(AGORA_TESTNET.ausd.toLowerCase(), AUSD_ADDRESS.toLowerCase());
});

test("the addresses the script uses are the ones the fork test asks the chain about", () => {
  for (const [name, address] of [
    ["PAIR", AGORA_TESTNET.pair],
    ["AUSD", AGORA_TESTNET.ausd],
    ["CTK", AGORA_TESTNET.otherCoin],
    ["WHITELISTER", AGORA_TESTNET.whitelister],
    ["FAUCET", AGORA_TESTNET.faucet],
  ] as const) {
    assert.ok(FORK_TEST.includes(`address private constant ${name} = ${address};`), name);
  }
});

test("two copies are the same code when only the coin written into them differs, and not otherwise", () => {
  const coinA = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
  const coinB = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
  const around = (coin: string) => `0x6080604052${coin.slice(2).toLowerCase()}5f5ffd${"00".repeat(12)}${coin.slice(2).toLowerCase()}a164736f6c634300081e000a` as const;
  assert.equal(sameCodeButTheCoin({ code: around(coinA), coin: coinA }, { code: around(coinB), coin: coinB }), true);
  // A build, where the coin's place is still empty, against a deployed copy.
  const empty = "0x0000000000000000000000000000000000000000";
  assert.equal(sameCodeButTheCoin({ code: around(empty), coin: empty }, { code: around(coinA), coin: coinA }), true);
  const oneByteOff = around(coinB).replace("5f5ffd", "5f5ffe") as `0x${string}`;
  assert.equal(sameCodeButTheCoin({ code: around(coinA), coin: coinA }, { code: oneByteOff, coin: coinB }), false);
  assert.equal(sameCodeButTheCoin({ code: around(coinA), coin: coinA }, { code: `${around(coinB)}00`, coin: coinB }), false);
  assert.equal(sameCodeButTheCoin({ code: "0x", coin: coinA }, { code: "0x", coin: coinB }), false);
});

test("the market's cost is the measure of 3 Oct, counted from what went in and what came back", () => {
  assert.equal(MARKET_PATH_MEASURE.usdcIn, 7_927_876n);
  assert.equal(MARKET_PATH_MEASURE.ausdOut, 7_914_524n);
  assert.equal(lostToTheMarket(), "0.168");
  assert.equal(lostToTheMarket({ usdcIn: 1_000_000n, ausdOut: 1_000_000n }), "0.000");
  assert.equal(lostToTheMarket({ usdcIn: 1_000_000n, ausdOut: 990_000n }), "1.000");
  // The same transaction the README names for the converter's first real conversion.
  assert.ok(readFileSync("README.md", "utf8").includes(MARKET_PATH_MEASURE.transaction));
});

test("the script speaks to Monad testnet and refuses any other chain before it reads a key or a run", () => {
  assert.match(SCRIPT, /if \(chainId !== MONAD_TESTNET_CHAIN_ID\) throw new Error\(`Refusing: chain/);
  for (const mode of ["run", "check"]) {
    const body = SCRIPT.slice(SCRIPT.indexOf(`async function ${mode}(): Promise<void> {`));
    assert.match(body, /^async function \w+\(\): Promise<void> \{\n {2}await refuseAnotherChain\(\);\n/, mode);
  }
  // Mainnet is read, through the public endpoint, and never written to: the only wallet is made on the testnet.
  assert.equal(SCRIPT.match(/createWalletClient\(/g)?.length, 1);
  assert.ok(SCRIPT.includes("createWalletClient({ account: sender, chain: monadTestnet, transport: http(rpcUrl) })"));
  assert.ok(SCRIPT.includes("const mainnet = createPublicClient({ chain: monad, transport: http(PUBLIC_RPC_URL) });"));
});

test("no setting of the app is read, and the only key is the test account's, from its own file", () => {
  assert.equal(/load-env|dotenv|\.env\.local|\.env\.ops/.test(SCRIPT), false, "the script names a settings file");
  assert.deepEqual([...new Set([...SCRIPT.matchAll(/process\.env\.(\w+)/g)].map((found) => found[1]))], ["MONAD_TESTNET_RPC_URL"]);
  // Nor is the code that holds the relayer's key, or any other production key, loaded into this process.
  assert.equal(/PRIVATE_KEY|from "\.\.\/src\/(relayer|exit-relay|phone-treasury|milestone-attestation)"/.test(SCRIPT), false, "the script loads a module that opens a production key");
  assert.ok(SCRIPT.includes('const KEY_FILE = join(homedir(), ".viky-agora-testnet.key");'));
  // Written once, for this user alone, and never over a file that is already there.
  assert.ok(SCRIPT.includes('writeFileSync(KEY_FILE, `${key}\\n`, { mode: 0o600, flag: "wx" });'));
  // The key is read in two places and printed in none: what is printed of an account is its address.
  for (const line of SCRIPT.split("\n").filter((one) => /console\.(log|error)/.test(one))) {
    const besidesAnAddress = line.replace("privateKeyToAccount(key).address", "").replace("privateKeyToAccount(readTestKey()).address", "").replace("Its key is in", "");
    assert.doesNotMatch(besidesAnAddress, /\bkey\b|readTestKey/, line);
  }
  assert.ok(SCRIPT.includes("await refuseAKeyThatLivedOnMainnet(sender.address);"));
});

test("nothing is deployed unless the build is the code of the way out on mainnet", () => {
  assert.equal(MAINNET_EXIT_ROUTER, "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223");
  assert.ok(readFileSync("README.md", "utf8").includes(MAINNET_EXIT_ROUTER));
  const refusal = SCRIPT.indexOf("is not the code of the way out on mainnet. Build the commit production runs");
  const deployment = SCRIPT.indexOf("encodeDeployData(");
  assert.ok(refusal > 0 && deployment > refusal);
  // And the copy that was deployed is compared again, from the chain, before anything goes through it.
  assert.ok(SCRIPT.indexOf("await sameCodeAsMainnet(router);") > deployment);
});

test("no screen a person uses, no route and no path on mainnet reads any of it", () => {
  const files = ["app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "scripts/*.ts", "instrumentation.ts"].flatMap((pattern) => globSync(pattern));
  const readers = files.filter((file) => file !== "src/agora-testnet.ts" && /agora-testnet|JudgesInstantSettlement/.test(readFileSync(file, "utf8")));
  // The judges page draws the block inside its Agora section; the script is the only other reader.
  assert.deepEqual(readers.sort(), ["app/judges/JudgesAgora.tsx", "app/judges/JudgesInstantSettlement.tsx", "scripts/agora-testnet-exit.ts"]);
});

test("the judges page says nothing of a testnet transaction until one is recorded", () => {
  assert.equal(renderToStaticMarkup(createElement(JudgesInstantSettlement, { run: null })), "");
  if (AGORA_TESTNET_RUN === null) {
    assert.match(MODULE, /export const AGORA_TESTNET_RUN = null as AgoraTestnetRun \| null;/);
    assert.equal(renderToStaticMarkup(createElement(JudgesInstantSettlement)), "");
  }
});

test("with a run, the three lines: the market's cost, the pair one for one with its transaction, why not on mainnet", () => {
  const html = renderToStaticMarkup(createElement(JudgesInstantSettlement, { run: A_RUN })).replace(/&#x27;/g, "'");
  assert.match(html, /Measured once with real amounts, on 3 Oct 2026: a card payment of 7\.927876 USDC came back\s+as 7\.914524 AUSD, 0\.168 % less/);
  assert.ok(html.includes(`href="https://monadvision.com/tx/${MARKET_PATH_MEASURE.transaction}"`));
  assert.match(html, /On 8 Oct 2026, on Monad testnet, the same ExitRouter set on Agora's test AUSD/);
  assert.match(html, /sent 10\.00 test AUSD through Agora's Instant Settlement pair and handed back 10\.00 CTK/);
  assert.ok(html.includes(`href="https://testnet.monadvision.com/tx/${A_RUN.exit}"`));
  assert.ok(html.includes(`href="https://testnet.monadvision.com/address/${ROUTER}"`));
  assert.match(html, /on mainnet the pair\s+swaps only for an address Agora approved, and none of Viky's is/);
  assert.match(html, /No money\s+of a gift has gone through Instant Settlement/);
  // A test coin is a count of a coin, never a sum of dollars, and nothing says it ran where it did not.
  assert.doesNotMatch(html, /\$10|runs on mainnet|live on mainnet/);
  assert.equal(html.match(/<dt/g)?.length, 3);
});

test("a recorded run is one for one and well formed", () => {
  const run = AGORA_TESTNET_RUN;
  if (run === null) return;
  assert.match(run.exit, /^0x[0-9a-f]{64}$/);
  assert.match(run.router, /^0x[0-9a-fA-F]{40}$/);
  assert.match(run.payer, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(run.otherCoinOut, oneForOne(run.ausdIn));
  assert.match(run.day, /^\d{1,2} [A-Z][a-z]{2} 2026$/);
});
