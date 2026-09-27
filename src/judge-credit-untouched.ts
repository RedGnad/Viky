import { neon } from "@neondatabase/serverless";
import { getAddress } from "viem";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The judge credit an account received, while nothing has left the account since, for the pay sheet's line (D295,
 * `judgeLineIsTrue`): the units of its "sent" journal line, read from that line and never from `JUDGE_CREDIT_AUSD`,
 * which may have changed since. Null when there is no such line, or when anything has left the account since the line
 * was first written (a wrong code writes it too, so this is never later than the credit):
 * - a gift, daily, milestone or certificate (`viky_creations`, written before its relay);
 * - a phone or gift card order (`viky_phone_orders`, written when priced, before any money moves);
 * - an exit (`viky_exits`, written when prepared, before the signature);
 * - a send (`viky_sends`, written once it is final).
 * A send whose confirmation timed out, or whose row failed to be written, leaves no row, and neither does money moved
 * by any other means than these routes: then this answers as if nothing had left.
 *
 * A read that fails answers null: the line is not drawn, which claims nothing.
 */

let executor: SqlExecutor | undefined;
export function configureUntouchedCreditStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}
function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

export async function untouchedJudgeCredit(account: string): Promise<bigint | null> {
  const who = getAddress(account).toLowerCase();
  try {
    const rows = await sql()`
      SELECT j.units::text AS units,
             EXISTS (SELECT 1 FROM viky_creations c WHERE lower(c.funder) = j.account AND (c.created_at >= j.created_at OR c.started_at >= j.created_at))
          OR EXISTS (SELECT 1 FROM viky_phone_orders p WHERE lower(p.account) = j.account AND p.created_at >= j.created_at)
          OR EXISTS (SELECT 1 FROM viky_exits e WHERE lower(e.account) = j.account AND e.created_at >= j.created_at)
          OR EXISTS (SELECT 1 FROM viky_sends s WHERE lower(s.account) = j.account AND s.sent_at >= j.created_at) AS spent
        FROM viky_judge_credits j
       WHERE j.account = ${who} AND j.state = 'sent'`;
    const row = rows[0];
    if (!row || row.spent !== false) return null;
    const units = String(row.units);
    return /^\d+$/.test(units) ? BigInt(units) : null;
  } catch (error) {
    console.error(`judge line: what left ${who} since its credit could not be read, so the line is not drawn: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
