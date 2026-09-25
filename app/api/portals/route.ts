import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { listPortals, portalListed } from "@/src/portal-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Which university?" asked as a list (D247): every portal Viky can read, with its country, and nothing else. Public
 * and unsigned for the same reason as the search beside it: which universities Viky can read is nobody's secret, and
 * the funder choosing may not have an account yet.
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const portals = await listPortals();
  return NextResponse.json({ results: portals.map(portalListed) }, { headers: NO_STORE });
}
