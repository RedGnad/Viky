// A judge credit is never paid out of AUSD the treasury holds for people's phone and gift card orders (the money path
// audit of 27 Sep 2026): the same key receives their money and refunds it when an order fails.

import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { Hex } from "viem";
import { GiftApiError } from "../src/gift-api";
import { configureJudgeCreditStore, giveJudgeCredit } from "../src/judge-credit";
import type { SqlExecutor } from "../src/proof-session-store";

let db: PGlite;
before(async () => {
  db = new PGlite();
  configureJudgeCreditStore((async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  }) as SqlExecutor);
});
after(async () => {
  configureJudgeCreditStore(undefined);
  await db.close();
});

const CODE = "judge-code-for-the-test";
const CONFIG = { code: CODE, units: 25_000_000n, capUnits: 100_000_000n };
const NOW = Date.UTC(2026, 9, 1);
const refusal = (code: string) => (error: unknown) => error instanceof GiftApiError && error.code === code;

test("a credit the treasury could only pay out of money held for orders is refused, and nothing is sent", async () => {
  const sent: unknown[] = [];
  const send = async (input: unknown) => {
    sent.push(input);
    return { hash: "0x01" as Hex };
  };
  // 30 AUSD in the treasury, 10 of them held for a person's order: 20 may be given, less than one credit of 25.
  await assert.rejects(giveJudgeCredit({ account: "0x00000000000000000000000000000000000000a1", code: CODE }, { config: CONFIG, nowMs: NOW, send, spendable: async () => 20_000_000n, tell: async () => undefined }), refusal("JUDGE_CREDIT_TREASURY"));
  // A reading that fails refuses as well: it claims nothing.
  await assert.rejects(giveJudgeCredit({ account: "0x00000000000000000000000000000000000000a2", code: CODE }, { config: CONFIG, nowMs: NOW, send, spendable: async () => { throw new Error("the endpoint did not answer"); } }), refusal("JUDGE_CREDIT_TREASURY"));
  assert.equal(sent.length, 0);
  // Enough that belongs to nobody else: the credit goes.
  await giveJudgeCredit({ account: "0x00000000000000000000000000000000000000a3", code: CODE }, { config: CONFIG, nowMs: NOW, send, spendable: async () => 25_000_000n });
  assert.equal(sent.length, 1);
});

test("what the treasury may give is its AUSD less every order it holds money for", () => {
  const source = readFileSync(new URL("../src/judge-credit.ts", import.meta.url), "utf8");
  assert.match(source, /unsettledOrders\(\)/);
  assert.match(source, /return held - orders\.reduce\(\(sum, order\) => sum \+ order\.ausdUnits, 0n\);/);
});
