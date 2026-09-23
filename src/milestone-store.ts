import { neon } from "@neondatabase/serverless";
import type { Hex } from "viem";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * What a milestone gift needs kept beside the contract, in two tables of its own so the daily gift's rows stay as
 * they are. The gift's common record (the link's key, the names, the contract, the Chess.com name the funder gave,
 * the binding code) is `viky_gifts`, as for every gift.
 *
 * - `viky_milestone_gifts`: which condition and which cadence, and where the person stood when the funder signed.
 *   That standing is a plain reading, the one the funder saw with their own eyes (D45); the contract holds the two
 *   numbers it produced, the target and the highest accepted start, and those are always read from the contract.
 * - `viky_milestone_readings`: every reading taken for a gift, plain or attested, with what it said and what became
 *   of it. The attested ones keep their proofs, so anybody can check the reading that moved money. The latest one is
 *   what a screen calls "today".
 */

export const MILESTONE_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_milestone_gifts (
  gift_id text PRIMARY KEY,
  condition_id text NOT NULL,
  mode text NOT NULL,
  standing_at_offer integer NOT NULL,
  standing_read_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE viky_milestone_gifts ADD COLUMN IF NOT EXISTS portal text;
ALTER TABLE viky_milestone_gifts ADD COLUMN IF NOT EXISTS course text;
CREATE TABLE IF NOT EXISTS viky_milestone_readings (
  id serial PRIMARY KEY,
  gift_id text NOT NULL,
  purpose text NOT NULL,
  attested boolean NOT NULL,
  username text NOT NULL,
  player_id text,
  rating integer,
  rated_at bigint,
  observed_at bigint NOT NULL,
  nullifier text,
  outcome text NOT NULL,
  tx_hash text,
  proofs jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viky_milestone_readings_gift ON viky_milestone_readings (gift_id, created_at DESC);
ALTER TABLE viky_milestone_readings ADD COLUMN IF NOT EXISTS rd integer;
`;

let executor: SqlExecutor | undefined;

export function configureMilestoneStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function ensureMilestoneSchema(): Promise<void> {
  for (const statement of MILESTONE_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

export type MilestoneRecord = Readonly<{
  giftId: string;
  conditionId: string;
  mode: string;
  standingAtOffer: number;
  standingReadAt: Date;
  /** The student portal a university gift was made on (D165), by its id in src/portal-store.ts; nothing for the rest. */
  portal: string | null;
  /** The course a shown course gift is for (D178), by its slug on the source; nothing for the rest. */
  course?: string | null;
}>;

export async function saveMilestoneGift(input: { giftId: string; conditionId: string; mode: string; standingAtOffer: number; standingReadAt: Date; portal?: string | null; course?: string | null }): Promise<void> {
  await sql()`
    INSERT INTO viky_milestone_gifts (gift_id, condition_id, mode, standing_at_offer, standing_read_at, portal, course)
    VALUES (${input.giftId}, ${input.conditionId}, ${input.mode}, ${input.standingAtOffer}, ${input.standingReadAt.toISOString()}, ${input.portal ?? null}, ${input.course ?? null})
    ON CONFLICT (gift_id) DO NOTHING`;
}

function toRecord(row: Record<string, unknown>): MilestoneRecord {
  return {
    giftId: String(row.gift_id),
    conditionId: String(row.condition_id),
    mode: String(row.mode),
    standingAtOffer: Number(row.standing_at_offer),
    standingReadAt: row.standing_read_at instanceof Date ? row.standing_read_at : new Date(String(row.standing_read_at)),
    portal: row.portal === null || row.portal === undefined ? null : String(row.portal),
    course: row.course === null || row.course === undefined ? null : String(row.course),
  };
}

export async function loadMilestoneGift(giftId: string): Promise<MilestoneRecord | null> {
  const rows = await sql()`SELECT * FROM viky_milestone_gifts WHERE gift_id = ${giftId}`;
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function loadMilestoneGifts(giftIds: readonly string[]): Promise<Map<string, MilestoneRecord>> {
  if (giftIds.length === 0) return new Map();
  const rows = await sql()`SELECT * FROM viky_milestone_gifts WHERE gift_id = ANY(${giftIds as string[]})`;
  return new Map(rows.map((row) => [String(row.gift_id), toRecord(row)]));
}

/** Why a reading was taken. */
export type ReadingPurpose = "start" | "reach" | "look";

export type ReadingOutcome =
  /** The first reading, recorded on the contract as the start. */
  | "started"
  /** The target was reached and the contract released the gift. */
  | "reached"
  /** Read, and the target is not reached yet. Nothing was sent. */
  | "notYet"
  /** Anything the contract or the source refused, by its typed code. */
  | `refused:${string}`;

export type MilestoneReading = Readonly<{
  giftId: string;
  purpose: ReadingPurpose;
  attested: boolean;
  username: string;
  playerId: string | null;
  rating: number | null;
  ratedAt: number | null;
  /** The rating's RD when it was read (D90). */
  rd?: number | null;
  observedAt: number;
  nullifier: Hex | null;
  outcome: ReadingOutcome;
  txHash: Hex | null;
  proofs?: unknown;
  createdAt?: Date;
}>;

export async function recordReading(reading: MilestoneReading): Promise<void> {
  await sql()`
    INSERT INTO viky_milestone_readings
      (gift_id, purpose, attested, username, player_id, rating, rated_at, rd, observed_at, nullifier, outcome, tx_hash, proofs)
    VALUES (${reading.giftId}, ${reading.purpose}, ${reading.attested}, ${reading.username}, ${reading.playerId}, ${reading.rating},
            ${reading.ratedAt}, ${reading.rd ?? null}, ${reading.observedAt}, ${reading.nullifier}, ${reading.outcome}, ${reading.txHash},
            ${reading.proofs === undefined ? null : JSON.stringify(reading.proofs)})`;
}

function toReading(row: Record<string, unknown>): MilestoneReading {
  const optionalNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    giftId: String(row.gift_id),
    purpose: String(row.purpose) as ReadingPurpose,
    attested: Boolean(row.attested),
    username: String(row.username),
    playerId: row.player_id === null || row.player_id === undefined ? null : String(row.player_id),
    rating: optionalNumber(row.rating),
    ratedAt: optionalNumber(row.rated_at),
    rd: optionalNumber(row.rd),
    observedAt: Number(row.observed_at),
    nullifier: row.nullifier === null || row.nullifier === undefined ? null : (String(row.nullifier) as Hex),
    outcome: String(row.outcome) as ReadingOutcome,
    txHash: row.tx_hash === null || row.tx_hash === undefined ? null : (String(row.tx_hash) as Hex),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

/** The most recent reading that said where the person stands, whatever became of it. */
export async function latestRating(giftId: string): Promise<MilestoneReading | null> {
  const rows = await sql()`
    SELECT * FROM viky_milestone_readings WHERE gift_id = ${giftId} AND rating IS NOT NULL ORDER BY observed_at DESC, id DESC LIMIT 1`;
  return rows[0] ? toReading(rows[0]) : null;
}

/**
 * The last reading of any kind, refusals included, which is what says whether Chess.com has closed the account (U1).
 * `latestRating` cannot answer that: a closed account has no rating to record.
 */
export async function lastReading(giftId: string): Promise<MilestoneReading | null> {
  const rows = await sql()`
    SELECT * FROM viky_milestone_readings WHERE gift_id = ${giftId} ORDER BY observed_at DESC, id DESC LIMIT 1`;
  return rows[0] ? toReading(rows[0]) : null;
}

/** The readings that moved something on the contract, oldest first, for the judges page. */
export async function attestedReadings(giftId: string): Promise<MilestoneReading[]> {
  const rows = await sql()`
    SELECT * FROM viky_milestone_readings WHERE gift_id = ${giftId} AND attested = true ORDER BY observed_at ASC, id ASC`;
  return rows.map(toReading);
}

/** Whether the keeper already read this gift in this pass's slot today, so a retried cron does not read twice. */
export async function readSince(giftId: string, sinceSeconds: number): Promise<boolean> {
  const rows = await sql()`
    SELECT 1 FROM viky_milestone_readings WHERE gift_id = ${giftId} AND purpose IN ('reach', 'look') AND observed_at >= ${sinceSeconds} LIMIT 1`;
  return rows.length > 0;
}

/** A fresh code for the name the funder gave. The name itself never changes here: it is part of what they signed for. */
export async function setMilestoneCode(giftId: string, code: string, expiresAt: Date): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_gifts SET binding_code = ${code}, binding_code_expires_at = ${expiresAt.toISOString()}
     WHERE gift_id = ${giftId} AND bound_at IS NULL
     RETURNING gift_id`;
  return rows.length === 1;
}

/**
 * Follows a change of Chess.com name on a gift already bound. Only called once an attested reading has shown the new
 * name belongs to the same player, so the account the funder named is still the one read.
 */
export async function followRename(giftId: string, playerId: string, username: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_gifts SET goal_username = ${username}
     WHERE gift_id = ${giftId} AND bound_at IS NOT NULL AND goal_profile_id = ${playerId}
     RETURNING gift_id`;
  return rows.length === 1;
}
