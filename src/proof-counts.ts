import { neon } from "@neondatabase/serverless";
import { conditionOfGoal } from "./conditions";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * How many real proofs each condition has (D184): what the public page prints beside "Open" as "Nobody has shown one
 * yet." until there is one, and what the judges' page prints as a number. A real proof is a reading the attestor
 * signed and Viky recorded: for a milestone condition, an attested reading that started or reached a gift; for a
 * daily one, a check-in relayed to the contract. Nothing here is a claim: it is a count of rows, and when the rows
 * cannot be read (no database where the page is drawn) the answer is nothing, and the page says nothing rather than
 * a number.
 */

let executor: SqlExecutor | undefined;

export function configureProofCounts(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function realProofCounts(): Promise<ReadonlyMap<string, number> | null> {
  try {
    const counts = new Map<string, number>();
    const milestone = await sql()`
      SELECT g.condition_id AS id, count(*)::int AS n
        FROM viky_milestone_readings r
        JOIN viky_milestone_gifts g ON g.gift_id = r.gift_id
       WHERE r.attested AND r.outcome IN ('reached', 'started')
       GROUP BY g.condition_id`;
    for (const row of milestone) counts.set(String(row.id), Number(row.n));
    const daily = await sql()`
      SELECT g.goal_type AS goal, count(*)::int AS n
        FROM viky_relayed rel
        JOIN viky_gifts g ON g.gift_id = rel.gift_id
       WHERE rel.kind = 'check-in'
       GROUP BY g.goal_type`;
    for (const row of daily) {
      const condition = conditionOfGoal(Number(row.goal));
      if (condition) counts.set(condition.id, (counts.get(condition.id) ?? 0) + Number(row.n));
    }
    return counts;
  } catch {
    return null;
  }
}
