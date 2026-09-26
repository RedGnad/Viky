import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import type { Hex } from "viem";
import { GiftApiError } from "../src/gift-api";
import { configureJudgeCreditStore, ensureJudgeCreditSchema, giveJudgeCredit, JUDGE_CREDIT_ENDS, judgeCreditConfig, judgeCreditNonce, judgeCreditOpen, loadJudgeCredits } from "../src/judge-credit";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The judge credit (D291): a code typed by a signed-in judge, a fixed amount from the treasury, once per account, under
 * a ceiling, until 27 Oct 2026, one journal line per credit. The code is a Vercel variable and never in the repository.
 */

let db: PGlite;
function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

const CODE = "judge-code-for-the-test";
const CONFIG = { code: CODE, units: 25_000_000n, capUnits: 60_000_000n };
const NOW = Date.parse("2026-10-01T12:00:00Z");
const A = "0x00000000000000000000000000000000000A11cE";
const B = "0x00000000000000000000000000000000000B0B00";
const C = "0x0000000000000000000000000000000000000C0C";
const sent: { to: Hex; ausdUnits: bigint; nonce: Hex }[] = [];
const send = async (input: { to: Hex; ausdUnits: bigint; nonce: Hex }) => {
  sent.push(input);
  return { hash: `0x${"ab".repeat(32)}` as Hex };
};
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const refusal = (code: string) => (error: unknown) => error instanceof GiftApiError && error.code === code;

before(async () => {
  db = new PGlite();
  configureJudgeCreditStore(pgliteExecutor(db));
  await ensureJudgeCreditSchema();
});
beforeEach(async () => {
  await db.query("DELETE FROM viky_judge_credits");
  sent.length = 0;
});
after(async () => {
  configureJudgeCreditStore(undefined);
  await db.close();
});

test("the right code sends the set amount to the signed-in account, once, and writes one line", async () => {
  const given = await giveJudgeCredit({ account: A, code: ` ${CODE} ` }, { config: CONFIG, nowMs: NOW, send });
  assert.equal(given.units, "25000000");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to.toLowerCase(), A.toLowerCase());
  assert.equal(sent[0].ausdUnits, 25_000_000n);
  assert.equal(sent[0].nonce, judgeCreditNonce(A), "one account, one nonce: the token itself refuses a second transfer");
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, { config: CONFIG, nowMs: NOW, send }), refusal("JUDGE_ALREADY_CREDITED"));
  assert.equal(sent.length, 1);
  const lines = await loadJudgeCredits();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].state, "sent");
  assert.equal(lines[0].txHash, `0x${"ab".repeat(32)}`);
});

test("a wrong code moves nothing, is counted, and five lock the account", async () => {
  for (let i = 0; i < 5; i++) await assert.rejects(giveJudgeCredit({ account: B, code: "not-the-code-at-all" }, { config: CONFIG, nowMs: NOW, send }), refusal("JUDGE_CODE_WRONG"));
  await assert.rejects(giveJudgeCredit({ account: B, code: CODE }, { config: CONFIG, nowMs: NOW, send }), refusal("JUDGE_CODE_LOCKED"));
  assert.equal(sent.length, 0);
});

test("a wrong code then the right one still gives the credit", async () => {
  await assert.rejects(giveJudgeCredit({ account: B, code: "a-wrong-one-typed" }, { config: CONFIG, nowMs: NOW, send }), refusal("JUDGE_CODE_WRONG"));
  await giveJudgeCredit({ account: B, code: CODE }, { config: CONFIG, nowMs: NOW, send });
  assert.equal(sent.length, 1);
});

test("the ceiling holds across accounts", async () => {
  await giveJudgeCredit({ account: A, code: CODE }, { config: CONFIG, nowMs: NOW, send });
  await giveJudgeCredit({ account: B, code: CODE }, { config: CONFIG, nowMs: NOW, send });
  await assert.rejects(giveJudgeCredit({ account: C, code: CODE }, { config: CONFIG, nowMs: NOW, send }), refusal("JUDGE_CREDIT_CAP"), "50 given, 25 more would pass 60");
  assert.equal(sent.length, 2);
});

test("a send that failed can be tried again, with the same nonce, so it can only ever arrive once", async () => {
  const failing = async () => {
    throw new Error("the chain did not answer");
  };
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, { config: CONFIG, nowMs: NOW, send: failing }), refusal("JUDGE_CREDIT_NOT_SENT"));
  assert.equal((await loadJudgeCredits())[0].state, "failed");
  await giveJudgeCredit({ account: A, code: CODE }, { config: CONFIG, nowMs: NOW, send });
  assert.equal(sent[0].nonce, judgeCreditNonce(A));
});

test("closed without its three variables, and after 27 Oct 2026", async () => {
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, { config: null, nowMs: NOW, send }), refusal("JUDGE_CREDIT_CLOSED"));
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, { config: CONFIG, nowMs: JUDGE_CREDIT_ENDS, send }), refusal("JUDGE_CREDIT_ENDED"));
  assert.equal(JUDGE_CREDIT_ENDS, Date.parse("2026-10-28T00:00:00Z"), "the whole of 27 Oct, UTC");
  assert.equal(judgeCreditConfig(env({ JUDGE_CODE: "short", JUDGE_CREDIT_AUSD: "25", JUDGE_CREDIT_CAP_AUSD: "100" })), null, "a code under 12 characters is no code");
  assert.equal(judgeCreditConfig(env({ JUDGE_CODE: CODE, JUDGE_CREDIT_AUSD: "25", JUDGE_CREDIT_CAP_AUSD: "10" })), null, "a ceiling under one credit");
  assert.deepEqual(judgeCreditConfig(env({ JUDGE_CODE: CODE, JUDGE_CREDIT_AUSD: "25", JUDGE_CREDIT_CAP_AUSD: "250" })), { code: CODE, units: 25_000_000n, capUnits: 250_000_000n });
  assert.equal(judgeCreditOpen(NOW, env({ JUDGE_CODE: CODE, JUDGE_CREDIT_AUSD: "25", JUDGE_CREDIT_CAP_AUSD: "250" })), true);
  assert.equal(judgeCreditOpen(NOW, env({})), false);
  assert.equal(sent.length, 0);
});

test("the code is never in the repository, the route reads the signed-in account, the page never prints the code", () => {
  const route = readFileSync("app/api/judge/credit/route.ts", "utf8");
  assert.match(route, /readAccountAuthSession\(request\)/);
  assert.match(route, /giveJudgeCredit\(\{ account: auth\.account, code \}\)/);
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.doesNotMatch(page, /judgeCredit\.code|JUDGE_CODE/);
  assert.match(page, /a judge\s+credit from Viky&apos;s treasury, once per account\. A real funder pays by card through Ramp, shown in the video\./);
  assert.match(page, /Mera&apos;s stateless test runs on this same account/);
});
