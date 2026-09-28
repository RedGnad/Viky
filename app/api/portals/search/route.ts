import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { isValidPortalSearch, portalFound, searchPortals } from "@/src/portal-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Which university?": the chooser's search over Viky's list (D165, the world's since D313), and over nothing else.
 * The answer is our own table, so an empty answer means the list holds no university by those words, never that a
 * university does not exist. Public and unsigned, like the catalogue: which universities Viky can read is nobody's
 * secret, and the funder searching may not have an account yet.
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const words = new URL(request.url).searchParams.get("q") ?? "";
  if (!isValidPortalSearch(words)) return NextResponse.json({ code: "INVALID_SEARCH", error: "Type a word or two of the university's name" }, { status: 400, headers: NO_STORE });
  const portals = await searchPortals(words);
  return NextResponse.json({ results: portals.map(portalFound) }, { headers: NO_STORE });
}
