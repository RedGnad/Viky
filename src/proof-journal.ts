import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";

/**
 * The public journal of what settled each day, and the proofs behind it (U2).
 *
 * Two different things, on purpose, because Privacy promises that the public sees only a pseudonym:
 * - **Public, for every settled day of a gift**: what happened (earned or gone back), the transaction that settled it,
 *   and the claim's fingerprint. All three are already public: the transaction is on chain, and the fingerprint is the
 *   nullifier the contract stores against replay (`usedNullifiers`), so anybody can check the chain accepted that exact
 *   claim once. None of them says who the person is.
 * - **Never public: the proof itself.** A Duolingo proof carries the account's username, its display name and its XP.
 *   It is served only to the two people in the gift, and to a judge for the one example the account holder agreed to
 *   publish (`exampleForJudges`).
 *
 * A day that went back carries no fingerprint: nothing was read, a drain settled it, and saying otherwise would be
 * inventing a proof that does not exist.
 *
 * Which session earned a day: the one recorded on the row, and for a day settled before that column existed, the
 * session whose relayed transaction is this day's transaction (`viky_relayed`). Both are recorded facts and neither
 * is a guess: one transaction carries one claim, so every day it *earned* was earned by that claim. A day that same
 * transaction drained is not covered by that claim, so the fallback never reaches one.
 */

export type SqlExecutor = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

let executor: SqlExecutor | undefined;

export function configureProofJournal(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

/** One settled day, as anybody may see it. */
export type JournalDay = Readonly<{
  day: number;
  outcome: "earned" | "returned";
  txHash: string;
  /** The nullifier the contract recorded for the claim that earned this day, or null for a day that went back. */
  fingerprint: string | null;
  /** Whether the proof behind that claim is still kept, so a screen never offers a download that cannot answer. */
  proofKept: boolean;
}>;

/** One milestone reading, as anybody may see it. A reading that changed nothing on chain has no transaction. */
export type JournalReading = Readonly<{
  id: number;
  purpose: string;
  outcome: string;
  attested: boolean;
  observedAt: number;
  txHash: string | null;
  fingerprint: string | null;
  proofKept: boolean;
}>;

const outcomeOf = (value: unknown): "earned" | "returned" | null => (value === "earned" || value === "returned" ? value : null);

/** Every settled day of a daily gift, oldest first, with the fingerprint of the claim that earned it. */
export async function dailyJournal(giftId: string): Promise<JournalDay[]> {
  const rows = await sql()`
    SELECT d.day, d.outcome, d.tx_hash, s.attestation #>> '{message,nullifier}' AS fingerprint, s.proofs IS NOT NULL AS proof_kept
      FROM viky_days d
      LEFT JOIN viky_proof_sessions s ON s.session_id = COALESCE(
                        d.proof_session_id,
                        (SELECT r.session_id FROM viky_relayed r
                          WHERE d.outcome = 'earned' AND r.tx_hash = d.tx_hash AND r.kind = 'check-in' AND r.session_id IS NOT NULL
                          ORDER BY r.id LIMIT 1))
     WHERE d.gift_id = ${giftId}
     ORDER BY d.day`;
  return rows.flatMap((row) => {
    const outcome = outcomeOf(row.outcome);
    if (!outcome) return [];
    return [
      {
        day: Number(row.day),
        outcome,
        txHash: String(row.tx_hash),
        fingerprint: row.fingerprint === null || row.fingerprint === undefined ? null : String(row.fingerprint),
        proofKept: row.proof_kept === true,
      },
    ];
  });
}

/** Every reading of a milestone gift, oldest first. The readings carry their own fingerprint and proofs (C2). */
export async function milestoneJournal(giftId: string): Promise<JournalReading[]> {
  const rows = await sql()`
    SELECT id, purpose, outcome, attested, observed_at, tx_hash, nullifier, proofs IS NOT NULL AS proof_kept
      FROM viky_milestone_readings
     WHERE gift_id = ${giftId}
     ORDER BY id`;
  return rows.map((row) => ({
    id: Number(row.id),
    purpose: String(row.purpose),
    outcome: String(row.outcome),
    attested: row.attested === true,
    observedAt: Number(row.observed_at),
    txHash: row.tx_hash === null || row.tx_hash === undefined ? null : String(row.tx_hash),
    fingerprint: row.nullifier === null || row.nullifier === undefined ? null : String(row.nullifier),
    proofKept: row.proof_kept === true,
  }));
}

/** A proof as it is handed over: the claim's fingerprint, and the proof exactly as the attestor signed it. */
export type KeptProof = Readonly<{ giftId: string; day?: number; readingId?: number; fingerprint: string | null; escrow: string | null; proof: unknown }>;

function parsed(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

/** The proof that earned one day of a gift, or null when that day went back, was settled before proofs were kept, or does not exist. */
export async function proofOfDay(giftId: string, day: number): Promise<KeptProof | null> {
  const rows = await sql()`
    SELECT s.proofs, s.attestation #>> '{message,nullifier}' AS fingerprint, g.escrow
      FROM viky_days d
      JOIN viky_gifts g ON g.gift_id = d.gift_id
      JOIN viky_proof_sessions s ON s.session_id = COALESCE(
                        d.proof_session_id,
                        (SELECT r.session_id FROM viky_relayed r
                          WHERE d.outcome = 'earned' AND r.tx_hash = d.tx_hash AND r.kind = 'check-in' AND r.session_id IS NOT NULL
                          ORDER BY r.id LIMIT 1))
     WHERE d.gift_id = ${giftId} AND d.day = ${day} AND d.outcome = 'earned'`;
  const row = rows[0];
  if (!row || row.proofs === null || row.proofs === undefined) return null;
  return {
    giftId,
    day,
    fingerprint: row.fingerprint === null || row.fingerprint === undefined ? null : String(row.fingerprint),
    escrow: row.escrow === null || row.escrow === undefined ? null : String(row.escrow),
    proof: parsed(row.proofs),
  };
}

/** The proof behind one milestone reading. */
export async function proofOfReading(giftId: string, readingId: number): Promise<KeptProof | null> {
  const rows = await sql()`
    SELECT r.proofs, r.nullifier, g.escrow
      FROM viky_milestone_readings r
      JOIN viky_gifts g ON g.gift_id = r.gift_id
     WHERE r.gift_id = ${giftId} AND r.id = ${readingId}`;
  const row = rows[0];
  if (!row || row.proofs === null || row.proofs === undefined) return null;
  return {
    giftId,
    readingId,
    fingerprint: row.nullifier === null || row.nullifier === undefined ? null : String(row.nullifier),
    escrow: row.escrow === null || row.escrow === undefined ? null : String(row.escrow),
    proof: parsed(row.proofs),
  };
}

/** The example a judge may replay: a day, its gift, and the account it belongs to. */
export type JudgesExample = Readonly<{ giftId: string; day: number; txHash: string; fingerprint: string; recipient: string; escrow: string | null }>;

/**
 * The newest credited day that still has its proof, among the gifts of the accounts given: Viky's own, whose holder
 * agreed on 18 Sep 2026 that this one proof may be public. Nobody else's gift can be picked, which is the whole point
 * of passing the accounts in rather than searching the table.
 */
export async function exampleForJudges(accounts: readonly string[]): Promise<JudgesExample | null> {
  if (accounts.length === 0) return null;
  const lowered = accounts.map((account) => account.toLowerCase());
  const rows = await sql()`
    SELECT d.gift_id, d.day, d.tx_hash, g.recipient, g.escrow, s.attestation #>> '{message,nullifier}' AS fingerprint
      FROM viky_days d
      JOIN viky_gifts g ON g.gift_id = d.gift_id
      JOIN viky_proof_sessions s ON s.session_id = COALESCE(
                        d.proof_session_id,
                        (SELECT r.session_id FROM viky_relayed r
                          WHERE d.outcome = 'earned' AND r.tx_hash = d.tx_hash AND r.kind = 'check-in' AND r.session_id IS NOT NULL
                          ORDER BY r.id LIMIT 1))
     WHERE d.outcome = 'earned'
       AND s.proofs IS NOT NULL
       AND lower(g.recipient) = ANY(${lowered as string[]})
     ORDER BY d.day DESC
     LIMIT 1`;
  const row = rows[0];
  if (!row || row.fingerprint === null || row.fingerprint === undefined) return null;
  return {
    giftId: String(row.gift_id),
    day: Number(row.day),
    txHash: String(row.tx_hash),
    fingerprint: String(row.fingerprint),
    recipient: String(row.recipient),
    // The contract that holds this gift travels with the example, so a judge needs nothing configured to ask it.
    escrow: row.escrow === null || row.escrow === undefined ? null : String(row.escrow),
  };
}
