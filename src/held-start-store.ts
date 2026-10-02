import { neon } from "@neondatabase/serverless";
import type { Hex } from "viem";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import type { V2Kind } from "./v2-protocol";

/**
 * The first reading of a gift of the second version, read and attested, and held until the account the gift is for
 * has signed it (the review of 2 Oct 2026, R-15; src/held-start.ts). One row per gift: a newer reading replaces the
 * one before, and the row goes when the reading is sent. Nothing here opens or pays anything: the contract takes the
 * reading only with the recipient's own signature, which this table never holds.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS viky_held_starts (
  gift_id text PRIMARY KEY,
  account text NOT NULL,
  kind text NOT NULL,
  contract text NOT NULL,
  message jsonb NOT NULL,
  session_id text,
  after jsonb NOT NULL,
  held_at timestamptz NOT NULL DEFAULT now()
)`;

/** What the reading's own path writes once the contract has taken it: the id it binds the gift to, and what it tells the screen. */
export type HeldAfter = Readonly<{
  bindTo?: string;
  xp?: number;
  unit?: string;
  /** A climb: the row of its journal, written with the transaction once there is one, and the most it may start from. */
  reading?: Record<string, unknown>;
  maximumStart?: string;
}>;

export type HeldStart = Readonly<{
  giftId: string;
  account: string;
  kind: V2Kind;
  contract: Hex;
  /** The attestation's message as `serialiseMessage` writes it: every number as text. */
  message: Record<string, string | number>;
  /** A daily gift: the verification session whose attestation is sent. */
  sessionId: string | null;
  after: HeldAfter;
  heldAt: Date;
}>;

let executor: SqlExecutor | undefined;
let ready: Promise<void> | undefined;

export function configureHeldStartStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  ready = undefined;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** The table, made the first time it is needed in a process, so no deployment waits on a migration for it. */
export function ensureHeldStartSchema(): Promise<void> {
  ready ??= (async () => {
    const strings = Object.assign([SCHEMA], { raw: [SCHEMA] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

export async function holdStart(input: Omit<HeldStart, "heldAt">): Promise<void> {
  await ensureHeldStartSchema();
  await sql()`
    INSERT INTO viky_held_starts (gift_id, account, kind, contract, message, session_id, after, held_at)
    VALUES (${input.giftId}, ${input.account.toLowerCase()}, ${input.kind}, ${input.contract}, ${JSON.stringify(input.message)}::jsonb, ${input.sessionId}, ${JSON.stringify(input.after)}::jsonb, now())
    ON CONFLICT (gift_id) DO UPDATE SET
      account = EXCLUDED.account, kind = EXCLUDED.kind, contract = EXCLUDED.contract, message = EXCLUDED.message,
      session_id = EXCLUDED.session_id, after = EXCLUDED.after, held_at = now()`;
}

export async function loadHeldStart(giftId: string): Promise<HeldStart | null> {
  await ensureHeldStartSchema();
  const rows = await sql()`SELECT gift_id, account, kind, contract, message, session_id, after, held_at FROM viky_held_starts WHERE gift_id = ${giftId}`;
  const row = rows[0];
  if (!row) return null;
  const json = <T>(value: unknown): T => (typeof value === "string" ? (JSON.parse(value) as T) : (value as T));
  return {
    giftId: String(row.gift_id),
    account: String(row.account),
    kind: row.kind === "milestone" ? "milestone" : "daily",
    contract: String(row.contract) as Hex,
    message: json<Record<string, string | number>>(row.message),
    sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
    after: json<HeldAfter>(row.after),
    heldAt: new Date(String(row.held_at)),
  };
}

export async function dropHeldStart(giftId: string): Promise<void> {
  await ensureHeldStartSchema();
  await sql()`DELETE FROM viky_held_starts WHERE gift_id = ${giftId}`;
}
