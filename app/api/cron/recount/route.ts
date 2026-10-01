import { NextResponse } from "next/server";
import { recountPass } from "@/src/daily-pass";
import { NO_STORE } from "@/src/gift-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The second reading of the morning (the audit of 1 Oct 2026): before the catch-up window closes at 06:00 UTC, the gifts
 * the counting pass held because a reading failed on our side are read once more, and the whole reading pass runs when
 * the counting pass left no row today or stopped part way. It counts and never sends anything back.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401, headers: NO_STORE });
  }
  try {
    const report = await recountPass();
    return NextResponse.json(report, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The second reading failed" }, { status: 500, headers: NO_STORE });
  }
}
