import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { configureExitStore, ensureExitSchema } from "../src/exit-store";
import { configureGiftStore, ensureGiftSchema } from "../src/gift-store";
import { configureJudgeCreditStore, ensureJudgeCreditSchema } from "../src/judge-credit";
import { configureUntouchedCreditStore, untouchedJudgeCredit } from "../src/judge-credit-untouched";
import { judgeLineIsTrue } from "../src/judge-line";
import { configurePhoneOrderStore, ensurePhoneOrderSchema } from "../src/phone-order-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { configureSendStore, ensureSendsSchema } from "../src/send-store";

/**
 * "Paid from your judge credit." (D295) is said only when it is true (money path audit): the account holds no more
 * than its credit, and nothing has left the account since the credit, so the balance, and every dollar of the gift,
 * is the credit. A credit that was spent and then refilled from the founder's gift, or a credit sitting beside other
 * money, no longer draws it.
 */

let db: PGlite;
function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

const USD = 1_000_000n;
const CREDIT = 25n * USD;
const A = "0x00000000000000000000000000000000000A11cE";
const B = "0x00000000000000000000000000000000000B0B00";

/** The judge line as `giveJudgeCredit` writes it: the account in lower case, first written `minutesAgo`. */
async function credit(account: string, state: string, minutesAgo = 60, units = CREDIT) {
  await db.query(`INSERT INTO viky_judge_credits (account, units, state, created_at) VALUES ($1, $2, $3, now() - ($4 || ' minutes')::interval)`, [
    account.toLowerCase(),
    units.toString(),
    state,
    String(minutesAgo),
  ]);
}
async function creation(funder: string, minutesAgo: number, startedMinutesAgo = minutesAgo) {
  await db.query(
    `INSERT INTO viky_creations (nonce, funder, contact_hash, goal_type, daily_target, duration_days, amount, claim_token_hash, created_at, started_at)
     VALUES ($1, $2, 'h', 1, 10, 7, '20000000', 't', now() - ($3 || ' minutes')::interval, now() - ($4 || ' minutes')::interval)`,
    [`0x${Math.random().toString(16).slice(2)}`, funder.toLowerCase(), String(minutesAgo), String(startedMinutesAgo)],
  );
}
async function phoneOrder(account: string, minutesAgo: number) {
  await db.query(
    `INSERT INTO viky_phone_orders (id, account, kind, product_id, operator_name, local_amount, local_currency, invoice_id, usdc_units, ausd_units, state, created_at)
     VALUES ($1, $2, 'phone', 'p', 'o', '10', 'EUR', $1, '10000000', '10000000', 'priced', now() - ($3 || ' minutes')::interval)`,
    [`order-${Math.random()}`, account, String(minutesAgo)],
  );
}
async function exit(account: string, minutesAgo: number) {
  await db.query(
    `INSERT INTO viky_exits (id, account, amount, token_out, min_out, exchange, call_data, call_hash, salt, deadline, nonce, state, created_at)
     VALUES ($1, $2, '10000000', '0x0', '1', '0x0', '0x', '0x', '0x', 0, '0', 'prepared', now() - ($3 || ' minutes')::interval)`,
    [`exit-${Math.random()}`, account.toLowerCase(), String(minutesAgo)],
  );
}
async function send(account: string, minutesAgo: number) {
  await db.query(
    `INSERT INTO viky_sends (id, account, coin, destination, amount, tx_hash, sent_at) VALUES ($1, $2, '0xa', '0xb', '10000000', $1, now() - ($3 || ' minutes')::interval)`,
    [`send-${Math.random()}`, account.toLowerCase(), String(minutesAgo)],
  );
}

before(async () => {
  db = new PGlite();
  const run = pgliteExecutor(db);
  configureJudgeCreditStore(run);
  configureGiftStore(run);
  configurePhoneOrderStore(run);
  configureExitStore(run);
  configureSendStore(run);
  configureUntouchedCreditStore(run);
  await ensureJudgeCreditSchema();
  await ensureGiftSchema();
  await ensurePhoneOrderSchema();
  await ensureExitSchema();
  await ensureSendsSchema();
});
beforeEach(async () => {
  for (const table of ["viky_judge_credits", "viky_creations", "viky_phone_orders", "viky_exits", "viky_sends"]) await db.query(`DELETE FROM ${table}`);
});
after(async () => {
  for (const configure of [configureJudgeCreditStore, configureGiftStore, configurePhoneOrderStore, configureExitStore, configureSendStore, configureUntouchedCreditStore]) configure(undefined);
  await db.close();
});

test("the line is true only when the gift is paid from a balance no larger than an untouched credit", () => {
  assert.equal(judgeLineIsTrue({ gift: 25n * USD, held: CREDIT, untouchedCredit: CREDIT }), true, "the credit, and the gift the sheet brought to it (D300)");
  assert.equal(judgeLineIsTrue({ gift: 20n * USD, held: CREDIT, untouchedCredit: CREDIT }), true);
  // The credit beside the founder's gift taken out into the same account: 45 held, a 40 gift is not 40 of credit.
  assert.equal(judgeLineIsTrue({ gift: 40n * USD, held: 45n * USD, untouchedCredit: CREDIT }), false);
  assert.equal(judgeLineIsTrue({ gift: 10n * USD, held: 45n * USD, untouchedCredit: CREDIT }), false, "fungible: no dollar of it can be named as the credit");
  // Credit spent on a first gift, then 20 of the founder's gift came in: the server answers no untouched credit.
  assert.equal(judgeLineIsTrue({ gift: 20n * USD, held: 20n * USD, untouchedCredit: null }), false);
  assert.equal(judgeLineIsTrue({ gift: 30n * USD, held: CREDIT, untouchedCredit: CREDIT }), false, "not covered: the card pays, and the line says nothing");
  assert.equal(judgeLineIsTrue({ gift: 20n * USD, held: null, untouchedCredit: CREDIT }), false, "the balance not read yet");
  assert.equal(judgeLineIsTrue({ gift: undefined, held: CREDIT, untouchedCredit: CREDIT }), false);
});

test("an account's untouched credit is its own journal line's units, and only a 'sent' line", async () => {
  assert.equal(await untouchedJudgeCredit(A), null, "no line, no credit");
  await credit(A, "refused");
  assert.equal(await untouchedJudgeCredit(A), null, "a wrong code is not a credit");
  await db.query(`UPDATE viky_judge_credits SET state = 'sending', units = $1 WHERE account = $2`, [CREDIT.toString(), A.toLowerCase()]);
  assert.equal(await untouchedJudgeCredit(A), null, "on its way is not arrived");
  await db.query(`UPDATE viky_judge_credits SET state = 'sent', units = '30000000' WHERE account = $1`, [A.toLowerCase()]);
  assert.equal(await untouchedJudgeCredit(A), 30n * USD, "the amount the line says was sent, whatever the variable says today");
  assert.equal(await untouchedJudgeCredit(A.toLowerCase()), 30n * USD, "whatever the case of the account");
  assert.equal(await untouchedJudgeCredit(B), null);
});

test("anything that left the account since the credit was first written takes the line away: a gift, an order, an exit, a send", async () => {
  const ways = [
    ["a gift, daily, milestone or certificate", () => creation(A, 5)],
    ["a phone or gift card order, the account written as given", () => phoneOrder(A, 5)],
    ["an exit", () => exit(A, 5)],
    ["a send", () => send(A, 5)],
  ] as const;
  for (const [way, write] of ways) {
    await db.exec("DELETE FROM viky_creations; DELETE FROM viky_phone_orders; DELETE FROM viky_exits; DELETE FROM viky_sends; DELETE FROM viky_judge_credits");
    await credit(A, "sent");
    assert.equal(await untouchedJudgeCredit(A), CREDIT, `before ${way}`);
    await write();
    assert.equal(await untouchedJudgeCredit(A), null, `after ${way}`);
  }
});

test("the audit's case: a credit spent on a first gift, then the founder's gift taken in, draws no line on a second gift", async () => {
  await credit(A, "sent", 60);
  // The first gift, paid from the credit: 25 held becomes 0.
  await creation(A, 30);
  // The founder's gift, 20, taken out into the account: 20 held, a second gift of 20.
  const untouched = await untouchedJudgeCredit(A);
  assert.equal(untouched, null);
  assert.equal(judgeLineIsTrue({ gift: 20n * USD, held: 20n * USD, untouchedCredit: untouched }), false);
});

test("what left before the credit, or another account's, does not take the line away; a creation restarted since does", async () => {
  await credit(A, "sent", 60);
  await creation(A, 90);
  await phoneOrder(A, 90);
  await exit(A, 90);
  await send(A, 90);
  await creation(B, 5);
  await phoneOrder(B, 5);
  assert.equal(await untouchedJudgeCredit(A), CREDIT);
  await creation(A, 120, 10);
  assert.equal(await untouchedJudgeCredit(A), null, "begun before the credit, relayed after it");
});

test("a read that fails draws no line", async () => {
  configureUntouchedCreditStore(async () => {
    throw new Error("relation \"viky_sends\" does not exist");
  });
  const logged = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await untouchedJudgeCredit(A), null);
  } finally {
    console.error = logged;
    configureUntouchedCreditStore(pgliteExecutor(db));
  }
});

test("the sheet draws the line from the balance and the untouched credit, never from 'credited' alone", () => {
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.doesNotMatch(sheet, /enough && judge/);
  assert.match(sheet, /\{judgeLineIsTrue\(\{ gift: units, held, untouchedCredit \}\) \? <p className=\{HELP\}>\{W\.fromJudgeCredit\(cardPaidHow\(\), way\.name\)\}<\/p> : null\}/);
  assert.ok(sheet.indexOf("W.fromJudgeCredit") < sheet.indexOf("W.payFromAccount"), "above the action");
  // Read again once the code has given the credit, with the balance: never set on the browser's word.
  assert.match(sheet, /getJson<[^>]*untouchedCredit\?: string \| null[^>]*>\("\/api\/judge\/credit"\)[\s\S]*?\}, \[open, address, balanceRead\]\);/);
  assert.doesNotMatch(sheet, /setJudge\(true\)/);
  const route = readFileSync("app/api/judge/credit/route.ts", "utf8");
  assert.match(route, /const untouched = credited \? await untouchedJudgeCredit\(account\) : null;/);
  assert.match(route, /untouchedCredit: untouched === null \? null : untouched\.toString\(\)/);
});
