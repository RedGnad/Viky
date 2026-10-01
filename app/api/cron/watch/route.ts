import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { testAlert, watchAfterMorning } from "@/src/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The watch after the morning pass (src/watch.ts): whether the counting pass is in the journal, whether the exchange
 * still points where the exit router pinned it, whether the evidence key is the one the contracts name. The operator is
 * sent one email for each that does not hold. Vercel sends the CRON_SECRET as a bearer token.
 *
 * With `?test=1`, asked by hand with the same secret, it also sends one email that says alerts leave, and answers what
 * became of it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401, headers: NO_STORE });
  }
  const test = new URL(request.url).searchParams.get("test") === "1" ? { test: await testAlert() } : {};
  return NextResponse.json({ watch: await watchAfterMorning(), ...test }, { headers: NO_STORE });
}
