import { encodeFunctionData, type Abi, type Hex } from "viem";
import { AUSD } from "./coins";

/**
 * Agora's Instant Settlement, as far as Viky has walked it: on Monad TESTNET (chain 10143) and nowhere else.
 *
 * What it is (docs.agora.finance/instant-settlement, read 8 Oct 2026): a pair that swaps at a fixed price, with the
 * interface of a Uniswap v2 router, out of Agora's own liquidity. On mainnet the pair swaps only for an address Agora
 * has approved, and its documentation says it approves only users it has verified (the role APPROVED_SWAPPER). No
 * address of Viky's is approved. On testnet a contract of Agora's gives that role to whichever address is named, by
 * anybody.
 *
 * What Viky does with it there: the way out, with the same `ExitRouter` as production, deployed a second time and set
 * on the test AUSD. The contract already keeps a list of the exchanges its owner allowed, so the pair is one more
 * line in that list and nothing else changes: one signature of the person, sent by somebody else, for an account that
 * holds none of the chain's coin. Only the way out: the pair's other test coin takes no signed transfer, so the
 * converter of card payments, which is the same contract set on a coin that does, has no twin here.
 *
 * Nothing in this file is read by a screen a person uses, by a route, or by the path on mainnet. The addresses are
 * those of github.com/agora-finance/stable-swap-examples, branch monad, read on 8 Oct 2026, and
 * test/AgoraPairFork.t.sol checks each of them against the chain.
 */

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
/**
 * One of the two explorers Monad's documentation names for the testnet (docs.monad.xyz, "Network Information -
 * Testnet"). Opened on 8 Oct 2026 for the run below: it shows the transaction, its success and its four transfers to
 * a plain reader, where the other one held its pages behind a check of the browser.
 */
export const MONAD_TESTNET_EXPLORER = "https://testnet.monadscan.com";

export const AGORA_TESTNET = {
  /** The Instant Settlement pair: the other coin as its token0, the test AUSD as its token1. */
  pair: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
  /** Agora's test AUSD: six decimals, EIP-3009, the same signing name and version as AUSD on mainnet. */
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  /** The pair's other test coin, eighteen decimals. It takes no signed transfer. */
  otherCoin: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D",
  /** Holds the whitelister's role on the testnet pairs, and gives the swapper's role to any address named. */
  whitelister: "0x7c10F56d6f04a51376393a1C3670e966863F6BD5",
  /** Hands ten thousand test AUSD to any address named, once a minute for everybody together (read 8 Oct 2026). */
  faucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
} as const satisfies Record<string, Hex>;

/** The way out on mainnet (README, "Contracts"): the code the testnet copy is compared with, byte for byte. */
export const MAINNET_EXIT_ROUTER = "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223" as const;

/** The role the pair asks of whoever calls it. */
export const APPROVED_SWAPPER = "APPROVED_SWAPPER";

/** The other coin counts eighteen decimals where AUSD counts six: one for one is this many times more units. */
export const OTHER_COIN_PER_AUSD_UNIT = 10n ** 12n;

/** What the pair owes for an amount of AUSD at its fixed price: the same count of the other coin, nothing taken. */
export function oneForOne(ausdUnits: bigint): bigint {
  if (ausdUnits <= 0n) throw new Error("An amount is more than nothing");
  return ausdUnits * OTHER_COIN_PER_AUSD_UNIT;
}

export const AGORA_PAIR_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "string" },
      { name: "member", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
] as const satisfies Abi;

export const AGORA_WHITELISTER_ABI = [
  { type: "function", name: "setApprovedSwapper", stateMutability: "nonpayable", inputs: [{ name: "swapper", type: "address" }], outputs: [] },
] as const satisfies Abi;

export const AGORA_FAUCET_ABI = [
  { type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] },
  { type: "function", name: "lastDripTimestamp", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxDripFrequency", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const satisfies Abi;

/**
 * The exact bytes the way out says to the pair: AUSD in, the other coin out, to the router, which hands it on to the
 * person. The person signs the hash of these bytes inside the terms, so nobody who carries them can change one.
 */
export function agoraSwapCall(input: { amountIn: bigint; amountOutMin: bigint; to: Hex; deadline: bigint }): Hex {
  return encodeFunctionData({
    abi: AGORA_PAIR_ABI,
    functionName: "swapExactTokensForTokens",
    args: [input.amountIn, input.amountOutMin, [AGORA_TESTNET.ausd, AGORA_TESTNET.otherCoin], input.to, input.deadline],
  });
}

/**
 * What the person signs under on testnet. The name and the version are AUSD's own on mainnet (src/coins.ts), read
 * from there and not typed again: the test coin refuses a signature made under any other, which the fork test pins.
 */
export function testAusdDomain() {
  return {
    name: AUSD.domain!.name,
    version: AUSD.domain!.version,
    chainId: MONAD_TESTNET_CHAIN_ID,
    verifyingContract: AGORA_TESTNET.ausd,
  } as const;
}

/**
 * Whether two deployed copies are the same code but for the coin each was set on at its deployment, which the
 * compiler writes into the code itself. Everything else is compared, the compiler's own fingerprint of the source
 * included.
 */
export function sameCodeButTheCoin(one: { code: Hex; coin: Hex }, other: { code: Hex; coin: Hex }): boolean {
  const blank = (copy: { code: Hex; coin: Hex }) => copy.code.toLowerCase().split(copy.coin.slice(2).toLowerCase()).join("0".repeat(40));
  return one.code.length > 2 && one.code.length === other.code.length && blank(one) === blank(other);
}

/**
 * What the market path cost the one time it was measured with real amounts: the conversion of a card payment on
 * Monad mainnet, 3 Oct 2026 at 09:47 UTC, block 110,148,279, through the converter and the exchange it is opened to.
 * Read from the transaction's own transfers on 8 Oct 2026: 7.927876 USDC taken from the person, 7.914524 AUSD
 * handed back to them.
 */
export const MARKET_PATH_MEASURE = {
  transaction: "0x533ec0746493e0670029b917887b8e15376380a4a9c7bb82706b2de910ed1616",
  day: "3 Oct 2026",
  block: 110_148_279,
  usdcIn: 7_927_876n,
  ausdOut: 7_914_524n,
} as const;

/** The part of what went in that did not come back, in percent to three decimals, cut and not rounded up. */
export function lostToTheMarket(measure: { usdcIn: bigint; ausdOut: bigint } = MARKET_PATH_MEASURE): string {
  const thousandths = ((measure.usdcIn - measure.ausdOut) * 100_000n) / measure.usdcIn;
  return `${thousandths / 1000n}.${(thousandths % 1000n).toString().padStart(3, "0")}`;
}

/** One way out that ran on Monad testnet through Agora's pair, as the script printed it. */
export type AgoraTestnetRun = Readonly<{
  day: string;
  /** The copy of `ExitRouter` deployed on testnet for it. */
  router: Hex;
  /** The way out itself. */
  exit: Hex;
  block: number;
  /** The account that signed. It never held the chain's coin and never sent a transaction. */
  payer: Hex;
  ausdIn: bigint;
  otherCoinOut: bigint;
}>;

/**
 * The run the judges page names, or nothing while there is none: no line says a transaction happened before one did.
 * Filled from what `pnpm agora:testnet run` printed on 8 Oct 2026, the one run made; `pnpm agora:testnet check` reads
 * it back from the chain.
 */
export const AGORA_TESTNET_RUN = {
  day: "8 Oct 2026",
  router: "0xE231C0310C4C6910f1D3A349c803AA94cdc18e3F",
  exit: "0x854e8518cc0c1be79a90500c7f2129deec0232bd8ee1f2d8edbf14c70453b95c",
  block: 69361763,
  payer: "0xb6102414368c0410eD4ab16552fBab7ae4148e82",
  ausdIn: 10000000n,
  otherCoinOut: 10000000000000000000n,
} as AgoraTestnetRun | null;

export function testnetTransactionUrl(hash: Hex): string {
  return `${MONAD_TESTNET_EXPLORER}/tx/${hash}`;
}

export function testnetAddressUrl(address: Hex): string {
  return `${MONAD_TESTNET_EXPLORER}/address/${address}`;
}
