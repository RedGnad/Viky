import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import type { Hex } from "viem";
import { GiftApiError } from "../src/gift-api";
import { configureJudgeCreditStore, ensureJudgeCreditSchema, giveJudgeCredit, isJudgeCredited, JUDGE_REFUSALS, judgeCreditNonce, loadJudgeCredits } from "../src/judge-credit";
import { TreasuryError } from "../src/phone-treasury";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The judge credit's journal read back from the token (audit, money path): the treasury signs each credit with the
 * account's own nonce, and only the treasury can consume it, so the token's `authorizationState` is the truth when our
 * own line and the chain could disagree: a transfer that landed and then threw, a journal write that failed after the
 * money moved, a function stopped mid-transfer.
 */

let db: PGlite;
/** One statement to fail, once, as the database would on a bad moment: matched on the statement's text. */
let failNext: RegExp | null = null;
function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    if (failNext && failNext.test(text)) {
      failNext = null;
      throw new Error("the database did not answer");
    }
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

const CODE = "judge-code-for-the-test";
const CONFIG = { code: CODE, units: 25_000_000n, capUnits: 60_000_000n };
const NOW = Date.parse("2026-10-01T12:00:00Z");
const A = "0x00000000000000000000000000000000000A11cE";
const B = "0x00000000000000000000000000000000000B0B00";
const C = "0x0000000000000000000000000000000000000C0C";
const HASH = `0x${"ab".repeat(32)}` as Hex;

/** The token, as far as these credits go: the nonces the treasury's authorizations consumed, and who received what. */
const used = new Set<Hex>();
const moved: { to: Hex; units: bigint }[] = [];
let sends = 0;
/** Refuses a used nonce as the token does, lands the transfer, and then does what the test asks of the wait. */
function sender(after: "returns" | "throws" | "hangs" | "fails before" = "returns") {
  return async (input: { to: Hex; ausdUnits: bigint; nonce: Hex }) => {
    sends += 1;
    if (after === "fails before") throw new TreasuryError("REFUND_FAILED", "The refund could not be sent yet", { cause: new Error("the relayer is below its reserve") });
    if (used.has(input.nonce)) throw new TreasuryError("REFUND_FAILED", "The refund could not be sent yet", { cause: new Error("authorization is used or canceled") });
    if (after === "hangs") return new Promise<{ hash: Hex }>(() => undefined);
    used.add(input.nonce);
    moved.push({ to: input.to, units: input.ausdUnits });
    if (after === "throws") throw new TreasuryError("REFUND_FAILED", "The refund could not be sent yet", { cause: new Error("the receipt could not be read") });
    return { hash: HASH };
  };
}
const authorizationUsed = async (nonce: Hex) => used.has(nonce);
const deps = (send: ReturnType<typeof sender>) => ({ config: CONFIG, nowMs: NOW, send, authorizationUsed, spendable: async () => 10n ** 18n });
const refusal = (code: string) => (error: unknown) => error instanceof GiftApiError && error.code === code;
const line = async (account: string) => (await loadJudgeCredits()).find((row) => row.account === account.toLowerCase());
const total = () => moved.reduce((sum, m) => sum + m.units, 0n);
async function seed(account: string, state: string, minutesAgo: number) {
  await db.query(`INSERT INTO viky_judge_credits (account, units, state, updated_at) VALUES ($1, 25000000, $2, now() - ($3 || ' minutes')::interval)`, [account.toLowerCase(), state, String(minutesAgo)]);
  // A line the claim wrote is in the counter the ceiling is held by: so is one written here in its place.
  if (state === "sending" || state === "sent" || state === "failed") await db.query("UPDATE viky_judge_credit_total SET units = units + 25000000");
}

before(async () => {
  db = new PGlite();
  configureJudgeCreditStore(pgliteExecutor(db));
  await ensureJudgeCreditSchema();
});
beforeEach(async () => {
  await db.query("DELETE FROM viky_judge_credits");
  await db.query("UPDATE viky_judge_credit_total SET units = 0");
  used.clear();
  moved.length = 0;
  sends = 0;
  failNext = null;
});
after(async () => {
  configureJudgeCreditStore(undefined);
  await db.close();
});

test("a credit that landed and then threw is 'sent', says its hash is unknown, is answered as sent, and counts against the ceiling", async () => {
  const given = await giveJudgeCredit({ account: A, code: CODE }, deps(sender("throws")));
  assert.deepEqual(given, { units: "25000000", hash: null }, "the money is in their account: said so, with no hash invented");
  const a = await line(A);
  assert.equal(a?.state, "sent");
  assert.ok(a?.txHash && !/^0x[0-9a-f]{64}$/.test(a.txHash), "no hash is invented");
  assert.match(a?.txHash ?? "", /unknown/, "the journal says the hash is unknown");
  assert.match(a?.txHash ?? "", new RegExp(judgeCreditNonce(A)), "and names the authorization the token shows used");
  assert.equal(await isJudgeCredited(A), true, "the pay sheet's line (D295) is drawn");

  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), refusal("JUDGE_ALREADY_CREDITED"));
  await giveJudgeCredit({ account: B, code: CODE }, deps(sender()));
  await assert.rejects(giveJudgeCredit({ account: C, code: CODE }, deps(sender())), refusal("JUDGE_CREDIT_CAP"), "25 + 25 given, 25 more would pass 60");
  assert.equal(total(), 50_000_000n, "never more than the ceiling moved");
});

test("a journal write that fails after the money moved never makes a 'failed' line; the next try reads the token", async () => {
  failNext = /SET state = 'sent'/;
  const given = await giveJudgeCredit({ account: A, code: CODE }, deps(sender()));
  assert.equal(given.hash, HASH, "the transfer is final: the judge is told it arrived");
  assert.notEqual((await line(A))?.state, "failed");

  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), refusal("JUDGE_ALREADY_CREDITED"));
  assert.equal(sends, 1, "nothing is signed again once the token shows the credit went out");
  assert.equal((await line(A))?.state, "sent");
  assert.equal(await isJudgeCredited(A), true);
  await giveJudgeCredit({ account: B, code: CODE }, deps(sender()));
  await assert.rejects(giveJudgeCredit({ account: C, code: CODE }, deps(sender())), refusal("JUDGE_CREDIT_CAP"));
  assert.equal(total(), 50_000_000n);
});

test("a 'failed' line whose credit landed is read before signing again: 'sent', and nothing is sent", async () => {
  await seed(A, "failed", 2);
  used.add(judgeCreditNonce(A));
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), refusal("JUDGE_ALREADY_CREDITED"));
  assert.equal(sends, 0);
  assert.equal((await line(A))?.state, "sent");
  assert.equal(await isJudgeCredited(A), true);
});

test("a 'failed' line counts against the ceiling for other accounts, and its own judge can still try again", async () => {
  await seed(A, "failed", 2);
  await giveJudgeCredit({ account: B, code: CODE }, deps(sender()));
  await assert.rejects(giveJudgeCredit({ account: C, code: CODE }, deps(sender())), refusal("JUDGE_CREDIT_CAP"), "a failed line may have landed");
  const again = await giveJudgeCredit({ account: A, code: CODE }, deps(sender()));
  assert.equal(again.hash, HASH);
  assert.deepEqual(moved.map((m) => m.to.toLowerCase()), [B.toLowerCase(), A.toLowerCase()]);
});

test("a 'sending' line is answered as on its way, never as received, and is 'sent' once the token shows it", async () => {
  const first = giveJudgeCredit({ account: A, code: CODE }, deps(sender("hangs")));
  void first;
  for (let i = 0; i < 100 && (await line(A))?.state !== "sending"; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await line(A))?.state, "sending");
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), (error: unknown) => {
    assert.ok(error instanceof GiftApiError);
    assert.equal(error.code, "JUDGE_CREDIT_SENDING");
    assert.equal(error.message, JUDGE_REFUSALS.sending);
    assert.doesNotMatch(error.message, /received/);
    assert.match(error.message, /on its way/);
    return true;
  });
  assert.equal(sends, 1, "nothing is signed again while the authorization may still land");
  assert.equal(await isJudgeCredited(A), false);

  used.add(judgeCreditNonce(A));
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), refusal("JUDGE_ALREADY_CREDITED"));
  assert.equal((await line(A))?.state, "sent");
  assert.equal(await isJudgeCredited(A), true);
});

test("a 'sending' line older than its authorization's validity is sent again when the token shows it unused, once", async () => {
  await seed(A, "sending", 30);
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), refusal("JUDGE_CREDIT_SENDING"), "half an hour: it may still land");
  assert.equal(sends, 0);

  await db.query("UPDATE viky_judge_credits SET updated_at = now() - interval '66 minutes'");
  const tries = await Promise.allSettled([giveJudgeCredit({ account: A, code: CODE }, deps(sender())), giveJudgeCredit({ account: A, code: CODE }, deps(sender()))]);
  assert.equal(tries.filter((t) => t.status === "fulfilled").length, 1);
  assert.ok(
    tries.some((t) => t.status === "rejected" && (refusal("JUDGE_CREDIT_SENDING")(t.reason) || refusal("JUDGE_ALREADY_CREDITED")(t.reason))),
    "the other is told it is on its way, or already received once the first has finished",
  );
  assert.equal(sends, 1, "one of two tries signs again");
  assert.equal(moved.length, 1);
  assert.equal((await line(A))?.state, "sent");
});

test("a 'sending' line older than the validity whose credit landed is 'sent', and nothing is sent", async () => {
  await seed(A, "sending", 66);
  used.add(judgeCreditNonce(A));
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender())), refusal("JUDGE_ALREADY_CREDITED"));
  assert.equal(sends, 0);
  assert.equal(await isJudgeCredited(A), true);
});

test("every failure logs its reason with the account, and a send that moved nothing stays 'failed' and can be tried again", async (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, deps(sender("fails before"))), refusal("JUDGE_CREDIT_NOT_SENT"));
  assert.equal((await line(A))?.state, "failed");
  const text = logged.mock.calls.map((call) => call.arguments.map(String).join(" ")).join("\n");
  assert.match(text, new RegExp(A.toLowerCase()), "the account");
  assert.match(text, /REFUND_FAILED/, "the treasury's code");
  assert.match(text, /the relayer is below its reserve/, "and the cause");

  logged.mock.resetCalls();
  const unreadable = async () => {
    throw new Error("the token could not be asked");
  };
  await assert.rejects(giveJudgeCredit({ account: A, code: CODE }, { ...deps(sender("fails before")), authorizationUsed: unreadable }), refusal("JUDGE_CREDIT_NOT_SENT"));
  const again = logged.mock.calls.map((call) => call.arguments.map(String).join(" ")).join("\n");
  assert.match(again, /the token could not be asked/, "a read that failed is logged too");
  assert.match(again, new RegExp(A.toLowerCase()));
  assert.equal((await line(A))?.state, "failed", "a read that failed is never taken for 'sent'");

  mock.restoreAll();
  const given = await giveJudgeCredit({ account: A, code: CODE }, deps(sender()));
  assert.equal(given.hash, HASH);
  assert.equal(moved.length, 1);
});
