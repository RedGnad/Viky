import { neon } from "@neondatabase/serverless";
import { conditionOfGoal } from "./conditions";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * How many real proofs paid on each condition (D184): what the public page prints beside "Open" as "Paid on N real
 * proofs.", or "Nobody has shown one yet." until there is one, and what the judges' page prints as a number.
 *
 * A proof that paid is a reading the attestor signed, the contract took, and that moved money to the person: for a
 * milestone condition, an attested reading that reached the gift's target; for a daily one, a check-in relayed to the
 * contract that credited a day. A first reading pays nothing and is not counted (the founder, 13 Oct 2026): the start
 * of a climb, and the first check-in of a daily gift, which ties the account and credits no day. Both were counted
 * until then, so the pages said 11 and 7 where the contracts had paid 5 days and 2 climbs, and a line read "paid" on a
 * start alone.
 *
 * Nothing here is a claim: it is a count of rows, and when the rows cannot be read (no database where the page is
 * drawn) the answer is nothing, and the page says nothing rather than a number.
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
       WHERE r.attested AND r.outcome = 'reached'
       GROUP BY g.condition_id`;
    for (const row of milestone) counts.set(String(row.id), Number(row.n));
    const daily = await sql()`
      SELECT g.goal_type AS goal, count(*)::int AS n
        FROM viky_relayed rel
        JOIN viky_gifts g ON g.gift_id = rel.gift_id
       WHERE rel.kind = 'check-in'
         AND EXISTS (SELECT 1 FROM viky_days d WHERE d.gift_id = rel.gift_id AND d.tx_hash = rel.tx_hash AND d.outcome = 'earned')
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
