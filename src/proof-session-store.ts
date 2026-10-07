import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { Hex } from "viem";
import type { DuolingoEvidence } from "./duolingo-proof-policy";

/**
 * Server-side state for verification sessions, ported from Lock-in's Neon store and reduced to one
 * table. A session row is the ONLY source of the account, the gift, the phase, the day and the
 * profile a proof is checked against: taking any of them from the request body would let anyone
 * claim someone else's proof, replay a baseline as a check-in, or move a proof between gifts.
 *
 * Expiry is enforced in SQL so a clock the client controls can never widen the window, and the
 * consume-and-write happens in ONE statement so a burned session can never leave a missing result.
 */

/**
 * How long an opened session can be answered. It is the one clock of a shown proof (7 Oct 2026): the page waits for
 * as long as it runs (src/client/gift.ts) and a milestone's proof is fresh for as long as it runs
 * (src/shown-verification.ts), where each of those had its own ten minutes before. The first real passes on a phone,
 * a student of Toulouse, took 9 min 31 s and 8 min 27 s from the session's opening to the proof: ten minutes left
 * under a minute to come back to the page, and thirty leave three passes' worth.
 */
export const PROOF_SESSION_TTL_SECONDS = 30 * 60;
export const PROOF_SESSION_PRUNE_SECONDS = 24 * 60 * 60;

export const PROOF_SESSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_proof_sessions (
  session_id text PRIMARY KEY,
  account text NOT NULL,
  gift_id text NOT NULL,
  goal_type smallint NOT NULL DEFAULT 1,
  phase text NOT NULL,
  day_index integer NOT NULL DEFAULT 0,
  duolingo_username text,
  duolingo_profile_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  evidence jsonb,
  attestation jsonb,
  proofs jsonb
);
CREATE INDEX IF NOT EXISTS viky_proof_sessions_gift_account
  ON viky_proof_sessions (gift_id, account, consumed_at DESC);
ALTER TABLE viky_proof_sessions ADD COLUMN IF NOT EXISTS condition_id text NOT NULL DEFAULT 'duolingo-daily';
ALTER TABLE viky_proof_sessions ALTER COLUMN duolingo_username DROP NOT NULL;
ALTER TABLE viky_proof_sessions ALTER COLUMN duolingo_profile_id DROP NOT NULL;
ALTER TABLE viky_proof_sessions ADD COLUMN IF NOT EXISTS request_url text;
`;

/** A tagged-template SQL executor: Neon's `neon(url)` in production, a PGlite adapter in tests. */
export type SqlExecutor = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

let executor: SqlExecutor | undefined;

export function configureProofSessionStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  const url = databaseUrl();
  return neon(url) as unknown as SqlExecutor;
}

/**
 * The phase a session is opened for: a daily gift binds the account once (baseline) and then proves one day at a
 * time (check-in); a milestone shown from an account takes one proof that reaches it (reach) (D162).
 */
export type ProofSessionPhase = "baseline" | "check-in" | "reach";

export type ProofSession = Readonly<{
  sessionId: string;
  account: string;
  giftId: string;
  goalType: number;
  /** Which condition the proof is shown for (src/shown-conditions.ts). Rows from before it existed are the daily lesson. */
  conditionId: string;
  phase: ProofSessionPhase;
  dayIndex: number;
  /** The Duolingo account a daily gift binds: the one condition whose proof is checked against a named profile. */
  duolingoUsername?: string;
  duolingoProfileId?: string;
  /** The address of the verification page, kept so a page loaded again offers the same one (`loadOpenShownSession`). */
  requestUrl?: string;
}>;

export type StoredAttestation = Readonly<{
  message: Record<string, string | number>;
  signature: Hex;
}>;

export async function ensureProofSessionSchema(): Promise<void> {
  for (const statement of PROOF_SESSION_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/**
 * The verification page's column, made the first time a session is saved or looked for in a process (7 Oct 2026):
 * production never runs the migration, and a session is opened by a person who is waiting.
 */
let requestUrlColumn: Promise<void> | undefined;
function withRequestUrlColumn(): Promise<void> {
  requestUrlColumn ??= (async () => {
    await sql()`ALTER TABLE viky_proof_sessions ADD COLUMN IF NOT EXISTS request_url text`;
  })().catch((error: unknown) => {
    requestUrlColumn = undefined;
    throw error;
  });
  return requestUrlColumn;
}

export async function saveProofSession(session: ProofSession): Promise<void> {
  await withRequestUrlColumn();
  await sql()`
    INSERT INTO viky_proof_sessions
      (session_id, account, gift_id, goal_type, condition_id, phase, day_index, duolingo_username, duolingo_profile_id, request_url)
    VALUES (${session.sessionId}, ${session.account.toLowerCase()}, ${session.giftId}, ${session.goalType}, ${session.conditionId},
            ${session.phase}, ${session.dayIndex}, ${session.duolingoUsername ?? null}, ${session.duolingoProfileId ?? null}, ${session.requestUrl ?? null})
    ON CONFLICT (session_id) DO NOTHING`;
}

/** A milestone's session still waiting for its proof, as the page that opened it needs it back. */
export type OpenShownSession = Readonly<{ sessionId: string; conditionId: string; requestUrl: string; /** How long it can still be answered, by the database's clock. */ secondsLeft: number }>;

/**
 * The newest session this account opened for this gift's one proof that is neither answered nor aged out, or nothing
 * (7 Oct 2026). A phone loads the gift's page again when the person comes back from the verification page, and the
 * page kept the session in its own memory alone: two real proofs were made and never asked for. The row is what
 * survives, so the page asks for it by the gift and the account of the signed cookie, never by a session it names.
 */
export async function loadOpenShownSession(giftId: string, account: string): Promise<OpenShownSession | null> {
  if (!/^\d{1,78}$/.test(giftId)) return null;
  await withRequestUrlColumn();
  const rows = await sql()`
    SELECT session_id, condition_id, request_url,
           EXTRACT(EPOCH FROM (created_at + make_interval(secs => ${PROOF_SESSION_TTL_SECONDS}) - now())) AS seconds_left
      FROM viky_proof_sessions
     WHERE gift_id = ${giftId} AND account = ${account.toLowerCase()} AND phase = 'reach'
       AND consumed_at IS NULL AND request_url IS NOT NULL
       AND created_at > now() - make_interval(secs => ${PROOF_SESSION_TTL_SECONDS})
     ORDER BY created_at DESC
     LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return { sessionId: String(row.session_id), conditionId: String(row.condition_id), requestUrl: String(row.request_url), secondsLeft: Math.max(0, Math.floor(Number(row.seconds_left))) };
}

/** The live session, or null if it does not exist, is already consumed, or has aged out. */
export async function loadProofSession(sessionId: string): Promise<ProofSession | null> {
  const rows = await sql()`
    SELECT session_id, account, gift_id, goal_type, condition_id, phase, day_index, duolingo_username, duolingo_profile_id
      FROM viky_proof_sessions
      WHERE session_id = ${sessionId}
        AND consumed_at IS NULL
        AND created_at > now() - make_interval(secs => ${PROOF_SESSION_TTL_SECONDS})`;
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: String(row.session_id),
    account: String(row.account),
    giftId: String(row.gift_id),
    goalType: Number(row.goal_type),
    conditionId: String(row.condition_id ?? "duolingo-daily"),
    phase: row.phase === "check-in" ? "check-in" : row.phase === "reach" ? "reach" : "baseline",
    dayIndex: Number(row.day_index),
    ...(row.duolingo_username ? { duolingoUsername: String(row.duolingo_username) } : {}),
    ...(row.duolingo_profile_id ? { duolingoProfileId: String(row.duolingo_profile_id) } : {}),
  };
}

/**
 * Deletes the rows of a gift's morning readings from a connected source (src/connected-checkin.ts names them
 * `connected:<gift>:...`), once the gift is over (src/gift-end-erasure.ts). Each held a day, a yes or a no and the
 * message signed for the contract, which the chain keeps; nothing reads them after the gift's end. Returns how many.
 */
export async function deleteConnectedReadings(giftId: string): Promise<number> {
  if (!/^\d{1,78}$/.test(giftId)) return 0;
  const rows = await sql()`
    DELETE FROM viky_proof_sessions
    WHERE gift_id = ${giftId} AND session_id LIKE ${`connected:${giftId}:%`}
    RETURNING session_id`;
  return rows.length;
}

/** Deletes sessions old enough that neither their outcome nor a replay attempt matters any more. */
export async function pruneExpiredProofSessions(): Promise<void> {
  await sql()`
    DELETE FROM viky_proof_sessions
    WHERE consumed_at IS NULL
      AND created_at < now() - make_interval(secs => ${PROOF_SESSION_PRUNE_SECONDS})`;
}

/**
 * Consumes the session and records the verified evidence, the signed attestation and the raw proofs in
 * ONE statement. A replay finds the session already consumed, nothing is written, and the caller sees no
 * row back. The proofs stay server-side: they are the material of the live-schema check (KT3).
 */
export async function consumeAndSaveVerification(input: {
  sessionId: string;
  evidence: DuolingoEvidence | Record<string, unknown>;
  attestation: StoredAttestation;
  proofs: unknown;
}): Promise<boolean> {
  const rows = await sql()`
    UPDATE viky_proof_sessions
       SET consumed_at = now(),
           evidence = ${JSON.stringify(input.evidence)}::jsonb,
           attestation = ${JSON.stringify(input.attestation)}::jsonb,
           proofs = ${JSON.stringify(input.proofs)}::jsonb
     WHERE session_id = ${input.sessionId} AND consumed_at IS NULL
     RETURNING session_id`;
  return rows.length === 1;
}

/** The most recent verified evidence for a gift and account, or null before the baseline. */
export async function loadLatestEvidence(giftId: string, account: string): Promise<DuolingoEvidence | null> {
  const rows = await sql()`
    SELECT evidence FROM viky_proof_sessions
     WHERE gift_id = ${giftId} AND account = ${account.toLowerCase()} AND consumed_at IS NOT NULL
     ORDER BY consumed_at DESC
     LIMIT 1`;
  const row = rows[0];
  if (!row || row.evidence === null || row.evidence === undefined) return null;
  const value = typeof row.evidence === "string" ? JSON.parse(row.evidence) : row.evidence;
  return value as DuolingoEvidence;
}

/** The attestation recorded for a consumed session, for the relayer. Never returned to a browser. */
export async function loadAttestation(sessionId: string): Promise<StoredAttestation | null> {
  const rows = await sql()`
    SELECT attestation FROM viky_proof_sessions WHERE session_id = ${sessionId} AND consumed_at IS NOT NULL`;
  const row = rows[0];
  if (!row || row.attestation === null || row.attestation === undefined) return null;
  const value = typeof row.attestation === "string" ? JSON.parse(row.attestation) : row.attestation;
  return value as StoredAttestation;
}

export async function proofSessionStorageReachable(): Promise<boolean> {
  try {
    await sql()`SELECT 1 FROM viky_proof_sessions LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}
