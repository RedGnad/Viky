import { NextResponse } from "next/server";
import { operatorAccounts } from "@/src/dev-access";
import { NO_STORE } from "@/src/gift-api";
import { exampleForJudges, proofOfDay } from "@/src/proof-journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one proof Viky publishes in full, so a judge can re-verify a credited day themselves (U2).
 *
 * It is always one of Viky's own gifts: the search is restricted to the operator's accounts, whose holder agreed on
 * 18 Sep 2026 that this one proof may be public. No other gift can come out of here, whatever is asked, which is why
 * the accounts are passed into the query rather than looked for in the table.
 *
 * When no such day exists yet, it says so rather than showing an example that would not replay: nothing here is
 * invented, and a judge is never handed a command that cannot work.
 */
export async function GET() {
  const accounts = [...operatorAccounts()];
  const example = accounts.length === 0 ? null : await exampleForJudges(accounts);
  if (!example) return NextResponse.json({ example: null }, { headers: NO_STORE });
  const kept = await proofOfDay(example.giftId, example.day);
  if (!kept) return NextResponse.json({ example: null }, { headers: NO_STORE });
  return NextResponse.json({ example: { ...example, proof: kept.proof } }, { headers: NO_STORE });
}
