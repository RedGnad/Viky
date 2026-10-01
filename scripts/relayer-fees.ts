/**
 * What Viky's relayer has paid, read from the chain (pnpm relayer:fees). Read only, no key, no account.
 *
 * Every step of a gift is submitted and paid for by one account, the relayer, so neither person ever holds the
 * chain's coin. This counts what that account has sent and what each transaction cost, for the figures the README
 * gives under "Why Monad": the count is the account's own on the chain, and each fee is the limit the transaction
 * declared times the price it paid, because Monad charges the limit and not the gas used
 * (https://docs.monad.xyz/developer-essentials/gas-pricing).
 *
 * The public RPC has no call that lists an account's transactions, so the list of hashes is read from the explorer's
 * own page (monadscan.com, 100 a page), and then nothing of the explorer is trusted: every transaction and its
 * receipt are read back from the RPC, and the count is checked against the account's nonce. A hash the explorer
 * missed shows as a missing number, and the script says so instead of printing a total.
 *
 *   pnpm relayer:fees                 the relayer of viky.cash
 *   pnpm relayer:fees 0x...           any other account
 */

// A module of its own, so its names are not the whole program's.
export {};

const RELAYER = "0x150d3066f615FC012a40e7779db748d53F7Ccfe4";
const RPC = process.env.MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz";
const EXPLORER = "https://monadscan.com";
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const answer = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await answer.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

/** The hashes the explorer lists for an account, page after page until one adds nothing. */
async function listedHashes(account: string): Promise<string[]> {
  const seen = new Set<string>();
  for (let page = 1; page <= 200; page += 1) {
    const html = await (await fetch(`${EXPLORER}/txs?a=${account}&ps=100&p=${page}`, { headers: { "user-agent": BROWSER, accept: "text/html" } })).text();
    const before = seen.size;
    for (const found of html.matchAll(/\/tx\/(0x[0-9a-f]{64})/g)) seen.add(found[1]);
    if (seen.size === before) break;
  }
  return [...seen];
}

type Sent = { from: string; nonce: string; gas: string };
type Receipt = { effectiveGasPrice: string };

async function main(): Promise<void> {
  const account = (process.argv[2] ?? RELAYER).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(account)) throw new Error("Give an account as 0x and forty hexadecimal characters");
  const hashes = await listedHashes(account);
  const numbers = new Set<number>();
  let fee = 0n;
  for (const hash of hashes) {
    const sent = await rpc<Sent | null>("eth_getTransactionByHash", [hash]);
    // The explorer also lists what the account received: only what it sent was paid for by it.
    if (!sent || sent.from.toLowerCase() !== account) continue;
    const receipt = await rpc<Receipt | null>("eth_getTransactionReceipt", [hash]);
    if (!receipt) continue;
    numbers.add(Number(sent.nonce));
    fee += BigInt(sent.gas) * BigInt(receipt.effectiveGasPrice);
  }
  const count = Number(await rpc<string>("eth_getTransactionCount", [account, "latest"]));
  const missing = Array.from({ length: count }, (_, number) => number).filter((number) => !numbers.has(number));
  console.log(`account            ${account}`);
  console.log(`read at            ${new Date().toISOString()}`);
  console.log(`transactions sent  ${count} (the account's own count on the chain)`);
  if (missing.length > 0) {
    console.log(`not found          ${missing.length} of them (numbers ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", ..." : ""}): no total is given`);
    process.exitCode = 1;
    return;
  }
  const mon = Number(fee) / 1e18;
  console.log(`fees paid          ${mon.toFixed(6)} MON in all, the declared limit times the price of each`);
  console.log(`on average         ${(mon / Math.max(1, count)).toFixed(6)} MON a transaction`);
}

main().catch((error) => {
  console.error("RELAYER_FEES_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
