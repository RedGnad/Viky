import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Hex } from "viem";
import type { SettledDay } from "./day-record";
import { configureProofSessionStore, type SqlExecutor } from "./proof-session-store";
import { neon } from "@neondatabase/serverless";

/**
 * Off-chain state of a gift that the contract cannot hold: the claim link secret (hashed), the contact
 * hash it was issued for, the two names people call each other by (src/gift-names.ts), and the transaction
 * hashes of each relayed step for the judges page. The contact itself is never stored: the funder sends the link.
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
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS escrow text;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS goal_username text;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS username_source text;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS binding_code text;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS binding_code_expires_at timestamptz;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS bound_at timestamptz;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS goal_profile_id text;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE viky_gifts ADD COLUMN IF NOT EXISTS funder_name text;
CREATE TABLE IF NOT EXISTS viky_creations (
  nonce text PRIMARY KEY,
  funder text NOT NULL,
  contact_hash text NOT NULL,
  goal_type smallint NOT NULL,
  daily_target integer NOT NULL,
  duration_days integer NOT NULL,
  amount text NOT NULL,
  goal_username text,
  recipient_name text,
  funder_name text,
  claim_token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  tx_hash text,
  gift_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viky_creations_pending ON viky_creations (status, started_at);
CREATE TABLE IF NOT EXISTS viky_days (
  gift_id text NOT NULL,
  day integer NOT NULL,
  outcome text NOT NULL,
  tx_hash text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gift_id, day)
);
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
  /** The contract that holds this gift (D30: several deployments serve their own gifts). */
  escrow: Hex | null;
  /** Public mode (D27): the account read by the attested fetch, who named it, and the binding state. */
  goalUsername: string | null;
  usernameSource: "funder" | "recipient" | null;
  bindingCode: string | null;
  bindingCodeExpiresAt: Date | null;
  boundAt: Date | null;
  goalProfileId: string | null;
  /** The first name of the person it is for, and the funder's name as they know them. Null on gifts made before 17 Sep. */
  recipientName: string | null;
  funderName: string | null;
  /** The hash of the link's key, never the key: kept so a request can prove it holds the link. */
  claimTokenHash: string;
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

/** Whether a key is this gift's link key, compared without telling a guesser how close they came. */
export function holdsGiftLink(record: Pick<GiftRecord, "claimTokenHash">, token: string | null): boolean {
  if (!token) return false;
  const given = Buffer.from(claimTokenHash(token), "hex");
  const kept = Buffer.from(record.claimTokenHash, "hex");
  return given.length === kept.length && timingSafeEqual(given, kept);
}

export async function saveGift(input: {
  giftId: string;
  funder: string;
  contactHash: Hex;
  /** The link's key, hashed here; or its hash already, when a pending creation is completed later (D87). */
  claimToken?: string;
  claimTokenHash?: string;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  createdTx: Hex;
  /** The contract the gift was created on. */
  escrow: Hex;
  /** Set when the funder knows the recipient's account: no binding code is needed then (D27). */
  goalUsername?: string;
  /** Checked by `giftNameProblem` before this is called; a page loaded before the names existed sends neither. */
  recipientName?: string;
  funderName?: string;
}): Promise<void> {
  const keyHash = input.claimTokenHash ?? (input.claimToken === undefined ? undefined : claimTokenHash(input.claimToken));
  if (!keyHash) throw new Error("A gift is saved with its link's key or the key's hash");
  const inserted = await sql()`
    INSERT INTO viky_gifts
      (gift_id, funder, contact_hash, claim_token_hash, goal_type, daily_target, duration_days, amount, created_tx, escrow, goal_username, username_source,
       recipient_name, funder_name)
    VALUES (${input.giftId}, ${input.funder.toLowerCase()}, ${input.contactHash}, ${keyHash},
            ${input.goalType}, ${input.dailyTarget}, ${input.durationDays}, ${input.amount.toString()}, ${input.createdTx},
            ${input.escrow.toLowerCase()}, ${input.goalUsername ?? null}, ${input.goalUsername ? "funder" : null},
            ${input.recipientName ?? null}, ${input.funderName ?? null})
    ON CONFLICT (gift_id) DO NOTHING
    RETURNING gift_id`;
  if (inserted.length > 0) return;
  // The id is taken. The same funding transaction is a retry and is fine; a different one means two
  // contracts minted the same id, and staying silent would lose a gift whose money is already in
  // escrow (D35). Fail loudly instead: the funder sees a failure rather than a link that never works.
  const existing = await loadGift(input.giftId);
  if (existing && existing.createdTx.toLowerCase() === input.createdTx.toLowerCase()) return;
  throw new Error(`Gift ${input.giftId} is already recorded with a different funding transaction`);
}

/** Records which contract holds gifts saved before the column existed (a one-off, run by the migration). */
export async function backfillEscrow(escrow: Hex): Promise<number> {
  const rows = await sql()`UPDATE viky_gifts SET escrow = ${escrow.toLowerCase()} WHERE escrow IS NULL RETURNING gift_id`;
  return rows.length;
}

/** Every gift the app knows, for the daily pass. */
export async function loadAllGifts(): Promise<GiftRecord[]> {
  const rows = await sql()`SELECT * FROM viky_gifts ORDER BY gift_id`;
  return rows.map(toRecord);
}

/** The recipient names their own account; a fresh code must then be proved in the display name. */
export async function setRecipientUsername(giftId: string, username: string, code: string, expiresAt: Date): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_gifts
       SET goal_username = ${username}, username_source = 'recipient', binding_code = ${code},
           binding_code_expires_at = ${expiresAt.toISOString()}
     WHERE gift_id = ${giftId} AND bound_at IS NULL
     RETURNING gift_id`;
  return rows.length === 1;
}

/** Records the proved binding; the code is cleared so it can never be reused. */
export async function markBound(giftId: string, profileId: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_gifts
       SET bound_at = now(), goal_profile_id = ${profileId}, binding_code = NULL, binding_code_expires_at = NULL
     WHERE gift_id = ${giftId} AND bound_at IS NULL
     RETURNING gift_id`;
  return rows.length === 1;
}

/** Gifts the keeper reads every day: bound to an account, opened by a recipient. */
export async function loadBoundGifts(): Promise<GiftRecord[]> {
  const rows = await sql()`SELECT * FROM viky_gifts WHERE bound_at IS NOT NULL AND recipient IS NOT NULL ORDER BY gift_id`;
  return rows.map(toRecord);
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
    escrow: row.escrow === null || row.escrow === undefined ? null : (String(row.escrow) as Hex),
    goalUsername: row.goal_username === null || row.goal_username === undefined ? null : String(row.goal_username),
    usernameSource: row.username_source === "funder" || row.username_source === "recipient" ? row.username_source : null,
    bindingCode: row.binding_code === null || row.binding_code === undefined ? null : String(row.binding_code),
    bindingCodeExpiresAt: toDate(row.binding_code_expires_at),
    boundAt: toDate(row.bound_at),
    goalProfileId: row.goal_profile_id === null || row.goal_profile_id === undefined ? null : String(row.goal_profile_id),
    recipientName: row.recipient_name === null || row.recipient_name === undefined ? null : String(row.recipient_name),
    funderName: row.funder_name === null || row.funder_name === undefined ? null : String(row.funder_name),
    claimTokenHash: String(row.claim_token_hash),
  };
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
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

/**
 * A gift being made, recorded before its money is relayed (D87): the authorization's nonce, which is the hash of the
 * exact terms, names the creation; everything needed to record the gift is kept with it, and the transaction's hash
 * is written the moment it is submitted.
 */
export type CreationRow = Readonly<{
  nonce: Hex;
  funder: string;
  contactHash: Hex;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  goalUsername: string | null;
  recipientName: string | null;
  funderName: string | null;
  claimTokenHash: string;
  status: "pending" | "complete" | "abandoned";
  txHash: Hex | null;
  giftId: string | null;
  startedAt: Date;
}>;

function toCreation(row: Record<string, unknown>): CreationRow {
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  const status = row.status === "complete" || row.status === "abandoned" ? row.status : "pending";
  return {
    nonce: String(row.nonce) as Hex,
    funder: String(row.funder),
    contactHash: String(row.contact_hash) as Hex,
    goalType: Number(row.goal_type),
    dailyTarget: Number(row.daily_target),
    durationDays: Number(row.duration_days),
    amount: BigInt(String(row.amount)),
    goalUsername: text(row.goal_username),
    recipientName: text(row.recipient_name),
    funderName: text(row.funder_name),
    claimTokenHash: String(row.claim_token_hash),
    status,
    txHash: text(row.tx_hash) as Hex | null,
    giftId: text(row.gift_id),
    startedAt: toDate(row.started_at) ?? new Date(0),
  };
}

/** Records a creation before its relay, or finds the one already recorded under the same nonce. */
export async function beginCreation(
  input: Omit<CreationRow, "status" | "txHash" | "giftId" | "startedAt">,
): Promise<{ inserted: true } | { inserted: false; existing: CreationRow }> {
  const rows = await sql()`
    INSERT INTO viky_creations (nonce, funder, contact_hash, goal_type, daily_target, duration_days, amount, goal_username, recipient_name, funder_name, claim_token_hash)
    VALUES (${input.nonce.toLowerCase()}, ${input.funder.toLowerCase()}, ${input.contactHash}, ${input.goalType}, ${input.dailyTarget}, ${input.durationDays},
            ${input.amount.toString()}, ${input.goalUsername}, ${input.recipientName}, ${input.funderName}, ${input.claimTokenHash})
    ON CONFLICT (nonce) DO NOTHING
    RETURNING nonce`;
  if (rows.length > 0) return { inserted: true };
  const existing = await loadCreation(input.nonce);
  if (!existing) throw new Error(`Creation ${input.nonce} is neither new nor recorded`);
  return { inserted: false, existing };
}

export async function loadCreation(nonce: Hex): Promise<CreationRow | null> {
  const rows = await sql()`SELECT * FROM viky_creations WHERE nonce = ${nonce.toLowerCase()}`;
  return rows.length === 0 ? null : toCreation(rows[0]);
}

/** Takes a pending creation over for a new attempt, with the key of this attempt; only if nobody took it since. */
export async function restartCreation(nonce: Hex, claimTokenHashOfAttempt: string, previousStart: Date): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_creations SET started_at = now(), tx_hash = NULL, status = 'pending', claim_token_hash = ${claimTokenHashOfAttempt}
     WHERE nonce = ${nonce.toLowerCase()} AND status IN ('pending', 'abandoned')
       AND date_trunc('milliseconds', started_at) = date_trunc('milliseconds', ${previousStart.toISOString()}::timestamptz)
     RETURNING nonce`;
  return rows.length === 1;
}

export async function markCreationSubmitted(nonce: Hex, txHash: Hex): Promise<void> {
  await sql()`UPDATE viky_creations SET tx_hash = ${txHash} WHERE nonce = ${nonce.toLowerCase()} AND status = 'pending'`;
}

export async function completeCreation(nonce: Hex, giftId: string, txHash: Hex, claimTokenHashOfLink: string): Promise<void> {
  await sql()`
    UPDATE viky_creations SET status = 'complete', gift_id = ${giftId}, tx_hash = ${txHash}, claim_token_hash = ${claimTokenHashOfLink}
     WHERE nonce = ${nonce.toLowerCase()}`;
}

export async function abandonCreation(nonce: Hex): Promise<void> {
  await sql()`UPDATE viky_creations SET status = 'abandoned' WHERE nonce = ${nonce.toLowerCase()} AND status = 'pending'`;
}

/** Creations still pending that started before this moment, oldest first. */
export async function loadPendingCreations(startedBefore: Date): Promise<CreationRow[]> {
  const rows = await sql()`SELECT * FROM viky_creations WHERE status = 'pending' AND started_at < ${startedBefore.toISOString()} ORDER BY started_at`;
  return rows.map(toCreation);
}

/**
 * One row per settled day, written from the receipt of the transaction that settled it (src/day-record.ts). A day is
 * settled once on chain, so a second write of the same day keeps the first row.
 */
export async function recordSettledDays(giftId: string, days: readonly SettledDay[], txHash: Hex): Promise<number> {
  let written = 0;
  for (const entry of days) {
    const rows = await sql()`
      INSERT INTO viky_days (gift_id, day, outcome, tx_hash)
      VALUES (${giftId}, ${entry.day}, ${entry.outcome}, ${txHash})
      ON CONFLICT (gift_id, day) DO NOTHING
      RETURNING day`;
    written += rows.length;
  }
  return written;
}

/** The recorded days of these gifts, by gift. Days settled before the record existed are simply absent. */
export async function loadSettledDays(giftIds: readonly string[]): Promise<Map<string, SettledDay[]>> {
  const byGift = new Map<string, SettledDay[]>();
  if (giftIds.length === 0) return byGift;
  const rows = await sql()`SELECT gift_id, day, outcome FROM viky_days WHERE gift_id = ANY(${giftIds as string[]}) ORDER BY gift_id, day`;
  for (const row of rows) {
    const outcome = row.outcome === "earned" || row.outcome === "returned" ? row.outcome : undefined;
    if (!outcome) continue;
    const list = byGift.get(String(row.gift_id)) ?? [];
    list.push({ day: Number(row.day), outcome });
    byGift.set(String(row.gift_id), list);
  }
  return byGift;
}

/** When the last missed day was sent back to the funder, from the recorded refund transactions. */
export async function lastRefundAt(giftId: string): Promise<Date | null> {
  const rows = await sql()`SELECT created_at FROM viky_relayed WHERE gift_id = ${giftId} AND kind = 'refund' ORDER BY created_at DESC LIMIT 1`;
  return rows.length === 0 ? null : toDate(rows[0].created_at);
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
