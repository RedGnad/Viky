import { after, NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { claimPass, FREQUENT_DAILY_PASS_EVERY_SECONDS, FREQUENT_PASS_EVERY_SECONDS, frequentDailyPass, frequentMilestonePass } from "@/src/frequent-pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The frequent passes (src/frequent-pass.ts), called every five minutes by cron-job.org. Public and without a secret:
 * each pass guards itself, and a call in between answers 200 and does nothing. It answers at once and carries no
 * gift's data; the passes run after the answer.
 *
 * Two passes ride that one call: the milestones', every four minutes at most, and the pass of the daily gifts read as
 * the day goes, every fourteen. The address keeps the name the scheduler knows.
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
    if (await claimPass("daily-gifts", FREQUENT_DAILY_PASS_EVERY_SECONDS)) {
      after(async () => {
        try {
          const lines = await frequentDailyPass();
          const counted = lines.filter((line) => line.result.startsWith("counted")).length;
          if (lines.length > 0) console.log(`frequent daily pass: ${lines.length} gifts, ${counted} counted`);
        } catch (error) {
          console.error(`frequent daily pass failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error(`frequent milestone pass not claimed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
