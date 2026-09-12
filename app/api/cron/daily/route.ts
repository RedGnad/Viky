import { NextResponse } from "next/server";
import { dailyPass, COUNTING_PASS } from "@/src/daily-pass";
import { NO_STORE } from "@/src/gift-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel cron entry point for the daily pass; Vercel sends the CRON_SECRET as a bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401, headers: NO_STORE });
  }
  try {
    const report = await dailyPass(COUNTING_PASS);
    return NextResponse.json(report, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The daily pass failed" }, { status: 500, headers: NO_STORE });
  }
}
