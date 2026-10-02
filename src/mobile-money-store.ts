import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import { GiftApiError } from "./gift-api";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The ledger of the mobile money way out: one row per payout opened with Switch, from the exchange that made the
 * dollars to the payout arrived or failed. Server only.
 *
 * What is kept of the person: the operator, the country, and the last four digits of the number, which is what the
 * screen shows once it is sent. The whole number and the name on the account go to Switch with the payout and are not
 * written here. The exchange that made the dollars is kept by its transaction, once: one payout per exchange.
 *
 * States are Switch's own (AWAITING_DEPOSIT, PROCESSING, COMPLETED, FAILED, REVERSED, SCHEDULED, BLOCKED), as its
 * webhook or its status route last said them.
 */

export const MOBILE_PAYOUT_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_mobile_payouts (
  reference text PRIMARY KEY,
  account text NOT NULL,
  country text NOT NULL,
  network text NOT NULL,
  number_end text NOT NULL,
  exit_tx text NOT NULL UNIQUE,
  units text NOT NULL,
  deposit_address text NOT NULL,
  deposit_units text NOT NULL,
  local_amount text NOT NULL,
  local_currency text NOT NULL,
  rate text NOT NULL,
  status text NOT NULL,
  deposit_sent_at timestamptz,
  deposit_tx text,
  expires_at timestamptz NOT NULL,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viky_mobile_payouts_account ON viky_mobile_payouts (account, created_at DESC)
`;

export type MobilePayout = Readonly<{
  reference: string;
  account: string;
  country: string;
  network: string;
  numberEnd: string;
  exitTx: string;
  units: bigint;
  depositAddress: string;
  depositUnits: bigint;
  localAmount: number;
  localCurrency: string;
  rate: number;
  status: string;
  depositSentAt: Date | null;
  depositTx: string | null;
  expiresAt: Date;
  checkedAt: Date | null;
  createdAt: Date;
}>;

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureMobilePayoutStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  if (!process.env.DATABASE_URL?.trim()) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was taken.", 503);
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** The table, made the first time it is needed in each process: production never runs the migration (schema-columns-lazy). */
export async function ensureMobilePayoutSchema(): Promise<void> {
  for (const statement of MOBILE_PAYOUT_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

async function db(): Promise<SqlExecutor> {
  ready ??= ensureMobilePayoutSchema().catch((error) => {
    ready = undefined;
    throw error;
  });
  await ready;
  return sql();
}

function rowOf(row: Record<string, unknown>): MobilePayout {
  const date = (value: unknown) => (value === null || value === undefined ? null : new Date(String(value)));
  return {
    reference: String(row.reference),
    account: String(row.account),
    country: String(row.country),
    network: String(row.network),
    numberEnd: String(row.number_end),
    exitTx: String(row.exit_tx),
    units: BigInt(String(row.units)),
    depositAddress: String(row.deposit_address),
    depositUnits: BigInt(String(row.deposit_units)),
    localAmount: Number(row.local_amount),
    localCurrency: String(row.local_currency),
    rate: Number(row.rate),
    status: String(row.status),
    depositSentAt: date(row.deposit_sent_at),
    depositTx: row.deposit_tx === null || row.deposit_tx === undefined ? null : String(row.deposit_tx),
    expiresAt: new Date(String(row.expires_at)),
    checkedAt: date(row.checked_at),
    createdAt: new Date(String(row.created_at)),
  };
}

export async function recordPayout(payout: Omit<MobilePayout, "depositSentAt" | "depositTx" | "checkedAt" | "createdAt">): Promise<MobilePayout> {
  const rows = await (await db())`
    INSERT INTO viky_mobile_payouts (reference, account, country, network, number_end, exit_tx, units, deposit_address, deposit_units, local_amount, local_currency, rate, status, expires_at)
    VALUES (${payout.reference}, ${payout.account.toLowerCase()}, ${payout.country}, ${payout.network}, ${payout.numberEnd}, ${payout.exitTx.toLowerCase()}, ${payout.units.toString()}, ${payout.depositAddress}, ${payout.depositUnits.toString()}, ${String(payout.localAmount)}, ${payout.localCurrency}, ${String(payout.rate)}, ${payout.status}, ${payout.expiresAt.toISOString()})
    RETURNING *`;
  return rowOf(rows[0]);
}

export async function loadPayout(reference: string): Promise<MobilePayout | null> {
  const rows = await (await db())`SELECT * FROM viky_mobile_payouts WHERE reference = ${reference}`;
  return rows[0] ? rowOf(rows[0]) : null;
}

/** The payout opened for an exchange, if one was: an exchange's dollars are paid out once. */
export async function payoutOfExit(exitTx: string): Promise<MobilePayout | null> {
  const rows = await (await db())`SELECT * FROM viky_mobile_payouts WHERE exit_tx = ${exitTx.toLowerCase()}`;
  return rows[0] ? rowOf(rows[0]) : null;
}

/** Forgets a payout opened and never paid into, once its window has closed, so the same exchange's dollars can be paid out again. */
export async function dropUnpaidPayout(reference: string): Promise<boolean> {
  const rows = await (await db())`
    DELETE FROM viky_mobile_payouts
     WHERE reference = ${reference} AND deposit_sent_at IS NULL AND status = 'AWAITING_DEPOSIT' AND expires_at < now()
     RETURNING reference`;
  return rows.length === 1;
}

export async function markDepositSent(reference: string, account: string): Promise<boolean> {
  const rows = await (await db())`
    UPDATE viky_mobile_payouts SET deposit_sent_at = now(), updated_at = now()
     WHERE reference = ${reference} AND account = ${account.toLowerCase()} AND deposit_sent_at IS NULL
     RETURNING reference`;
  return rows.length === 1;
}

/** What Switch last said of a payout, by its webhook or its status route. The local amount is its own, once it says it. */
export async function notePayoutState(reference: string, state: Readonly<{ status: string; local: number | null; depositHash: string | null }>): Promise<boolean> {
  const rows = await (await db())`
    UPDATE viky_mobile_payouts
       SET status = ${state.status},
           local_amount = COALESCE(${state.local === null ? null : String(state.local)}::text, local_amount),
           deposit_tx = COALESCE(${state.depositHash}::text, deposit_tx),
           deposit_sent_at = CASE WHEN ${state.depositHash}::text IS NOT NULL THEN COALESCE(deposit_sent_at, now()) ELSE deposit_sent_at END,
           checked_at = now(), updated_at = now()
     WHERE reference = ${reference}
     RETURNING reference`;
  return rows.length === 1;
}
