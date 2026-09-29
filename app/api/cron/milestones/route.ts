import { after, NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { claimPass, FREQUENT_PASS_EVERY_SECONDS, frequentMilestonePass } from "@/src/frequent-pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The milestones' frequent pass (src/frequent-pass.ts), called every five minutes by cron-job.org. Public and without a
 * secret: it guards itself, one pass every four minutes at most, and a call in between answers 200 and does nothing. It
 * answers at once and carries no gift's data; the pass runs after the answer.
 */
export async function GET() {
  try {
    if (await claimPass("milestones", FREQUENT_PASS_EVERY_SECONDS)) {
      after(async () => {
        try {
          const lines = await frequentMilestonePass();
          const reached = lines.filter((line) => line.result.startsWith("reached")).length;
          console.log(`frequent milestone pass: ${lines.length} lines, ${reached} reached`);
        } catch (error) {
          console.error(`frequent milestone pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error(`frequent milestone pass not claimed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
