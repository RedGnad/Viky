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
CREATE INDEX IF NOT EXISTS viky_mobile_payouts_account ON viky_mobile_payouts (account, created_at DESC);
ALTER TABLE viky_mobile_payouts ADD COLUMN IF NOT EXISTS completed_at timestamptz
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
  /** When Switch first said COMPLETED, by its webhook or its status route: the moment the judges page dates a payout by. */
  completedAt: Date | null;
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

/**
 * One statement, once the table exists. A tag of its own rather than the statement tagged on the awaited db() in one
 * expression: the production build drops that expression's parentheses, which hands the statement to the promise
 * instead of the database, so every call failed on viky.cash while every test passed (found on 3 Oct 2026).
 */
async function ledger(strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> {
  const run = await db();
  return run(strings, ...values);
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
    completedAt: date(row.completed_at),
    createdAt: new Date(String(row.created_at)),
  };
}

export async function recordPayout(payout: Omit<MobilePayout, "depositSentAt" | "depositTx" | "checkedAt" | "completedAt" | "createdAt">): Promise<MobilePayout> {
  const rows = await ledger`
    INSERT INTO viky_mobile_payouts (reference, account, country, network, number_end, exit_tx, units, deposit_address, deposit_units, local_amount, local_currency, rate, status, expires_at)
    VALUES (${payout.reference}, ${payout.account.toLowerCase()}, ${payout.country}, ${payout.network}, ${payout.numberEnd}, ${payout.exitTx.toLowerCase()}, ${payout.units.toString()}, ${payout.depositAddress}, ${payout.depositUnits.toString()}, ${String(payout.localAmount)}, ${payout.localCurrency}, ${String(payout.rate)}, ${payout.status}, ${payout.expiresAt.toISOString()})
    RETURNING *`;
  return rowOf(rows[0]);
}

export async function loadPayout(reference: string): Promise<MobilePayout | null> {
  const rows = await ledger`SELECT * FROM viky_mobile_payouts WHERE reference = ${reference}`;
  return rows[0] ? rowOf(rows[0]) : null;
}

/** The payout opened for an exchange, if one was: an exchange's dollars are paid out once. */
export async function payoutOfExit(exitTx: string): Promise<MobilePayout | null> {
  const rows = await ledger`SELECT * FROM viky_mobile_payouts WHERE exit_tx = ${exitTx.toLowerCase()}`;
  return rows[0] ? rowOf(rows[0]) : null;
}

/** Forgets a payout opened and never paid into, once its window has closed, so the same exchange's dollars can be paid out again. */
export async function dropUnpaidPayout(reference: string): Promise<boolean> {
  const rows = await ledger`
    DELETE FROM viky_mobile_payouts
     WHERE reference = ${reference} AND deposit_sent_at IS NULL AND status = 'AWAITING_DEPOSIT' AND expires_at < now()
     RETURNING reference`;
  return rows.length === 1;
}

export async function markDepositSent(reference: string, account: string): Promise<boolean> {
  const rows = await ledger`
    UPDATE viky_mobile_payouts SET deposit_sent_at = now(), updated_at = now()
     WHERE reference = ${reference} AND account = ${account.toLowerCase()} AND deposit_sent_at IS NULL
     RETURNING reference`;
  return rows.length === 1;
}

/**
 * What counts against the day's ceiling for an account, since midnight UTC (the phone way out's rule, src/phone-order.ts):
 * every payout opened today whose dollars did not come back. One that failed or was reversed came back; one whose window
 * closed with nothing sent never left. Everything else counts, including one opened and not yet paid into, so that two
 * opened together cannot both pass the ceiling.
 */
export async function usedToday(account: string, now: Date = new Date()): Promise<bigint> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const rows = await ledger`
    SELECT COALESCE(sum(units::numeric), 0)::text AS units FROM viky_mobile_payouts
     WHERE account = ${account.toLowerCase()} AND created_at >= ${day}
       AND status NOT IN ('FAILED', 'REVERSED')
       AND NOT (deposit_sent_at IS NULL AND status = 'AWAITING_DEPOSIT' AND expires_at < ${now.toISOString()})`;
  return BigInt(String(rows[0]?.units ?? "0").split(".")[0]);
}

/** What Switch last said of a payout, by its webhook or its status route. The local amount is its own, once it says it. */
export async function notePayoutState(reference: string, state: Readonly<{ status: string; local: number | null; depositHash: string | null }>): Promise<boolean> {
  const rows = await ledger`
    UPDATE viky_mobile_payouts
       SET status = ${state.status},
           local_amount = COALESCE(${state.local === null ? null : String(state.local)}::text, local_amount),
           deposit_tx = COALESCE(${state.depositHash}::text, deposit_tx),
           deposit_sent_at = CASE WHEN ${state.depositHash}::text IS NOT NULL THEN COALESCE(deposit_sent_at, now()) ELSE deposit_sent_at END,
           completed_at = CASE WHEN ${state.status}::text = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
           checked_at = now(), updated_at = now()
     WHERE reference = ${reference}
     RETURNING reference`;
  return rows.length === 1;
}

export type ArrivedPayout = Readonly<{ at: Date; localAmount: number; localCurrency: string; units: bigint; country: string; network: string; depositTx: string | null; exitTx: string }>;

/**
 * The payouts Switch says arrived, for the judges page: how many, and the first of them as it happened. Null when the
 * ledger cannot be read, so the page says so rather than a count it does not have.
 */
export async function payoutsArrived(): Promise<Readonly<{ count: number; first: ArrivedPayout | null }> | null> {
  try {
    const rows = await ledger`
      SELECT *, count(*) OVER ()::int AS arrived FROM viky_mobile_payouts
       WHERE status = 'COMPLETED' ORDER BY COALESCE(completed_at, updated_at) ASC LIMIT 1`;
    if (!rows[0]) return { count: 0, first: null };
    const row = rowOf(rows[0]);
    return {
      count: Number(rows[0].arrived),
      first: { at: row.completedAt ?? new Date(String(rows[0].updated_at)), localAmount: row.localAmount, localCurrency: row.localCurrency, units: row.units, country: row.country, network: row.network, depositTx: row.depositTx, exitTx: row.exitTx },
    };
  } catch {
    return null;
  }
}
