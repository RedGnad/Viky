import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { limitsNow, startsAgainInWords } from "@/src/attested-calls";
import { liveConditions, OFFERED_WHILE_BUILDING } from "@/src/conditions";
import { isOperator } from "@/src/dev-access";
import { NO_STORE } from "@/src/gift-api";
import type { Reserves } from "@/src/reserves";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which conditions this viewer may offer: the live ones, which is all "What will they do?" lists, for everybody. The
 * operator door that once previewed a condition wired and not live is gone (the founder's rule of 23 Sep 2026, D184):
 * a condition built is open to all. `preview` carries, for everybody alike, the lines being built that the founder
 * lists anyway with "Being built" on them (D311).
 *
 * `reserves`, for everybody alike (the founder, 3 Oct 2026): which of the month's two reserves are used up, and the
 * day they start again, so that a condition that draws on an empty one says so before a gift is paid for. It names
 * no figure: the count is the judges page's.
 */
export async function GET(request: Request) {
  let operator = false;
  try {
    operator = isOperator(readAccountAuthSession(request).account);
  } catch {
    operator = false;
  }
  const ids = liveConditions().map((condition) => condition.id);
  const preview: string[] = [...OFFERED_WHILE_BUILDING];
  // Whether the Reclaim application a shown proof needs is configured where this runs: a boolean for the operator,
  // never a length nor a prefix, because the values are sensitive and are read at execution and nowhere else (D164).
  const shown = operator ? { configured: Boolean(process.env.RECLAIM_APP_ID?.trim() && process.env.RECLAIM_APP_SECRET?.trim()) } : undefined;
  const limits = await limitsNow();
  const reserves: Reserves = { readings: limits.readings, proofs: limits.proofs, again: startsAgainInWords() };
  return NextResponse.json({ ids, preview, reserves, ...(shown ? { shown } : {}) }, { headers: NO_STORE });
}
