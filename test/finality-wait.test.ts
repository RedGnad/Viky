import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TransactionReceiptNotFoundError, WaitForTransactionReceiptTimeoutError, type PublicClient } from "viem";
import { giftErrorResponse, NOT_FINAL_YET } from "../src/gift-api";
import { milestoneErrorResponse } from "../src/milestone-api";
import { FINALITY_TIMEOUT_MS, FinalityTimeout, RECEIPT_TIMEOUT_MS, waitForFinality } from "../src/monad/chain";

/**
 * The wait for a transaction to be final (the audit of 1 Oct 2026, F-09 and F-21). It had no limit of its own on the
 * receipt, so it was the library's three minutes inside functions that live one, and what a person then read was
 * "Nothing was changed" about a transaction that had been sent.
 */

const HASH = `0x${"ab".repeat(32)}` as const;

test("the two waits fit inside a function's minute, with room for what comes after", () => {
  assert.equal(RECEIPT_TIMEOUT_MS, 15_000);
  assert.equal(FINALITY_TIMEOUT_MS, 15_000);
  assert.ok(RECEIPT_TIMEOUT_MS + FINALITY_TIMEOUT_MS <= 30_000);
});

test("the receipt is waited for with a limit, and running out of it is a transaction not known to be final", async () => {
  const asked: unknown[] = [];
  const client = {
    waitForTransactionReceipt: async (args: unknown) => {
      asked.push(args);
      throw new WaitForTransactionReceiptTimeoutError({ hash: HASH });
    },
  } as unknown as PublicClient;
  await assert.rejects(waitForFinality(client, HASH), (error: unknown) => error instanceof FinalityTimeout && error.hash === HASH);
  assert.deepEqual(asked, [{ hash: HASH, timeout: RECEIPT_TIMEOUT_MS }]);

  // Any other failure of the wait is passed on as it is: it is not a timeout, and is not dressed as one.
  const broken = { waitForTransactionReceipt: async () => Promise.reject(new Error("the node refused")) } as unknown as PublicClient;
  await assert.rejects(waitForFinality(broken, HASH), /the node refused/);

  // And a receipt whose block is already final is returned.
  const receipt = { blockNumber: 10n, status: "success" };
  const final = { waitForTransactionReceipt: async () => receipt, getBlock: async () => ({ number: 10n }) } as unknown as PublicClient;
  assert.equal(await waitForFinality(final, HASH), receipt);
});

test("what a person reads then says neither that it was done nor that nothing changed", async () => {
  for (const respond of [giftErrorResponse, milestoneErrorResponse]) {
    const said = console.error;
    console.error = () => undefined;
    let response: Response;
    try {
      response = respond(new FinalityTimeout(HASH));
    } finally {
      console.error = said;
    }
    assert.equal(response.status, 504);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "NOT_FINAL_YET");
    assert.equal(body.error, NOT_FINAL_YET);
    assert.doesNotMatch(body.error, /Nothing was changed|done|made|sent|0x/i);
  }
});

test("a transaction with no receipt is told apart from a node that did not answer", () => {
  // The node holding no receipt is an answer about the transaction; anything else says nothing about it.
  for (const file of ["src/gift-relay.ts", "src/milestone-relay.ts"]) {
    assert.match(readFileSync(file, "utf8"), /return error instanceof TransactionReceiptNotFoundError \? \{ kind: "absent" \} : \{ kind: "unknown" \};/, file);
  }
  assert.ok(new TransactionReceiptNotFoundError({ hash: HASH }) instanceof Error);
});

test("no comment in the public repository says finality is three blocks, or that nonces are kept locally", () => {
  // Monad's documentation: full finality in two rounds (docs.monad.xyz, MonadBFT, read 1 Oct 2026); and the nonce of
  // each send is read from the node.
  for (const file of ["src/relayer.ts", "src/monad/chain.ts", "scripts/deploy-gift-escrow.ts"]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /k = 3/, file);
    assert.doesNotMatch(text, /nonces managed locally/, file);
  }
});
