import { createHash, randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { configureProofSessionStore, type SqlExecutor } from "./proof-session-store";
import { neon } from "@neondatabase/serverless";

/**
 * Off-chain state of a gift that the contract cannot hold: the claim link secret (hashed), the contact
 * hash it was issued for, and the transaction hashes of each relayed step for the judges page. The
 * contact itself is never stored: the funder sends the link.
 */

export const GIFT_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_gifts (
  gift_id text PRIMARY KEY,
  funder text NOT NULL,
  contact_hash text NOT NULL,
  claim_token_hash text NOT NULL,
  goal_type smallint NOT NULL,
  daily_target integer NOT NULL,
  duration_days integer NOT NULL,
  amount text NOT NULL,
  recipient text,
  created_tx text NOT NULL,
  claimed_tx text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
CREATE TABLE IF NOT EXISTS viky_relayed (
  id serial PRIMARY KEY,
  gift_id text NOT NULL,
  kind text NOT NULL,
  session_id text,
  tx_hash text NOT NULL,
  block_number bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viky_relayed_gift ON viky_relayed (gift_id, created_at DESC);
`;

let executor: SqlExecutor | undefined;

export function configureGiftStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  configureProofSessionStore(custom);
}

function sql(): SqlExecutor {
  if (executor) return executor;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url) as unknown as SqlExecutor;
}

export type GiftRecord = Readonly<{
  giftId: string;
  funder: string;
  contactHash: Hex;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  recipient: string | null;
  createdTx: Hex;
  claimedTx: Hex | null;
}>;

export async function ensureGiftSchema(): Promise<void> {
  for (const statement of GIFT_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/** A fresh claim secret. Only its hash is stored; the plain value goes into the link once. */
export function newClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export function claimTokenHash(token: string): string {
  return createHash("sha256").update(`viky:claim:v1:${token}`).digest("hex");
}

export async function saveGift(input: {
  giftId: string;
  funder: string;
  contactHash: Hex;
  claimToken: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  createdTx: Hex;
}): Promise<void> {
  await sql()`
    INSERT INTO viky_gifts
      (gift_id, funder, contact_hash, claim_token_hash, goal_type, daily_target, duration_days, amount, created_tx)
    VALUES (${input.giftId}, ${input.funder.toLowerCase()}, ${input.contactHash}, ${claimTokenHash(input.claimToken)},
            ${input.goalType}, ${input.dailyTarget}, ${input.durationDays}, ${input.amount.toString()}, ${input.createdTx})
    ON CONFLICT (gift_id) DO NOTHING`;
}

function toRecord(row: Record<string, unknown>): GiftRecord {
  return {
    giftId: String(row.gift_id),
    funder: String(row.funder),
    contactHash: String(row.contact_hash) as Hex,
    goalType: Number(row.goal_type),
    dailyTarget: Number(row.daily_target),
    durationDays: Number(row.duration_days),
    amount: BigInt(String(row.amount)),
    recipient: row.recipient === null || row.recipient === undefined ? null : String(row.recipient),
    createdTx: String(row.created_tx) as Hex,
    claimedTx: row.claimed_tx === null || row.claimed_tx === undefined ? null : (String(row.claimed_tx) as Hex),
  };
}

export async function loadGift(giftId: string): Promise<GiftRecord | null> {
  const rows = await sql()`SELECT * FROM viky_gifts WHERE gift_id = ${giftId}`;
  return rows[0] ? toRecord(rows[0]) : null;
}

/** The gift the claim link points to, only if the secret matches and nobody claimed it yet. */
export async function loadGiftForClaim(giftId: string, claimToken: string): Promise<GiftRecord | null> {
  const rows = await sql()`
    SELECT * FROM viky_gifts
     WHERE gift_id = ${giftId} AND claim_token_hash = ${claimTokenHash(claimToken)} AND recipient IS NULL`;
  return rows[0] ? toRecord(rows[0]) : null;
}

/** Records the claim once; a second claimant finds the row already taken. */
export async function markClaimed(giftId: string, recipient: string, claimedTx: Hex): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_gifts SET recipient = ${recipient.toLowerCase()}, claimed_tx = ${claimedTx}, claimed_at = now()
     WHERE gift_id = ${giftId} AND recipient IS NULL
     RETURNING gift_id`;
  return rows.length === 1;
}

export async function loadGiftsOf(account: string): Promise<GiftRecord[]> {
  const rows = await sql()`
    SELECT * FROM viky_gifts WHERE funder = ${account.toLowerCase()} OR recipient = ${account.toLowerCase()}
     ORDER BY created_at DESC`;
  return rows.map(toRecord);
}

export type RelayedKind = "create" | "claim" | "check-in" | "withdraw" | "drain" | "finalise" | "refund";

export async function recordRelayed(input: { giftId: string; kind: RelayedKind; sessionId?: string; txHash: Hex; blockNumber?: bigint }): Promise<void> {
  await sql()`
    INSERT INTO viky_relayed (gift_id, kind, session_id, tx_hash, block_number)
    VALUES (${input.giftId}, ${input.kind}, ${input.sessionId ?? null}, ${input.txHash}, ${input.blockNumber === undefined ? null : input.blockNumber.toString()})`;
}

export async function loadRelayed(giftId: string): Promise<Array<{ kind: RelayedKind; sessionId: string | null; txHash: Hex; blockNumber: bigint | null }>> {
  const rows = await sql()`SELECT kind, session_id, tx_hash, block_number FROM viky_relayed WHERE gift_id = ${giftId} ORDER BY created_at ASC`;
  return rows.map((row) => ({
    kind: String(row.kind) as RelayedKind,
    sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
    txHash: String(row.tx_hash) as Hex,
    blockNumber: row.block_number === null || row.block_number === undefined ? null : BigInt(String(row.block_number)),
  }));
}

/** Whether a check-in session has already been relayed, so a retry never submits the same attestation twice. */
export async function relayedForSession(sessionId: string): Promise<Hex | null> {
  const rows = await sql()`SELECT tx_hash FROM viky_relayed WHERE session_id = ${sessionId} AND kind = 'check-in' LIMIT 1`;
  return rows[0] ? (String(rows[0].tx_hash) as Hex) : null;
}
