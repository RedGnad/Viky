import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { liveConditions } from "@/src/conditions";
import { isOperator } from "@/src/dev-access";
import { NO_STORE } from "@/src/gift-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which conditions this viewer may offer: the live ones, which is all "What will they do?" lists, for everybody. The
 * operator door that once previewed a condition wired and not live is gone (the founder's rule of 23 Sep 2026, D184):
 * a condition built is open to all, and a condition with a piece missing is offered to nobody. `preview` stays in the
 * answer, empty, so a screen built against it keeps its shape.
 */
export async function GET(request: Request) {
  let operator = false;
  try {
    operator = isOperator(readAccountAuthSession(request).account);
  } catch {
    operator = false;
  }
  const ids = liveConditions().map((condition) => condition.id);
  const preview: string[] = [];
  // Whether the Reclaim application a shown proof needs is configured where this runs: a boolean for the operator,
  // never a length nor a prefix, because the values are sensitive and are read at execution and nowhere else (D164).
  const shown = operator ? { configured: Boolean(process.env.RECLAIM_APP_ID?.trim() && process.env.RECLAIM_APP_SECRET?.trim()) } : undefined;
  return NextResponse.json({ ids, preview, ...(shown ? { shown } : {}) }, { headers: NO_STORE });
}
