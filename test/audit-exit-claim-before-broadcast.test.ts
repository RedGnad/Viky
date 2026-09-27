// The way out claims its row before the relayer is asked to pay, and writes the transaction's hash down the moment
// it is submitted (the money path audit of 27 Sep 2026). Ten requests at once for one signed payout send it once, and
// an attempt that dies after sending leaves its hash for the next one to find, rather than a second transaction or a
// row that says "0x".
//
// The real route runs against PGlite and a chain that lives in this file: every call the relayer makes arrives at a
// fake RPC below, so no key of ours, no network and no transaction is involved. The key is the well-known first
// account of the local test chains.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { encodeAbiParameters, encodeErrorResult, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { exitRouterAbi } from "../src/exit-router-abi";
import { attachSignature, configureExitStore, ensureExitSchema, loadExit, newExitId, saveExit } from "../src/exit-store";
import { AUSD_ADDRESS } from "../src/monad/chain";
import type { SqlExecutor } from "../src/proof-session-store";
import { configureRelayCeilingStore, ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { POST as relayPost } from "../app/api/exit/relay/route";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const A = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const ROUTER = "0x00000000000000000000000000000000000E1717";
const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const HASH = `0x${"ab".repeat(32)}` as Hex;
const EARLIER_HASH = `0x${"cd".repeat(32)}` as Hex;
/** A signature is only read back and split here: the fake chain never checks it. */
const SIGNATURE = `0x${"11".repeat(64)}1b` as Hex;

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.EXIT_ROUTER_ADDRESS = ROUTER;
process.env.EXIT_EXCHANGE_ADDRESS = EXCHANGE;
process.env.RELAYER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
delete process.env.MONAD_RPC_URL;
delete process.env.NEXT_PUBLIC_MONAD_RPC_URL;

/** What the fake chain answers, and what it was asked. */
const chain = {
  spent: false,
  simulation: "passes" as "passes" | "TooLittleBack",
  /** Whether the wait for finality can be answered. When it cannot, the transaction is out and nobody hears back. */
  finality: "reached" as "reached" | "unreachable",
  broadcasts: 0,
  estimates: 0,
};

function rpcResult(method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string; data?: Hex } } {
  switch (method) {
    case "eth_chainId":
      return { result: "0x8f" };
    case "eth_getBalance":
      return { result: `0x${(100n * 10n ** 18n).toString(16)}` };
    case "eth_call": {
      const call = params[0] as { to: string };
      if (call.to.toLowerCase() === AUSD_ADDRESS.toLowerCase()) return { result: encodeAbiParameters([{ type: "bool" }], [chain.spent]) };
      if (chain.simulation === "TooLittleBack") {
        return { error: { code: 3, message: "execution reverted", data: encodeErrorResult({ abi: exitRouterAbi as unknown as Abi, errorName: "TooLittleBack" }) } };
      }
      return { result: encodeAbiParameters([{ type: "uint256" }], [2_998_000n]) };
    }
    case "eth_estimateGas":
      chain.estimates += 1;
      return { result: "0xa2c2d" };
    case "eth_getTransactionCount":
      return { result: "0x0" };
    case "eth_maxPriorityFeePerGas":
    case "eth_gasPrice":
      return { result: "0x1" };
    case "eth_blockNumber":
      return { result: "0x64" };
    case "eth_getBlockByNumber":
      if (params[0] === "finalized" && chain.finality === "unreachable") return { error: { code: -32000, message: "the node went away" } };
      return { result: { number: "0x64", hash: `0x${"01".repeat(32)}`, timestamp: "0x1", baseFeePerGas: "0x17c3a1b1e8", gasLimit: "0x1c9c380", gasUsed: "0x0", transactions: [] } };
    case "eth_sendRawTransaction":
      chain.broadcasts += 1;
      // The first transaction is HASH. Any further one gets its own, so each can be told apart and waited for.
      return { result: chain.broadcasts === 1 ? HASH : (`0x${chain.broadcasts.toString(16).padStart(64, "0")}` as Hex) };
    case "eth_getTransactionReceipt":
      return {
        result: {
          transactionHash: params[0],
          blockHash: `0x${"01".repeat(32)}`,
          blockNumber: "0x64",
          transactionIndex: "0x0",
          from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          to: ROUTER,
          cumulativeGasUsed: "0xa2c2d",
          gasUsed: "0xa2c2d",
          effectiveGasPrice: "0x17c3a1b1e9",
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x1",
          type: "0x2",
        },
      };
    default:
      return { error: { code: -32601, message: `the fake chain does not know ${method}` } };
  }
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://rpc.monad.xyz")) throw new Error(`nothing in this test may reach ${url}`);
  const body = JSON.parse(String(init?.body)) as { id: number; method: string; params?: unknown[] };
  const answer = rpcResult(body.method, body.params ?? []);
  process.stderr.write(`${Date.now() % 100000} ${body.method}\n`);
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...answer }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let db: PGlite;
let cookie: string;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

/** Each test comes from its own connection, so the per-connection rate limit of one test never reaches the next. */
let connection = 0;
function relay(id: string, from: string): Request {
  return new Request(`${ORIGIN}/api/exit/relay`, {
    method: "POST",
    headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", cookie, "x-forwarded-for": from },
    body: JSON.stringify({ id }),
  });
}
function nextConnection(): string {
  connection += 1;
  return `198.51.100.${connection}`;
}

async function signedTerms(): Promise<string> {
  const id = newExitId();
  await saveExit({
    id,
    account: A.address,
    amount: 3_000_000n,
    tokenOut: USDC as Hex,
    minOut: 2_997_000n,
    exchange: EXCHANGE as Hex,
    callData: "0xce1e7030",
    callHash: `0x${"11".repeat(32)}`,
    salt: `0x${"22".repeat(32)}`,
    deadline: BigInt(Math.floor(Date.now() / 1_000) + 600),
    nonce: `0x${"33".repeat(32)}`,
  });
  assert.equal(await attachSignature(id, SIGNATURE), true);
  return id;
}

async function answer(response: Response): Promise<{ status: number; code?: string; paid?: boolean; hash?: Hex | null }> {
  const body = (await response.json()) as { code?: string; paid?: boolean; hash?: Hex | null };
  return { status: response.status, ...body };
}

before(async () => {
  db = new PGlite();
  configureExitStore(pgliteExecutor(db));
  configureRelayCeilingStore(pgliteExecutor(db));
  await ensureExitSchema();
  await ensureRelayCeilingSchema();
  const challenge = createAccountAuthChallenge({ account: A.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await A.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  cookie = `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_exits");
  await db.query("DELETE FROM viky_relay_counts");
  Object.assign(chain, { spent: false, simulation: "passes", finality: "reached", broadcasts: 0, estimates: 0 });
});

after(async () => {
  globalThis.fetch = realFetch;
  configureExitStore(undefined);
  configureRelayCeilingStore(undefined);
  await db.close();
});

test("ten requests at once for one signed payout send it once, and only that one is counted", async () => {
  const id = await signedTerms();
  const from = nextConnection();
  const answers = await Promise.all(Array.from({ length: 10 }, () => relayPost(relay(id, from)).then(answer)));

  assert.equal(chain.broadcasts, 1, "the relayer signed and sent one transaction, not one per request");
  assert.equal(chain.estimates, 1, "and only the request that holds the row went as far as pricing it");
  for (const one of answers) {
    assert.ok(
      (one.status === 200 && one.paid === true) || (one.status === 409 && one.code === "ALREADY_UNDER_WAY"),
      `every other request is told it is under way, or paid once it is: ${JSON.stringify(one)}`,
    );
  }
  assert.equal(answers.filter((one) => one.status === 200).length >= 1, true);
  const row = await loadExit(id, A.address);
  assert.equal(row?.state, "sent");
  assert.equal(row?.txHash, HASH);
  const counted = await db.query<{ count: number }>("SELECT max(count) AS count FROM viky_relay_counts");
  assert.equal(Number(counted.rows[0].count), 1, "a request that lost the row is never counted against the ceilings");
});

test("an attempt that dies after sending leaves its hash, and the retry finds it rather than sending again", async () => {
  const id = await signedTerms();
  const from = nextConnection();
  chain.finality = "unreachable";

  const first = await answer(await relayPost(relay(id, from)));
  assert.equal(chain.broadcasts, 1);
  assert.equal(first.status, 409, "it went out, so it is never answered as a failure that says nothing moved");
  assert.equal(first.code, "ALREADY_UNDER_WAY");
  let row = await loadExit(id, A.address);
  assert.equal(row?.state, "signed", "not yet known to have landed");
  assert.equal(row?.txHash, HASH, "but the hash was written down the moment it was submitted");

  // Still in flight and the token has not seen it yet: nothing is sent again.
  const meanwhile = await answer(await relayPost(relay(id, from)));
  assert.equal(meanwhile.code, "ALREADY_UNDER_WAY");
  assert.equal(chain.broadcasts, 1, "no second transaction while the first may still land");

  // It landed. The retry reports the transaction that did it, not "0x".
  chain.spent = true;
  const retry = await answer(await relayPost(relay(id, from)));
  assert.deepEqual({ status: retry.status, paid: retry.paid, hash: retry.hash }, { status: 200, paid: true, hash: HASH });
  row = await loadExit(id, A.address);
  assert.equal(row?.state, "sent");
  assert.equal(row?.txHash, HASH);
  assert.equal(chain.broadcasts, 1);
});

test("a refusal before anything is sent gives the row back at once", async () => {
  const id = await signedTerms();
  const from = nextConnection();
  chain.simulation = "TooLittleBack";

  const refused = await answer(await relayPost(relay(id, from)));
  assert.equal(refused.code, "RATE_MOVED");
  assert.equal(chain.broadcasts, 0);
  const held = await db.query<{ sent_at: unknown }>("SELECT sent_at FROM viky_exits WHERE id = $1", [id]);
  assert.equal(held.rows[0].sent_at, null, "nothing is in flight, so nothing is held");

  chain.simulation = "passes";
  const again = await answer(await relayPost(relay(id, from)));
  assert.equal(again.status, 200, "the next attempt goes straight away, it does not wait for a lease");
  assert.equal(chain.broadcasts, 1);
});

test("a claim left by an attempt that died runs out, and the next attempt goes once the token says nothing landed", async () => {
  const id = await signedTerms();
  const from = nextConnection();
  await db.query("UPDATE viky_exits SET sent_at = now() - interval '3 minutes', tx_hash = $2 WHERE id = $1", [id, EARLIER_HASH]);

  const retry = await answer(await relayPost(relay(id, from)));
  assert.equal(retry.status, 200);
  assert.equal(chain.broadcasts, 1);
  const row = await loadExit(id, A.address);
  assert.equal(row?.state, "sent");
  assert.equal(row?.txHash, HASH, "the transaction that landed, not the one that did not");
});
