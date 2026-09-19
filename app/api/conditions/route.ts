import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { liveConditions } from "@/src/conditions";
import { isOperator } from "@/src/dev-access";
import { NO_STORE } from "@/src/gift-api";
import { CHESS_MILESTONE, DET_MILESTONE } from "@/src/milestone-conditions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which conditions this viewer may offer. Everybody gets the live ones, which is all "What will they do?" lists. An
 * account that runs Viky (VIKY_OPERATOR_ACCOUNTS) also gets the conditions that are wired from end to end but not live
 * yet, so the first gift on one of them can be made at all. The screen marks those as offered to nobody else.
 *
 * Since D109 (19 Sep 2026) a condition turns live as soon as a gift can be made on it, rather than after a real gift
 * has finished running, so this door holds whatever is still missing a piece: today the Duolingo English Test, whose
 * goal is not registered on the milestone contract yet.
 */
const WIRED_NOT_LIVE = [CHESS_MILESTONE.condition, DET_MILESTONE.condition];

export async function GET(request: Request) {
  let operator = false;
  try {
    operator = isOperator(readAccountAuthSession(request).account);
  } catch {
    operator = false;
  }
  const ids = liveConditions().map((condition) => condition.id);
  const preview = operator ? WIRED_NOT_LIVE.filter((condition) => !condition.live).map((condition) => condition.id) : [];
  return NextResponse.json({ ids, preview }, { headers: NO_STORE });
}
