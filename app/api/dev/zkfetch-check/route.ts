import { NextResponse } from "next/server";
import { requireOperator } from "@/src/dev-access";
import { fetchPublicProfile, reclaimPublicProfileDeps } from "@/src/duolingo-public";
import { NO_STORE } from "@/src/gift-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Operator only: proves the attested fetch runs end to end from this deployment (worker, proof, verification). */
export async function GET(request: Request) {
  try {
    requireOperator(request);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  const started = Date.now();
  try {
    const profile = await fetchPublicProfile("duolingo", await reclaimPublicProfileDeps());
    return NextResponse.json({ ok: true, ms: Date.now() - started, profileId: profile.profileId, totalXp: profile.totalXp, observedAt: profile.observedAt }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }, { status: 500, headers: NO_STORE });
  }
}
