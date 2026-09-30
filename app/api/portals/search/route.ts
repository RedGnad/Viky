import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { isValidPortalSearch, PORTAL_SEARCH_LIMIT, portalListed, searchPortals } from "@/src/portal-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Which university?": the chooser's search over Viky's list (D165, the world's since D313), and over nothing else.
 * The answer is our own table, so an empty answer means the list holds no university by those words, never that a
 * university does not exist. Public and unsigned, like the catalogue: which universities Viky can read is nobody's
 * secret, and the funder searching may not have an account yet.
 *
 * Every word typed, in any order, accents aside, in the shape the country's list has; `except=FR` leaves out the country
 * the chooser already lists whole, and `more` says the answer stopped at its limit (the founder, 29 Sep 2026).
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const params = new URL(request.url).searchParams;
  const words = params.get("q") ?? "";
  if (!isValidPortalSearch(words)) return NextResponse.json({ code: "INVALID_SEARCH", error: "Type a word or two of the university's name" }, { status: 400, headers: NO_STORE });
  const portals = await searchPortals(words, { except: params.get("except")?.trim().toUpperCase(), limit: PORTAL_SEARCH_LIMIT + 1 });
  return NextResponse.json({ results: portals.slice(0, PORTAL_SEARCH_LIMIT).map(portalListed), more: portals.length > PORTAL_SEARCH_LIMIT }, { headers: NO_STORE });
}
