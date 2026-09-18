import { randomBytes } from "node:crypto";
import { databaseUrl } from "./database-guard";
import { getAddress, type Hex } from "viem";
import { neon } from "@neondatabase/serverless";
import type { SqlExecutor } from "./proof-session-store";
import type { OpenExit } from "./exit-plan";
import { GiftApiError } from "./gift-api";

/**
 * One way out at a time, per account, written down before anything is signed.
 *
 * It is written down for one reason: a second attempt must relay the terms already signed rather than make
 * new ones. Without a record, a failed relay and a tap on "try again" would produce a second authorization
 * for the same money, and two live signatures mean the person can be debited twice out of their own account.
 * The row holds the terms, the calldata those terms are bound to, and the signature once it exists.
 */

export const EXIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_exits (
  id text PRIMARY KEY,
  account text NOT NULL,
  amount text NOT NULL,
  token_out text NOT NULL,
  min_out text NOT NULL,
  exchange text NOT NULL,
  call_data text NOT NULL,
  call_hash text NOT NULL,
  salt text NOT NULL,
  deadline bigint NOT NULL,
  nonce text NOT NULL,
  signature text,
  tx_hash text,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS viky_exits_account ON viky_exits (account, created_at DESC);
-- The destination is gone with form C (D76): the router hands the proceeds back to the person, who sends the
-- payout service its coin themselves. A table made before that still carries the column, and it is NOT NULL,
-- so every insert would fail against it. Written as its own statement because CREATE TABLE IF NOT EXISTS says
-- nothing about a table that already exists.
ALTER TABLE viky_exits DROP COLUMN IF EXISTS payout_to;
-- And the coin came in with D77, since the two payout services take different ones. A default is given so an
-- existing table with rows in it can take the column at all. Every row written since names its own coin.
-- No semicolon belongs anywhere in these comments: this schema is split on semicolons and run statement by
-- statement, so one inside a comment cuts the statement in half and every test that opens a database fails.
ALTER TABLE viky_exits ADD COLUMN IF NOT EXISTS token_out text NOT NULL DEFAULT '';
`;

/** The chain's own coin, and what a row written before the coin was named reads as. */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

let executor: SqlExecutor | undefined;

export function configureExitStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  if (!process.env.DATABASE_URL?.trim()) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was taken.", 503);
  const url = databaseUrl();
  const run = neon(url) as unknown as SqlExecutor;
  // A database that has not been migrated throws an untyped error, and an untyped error is the one thing this
  // project cannot show a person: it falls past every named refusal and arrives as "Something went wrong".
  // That is exactly what the first real attempt at the way out met on 16 Sep, and the message told the funder
  // nothing about what had happened or whether their money had moved (D80).
  return (async (strings, ...values) => {
    try {
      return await run(strings, ...values);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/relation .* does not exist|column .* does not exist/i.test(message)) {
        console.error(`the way out's table is not migrated: ${message}`);
        throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet. Nothing was taken.", 503);
      }
      throw error;
    }
  }) as SqlExecutor;
}

export async function ensureExitSchema(): Promise<void> {
  for (const statement of EXIT_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/**
 * `prepared` until the person signs, `signed` while a live authorization exists, `sent` once it landed, and
 * `stale` when the exchange refused these bytes because its route had moved (D81).
 *
 * `stale` exists so a retry is possible at all: while one set of terms is signed, no second set may be made,
 * because two live authorizations for the same money could both land. Terms the exchange has already refused
 * are set aside instead, and the next attempt is free to quote again.
 *
 * What that does not do is unmake the signature. It stays valid until its deadline, and `exit` is open to
 * anyone, so in principle those bytes could still be relayed by somebody holding them. What makes that harmless
 * in practice is that the route refused them and the same account rarely holds twice the amount, and what makes
 * it bounded is the fifteen minute window. Said plainly rather than left implied.
 */
export type ExitState = "prepared" | "signed" | "sent" | "stale";

export type ExitRecord = Readonly<{
  id: string;
  account: Hex;
  amount: bigint;
  /** The coin that must come back, zero meaning the chain's own (D77). */
  tokenOut: Hex;
  minOut: bigint;
  exchange: Hex;
  callData: Hex;
  callHash: Hex;
  salt: Hex;
  deadline: bigint;
  nonce: Hex;
  signature: Hex | null;
  txHash: Hex | null;
  state: ExitState;
}>;

function toRecord(row: Record<string, unknown>): ExitRecord {
  return {
    id: String(row.id),
    account: getAddress(String(row.account)),
    amount: BigInt(String(row.amount)),
    // A row written before the coin was named carries an empty string, and reading that as an account would
    // throw rather than say what it is. Such a row is from the older terms and cannot be relayed against this
    // contract anyway: its tag no longer matches, so the token would refuse the signature.
    tokenOut: row.token_out ? getAddress(String(row.token_out)) : ZERO_ADDRESS,
    minOut: BigInt(String(row.min_out)),
    exchange: getAddress(String(row.exchange)),
    callData: String(row.call_data) as Hex,
    callHash: String(row.call_hash) as Hex,
    salt: String(row.salt) as Hex,
    deadline: BigInt(String(row.deadline)),
    nonce: String(row.nonce) as Hex,
    signature: row.signature ? (String(row.signature) as Hex) : null,
    txHash: row.tx_hash ? (String(row.tx_hash) as Hex) : null,
    state: String(row.state) as ExitState,
  };
}

export function newExitId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * The one way out that is still alive for this account: not yet landed, and not yet expired. A set of terms
 * whose deadline has passed is harmless, because the contract refuses it and the token's own window has
 * closed with it.
 */
export async function openExit(account: string, now: Date = new Date()): Promise<ExitRecord | null> {
  const rows = await sql()`
    SELECT * FROM viky_exits
     WHERE account = ${account.toLowerCase()} AND state IN ('prepared', 'signed')
       AND deadline > ${Math.floor(now.getTime() / 1000)}
     ORDER BY created_at DESC LIMIT 1`;
  return rows.length === 1 ? toRecord(rows[0]) : null;
}

export async function loadExit(id: string, account: string): Promise<ExitRecord | null> {
  const rows = await sql()`SELECT * FROM viky_exits WHERE id = ${id} AND account = ${account.toLowerCase()}`;
  return rows.length === 1 ? toRecord(rows[0]) : null;
}

export async function saveExit(input: Omit<ExitRecord, "signature" | "txHash" | "state">): Promise<void> {
  await sql()`
    INSERT INTO viky_exits (id, account, amount, token_out, min_out, exchange, call_data, call_hash, salt, deadline, nonce, state)
    VALUES (${input.id}, ${input.account.toLowerCase()}, ${input.amount.toString()}, ${input.tokenOut.toLowerCase()},
            ${input.minOut.toString()}, ${input.exchange.toLowerCase()}, ${input.callData}, ${input.callHash},
            ${input.salt}, ${input.deadline.toString()}, ${input.nonce}, 'prepared')`;
}

/** Only terms nobody signed may be thrown away: a signature exists until its deadline, whatever we forget. */
export async function discardExit(id: string): Promise<boolean> {
  const rows = await sql()`DELETE FROM viky_exits WHERE id = ${id} AND state = 'prepared' RETURNING id`;
  return rows.length === 1;
}

/**
 * Keeps the first signature and no other. A second one for the same terms would be the same authorization
 * anyway, but a second one that differed would be a second thing we could relay, which is the whole danger.
 */
export async function attachSignature(id: string, signature: Hex): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_exits SET signature = ${signature}, signed_at = now(), state = 'signed'
     WHERE id = ${id} AND state = 'prepared' RETURNING id`;
  return rows.length === 1;
}

/**
 * Sets aside terms the exchange refused because its route had moved, so the next attempt may quote again.
 * Only terms that were signed and never landed: anything already sent is finished, and anything unsigned can
 * simply be discarded.
 */
export async function markExitStale(id: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_exits SET state = 'stale'
     WHERE id = ${id} AND state = 'signed' RETURNING id`;
  return rows.length === 1;
}

/**
 * Sets aside every set of terms whose deadline has passed, and says how many (the audit of 18 Sep, gap e).
 *
 * Those terms were already harmless: the contract refuses a deadline that has passed, the token's own authorization
 * window closed with it, and `openExit` never offers one. What they were not is honest about themselves. One has sat
 * in production since 16 Sep 2026 saying `signed`, which reads as a signature waiting to be used, and it is a
 * signature nothing can use. The keeper retires them so the row says what is true.
 */
export async function retireExpiredExits(nowSeconds: number = Math.floor(Date.now() / 1_000)): Promise<number> {
  const rows = await sql()`
    UPDATE viky_exits SET state = 'stale'
     WHERE state IN ('prepared', 'signed') AND deadline <= ${nowSeconds}
     RETURNING id`;
  return rows.length;
}

export async function markExitSent(id: string, txHash: Hex): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_exits SET tx_hash = ${txHash}, sent_at = now(), state = 'sent'
     WHERE id = ${id} AND state = 'signed' RETURNING id`;
  return rows.length === 1;
}

/** What the planner needs and nothing more. */
export function asOpenExit(record: ExitRecord): OpenExit {
  return { id: record.id, amount: record.amount, tokenOut: record.tokenOut, minOut: record.minOut, signature: record.signature };
}
