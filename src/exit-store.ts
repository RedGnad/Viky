import { randomBytes } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { neon } from "@neondatabase/serverless";
import type { SqlExecutor } from "./proof-session-store";
import type { OpenExit } from "./exit-plan";

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
  payout_to text NOT NULL,
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
`;

let executor: SqlExecutor | undefined;

export function configureExitStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url) as unknown as SqlExecutor;
}

export async function ensureExitSchema(): Promise<void> {
  for (const statement of EXIT_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/** `prepared` until the person signs, `signed` while a live authorization exists, `sent` once it landed. */
export type ExitState = "prepared" | "signed" | "sent";

export type ExitRecord = Readonly<{
  id: string;
  account: Hex;
  amount: bigint;
  payoutTo: Hex;
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
    payoutTo: getAddress(String(row.payout_to)),
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
    INSERT INTO viky_exits (id, account, amount, payout_to, min_out, exchange, call_data, call_hash, salt, deadline, nonce, state)
    VALUES (${input.id}, ${input.account.toLowerCase()}, ${input.amount.toString()}, ${input.payoutTo.toLowerCase()},
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

export async function markExitSent(id: string, txHash: Hex): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_exits SET tx_hash = ${txHash}, sent_at = now(), state = 'sent'
     WHERE id = ${id} AND state = 'signed' RETURNING id`;
  return rows.length === 1;
}

/** What the planner needs and nothing more. */
export function asOpenExit(record: ExitRecord): OpenExit {
  return { id: record.id, amount: record.amount, payoutTo: record.payoutTo, minOut: record.minOut, signature: record.signature };
}
