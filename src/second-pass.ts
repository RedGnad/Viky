import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * A second pass in the same visit, for a university pinned ahead of any proof (8 Oct 2026).
 *
 * A pin made ahead runs a rule written by hand that no student has been through. The one visit of a student is not
 * spent on it alone: when a first pass of the gift came back with no proof, the next session the person opens runs as
 * every pass of 7 Oct 2026 did, with Reclaim's agent, from the provider's first version. Its proof does not fit the pin
 * made ahead, so it is held for the operator's review like a first one (src/shown-verification.ts) and nothing is
 * refused. Once a proof has borne the pin out, the mark is off and there is no second pass: the rule is known to read.
 *
 * "Came back with no proof" is read on the session's own row and on Reclaim's public record of it, never on a clock:
 * Reclaim ended it on an error, or the person opened the verification page and no proof is made or on its way. A
 * session whose page nobody opened is not a pass, and neither is one Reclaim does not answer for: both run the pinned
 * rule again.
 *
 * And a pass counts against the rule pinned now, and no other (8 Oct 2026). That day a student made two passes with no
 * proof, one on version 3.0.0 and one with the agent; the rule was corrected and pinned again as 3.0.1; and his next
 * press would have opened the agent once more, on the strength of two passes the new rule had no part in. A session
 * that asked Reclaim for another version than the pinned one says nothing of the pinned one. The version is read on
 * the link the session's row keeps; a row whose link does not say counts as it did.
 */

/**
 * The version Reclaim's agent builds from: the provider's first, of type AI. Read on Toulouse's record, where every
 * pass of 7 Oct 2026 opened on it and the agent's own versions are 1.0.0-ai.N. Named
 * here because a request with no version now opens the provider's latest, which is the rule written by hand.
 */
export const AGENT_FIRST_VERSION = "1.0.0";

/** Reclaim's states of a session whose verification page nobody opened. */
const NEVER_OPENED: readonly string[] = ["SESSION_INIT", "SESSION_STARTED"];
/** Its states while a proof is being made, and once one is. */
const PROOF_ON_ITS_WAY: readonly string[] = ["PROOF_GENERATION_STARTED", "PROOF_GENERATION_SUCCESS", "PROOF_SUBMITTED", "AI_PROOF_SUBMITTED", "PROOF_MANUAL_VERIFICATION_SUBMITED"];

export type ReclaimRecord = Readonly<{ state: string; proofs: number }>;

export type SecondPassDeps = Readonly<{
  /** Reclaim's public record of a session, or nothing when it does not answer. */
  recordOf: (sessionId: string) => Promise<ReclaimRecord | null>;
}>;

let executor: SqlExecutor | undefined;

export function configureSecondPass(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

async function reclaimRecordOf(sessionId: string): Promise<ReclaimRecord | null> {
  const { fetchStatusUrl } = await import("@reclaimprotocol/js-sdk");
  const status = (await fetchStatusUrl(sessionId)) as { session?: { statusV2?: string; proofs?: unknown } };
  if (!status.session?.statusV2) return null;
  const proofs = status.session.proofs;
  return { state: status.session.statusV2, proofs: Array.isArray(proofs) ? proofs.length : proofs ? 1 : 0 };
}

/** The version a session asked Reclaim for, read from the link its row keeps; nothing when the link does not say. */
export function versionAsked(requestUrl: unknown): string | null {
  try {
    const template = new URL(String(requestUrl)).searchParams.get("template");
    if (!template) return null;
    let asked: unknown;
    try {
      asked = (JSON.parse(template) as { providerVersion?: unknown }).providerVersion;
    } catch {
      asked = (JSON.parse(decodeURIComponent(template)) as { providerVersion?: unknown }).providerVersion;
    }
    return typeof asked === "string" && asked ? asked : null;
  } catch {
    return null;
  }
}

/** Whether Reclaim's record is one of a pass the person made that gave no proof. */
export function passGaveNoProof(record: ReclaimRecord): boolean {
  return record.proofs === 0 && !NEVER_OPENED.includes(record.state) && !PROOF_ON_ITS_WAY.includes(record.state);
}

/**
 * Whether this account already made a pass for this gift's one proof that came back with none, on the version pinned
 * now when one is named. The last few sessions are enough: a person opens one or two in a visit, and rows leave the
 * table after a day. A lookup that fails says no: the pinned rule runs, and no press is held up by this question.
 */
export async function earlierPassGaveNoProof(pass: Readonly<{ giftId: string; account: string; conditionId: string; version?: string }>, deps: SecondPassDeps = { recordOf: reclaimRecordOf }): Promise<boolean> {
  const rows = await sql()`
    SELECT session_id, (consumed_at IS NOT NULL) AS stopped, request_url
      FROM viky_proof_sessions
     WHERE gift_id = ${pass.giftId} AND account = ${pass.account.toLowerCase()} AND condition_id = ${pass.conditionId} AND phase = 'reach'
       AND (consumed_at IS NULL OR evidence->>'stopped' IS NOT NULL)
     ORDER BY created_at DESC
     LIMIT 4`.catch(() => []);
  for (const row of rows) {
    // A pass on another version, an earlier rule or the agent's, is not a pass of the rule pinned now.
    const asked = versionAsked(row.request_url);
    if (pass.version && asked && asked !== pass.version) continue;
    // Reclaim ended it with no proof, and the row says so already (src/shown-verification.ts).
    if (row.stopped === true) return true;
    const record = await deps.recordOf(String(row.session_id)).catch(() => null);
    if (record && passGaveNoProof(record)) return true;
  }
  return false;
}
