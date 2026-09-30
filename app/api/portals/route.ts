import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { allPortals, portalCountries, portalListed, portalsIn } from "@/src/portal-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Which university?" (D247, D313): the countries the list holds, and with `?country=SN`, that country's universities,
 * each with its country, and nothing else. The world's list is thousands long, so it is read a country at a time.
 * Public and unsigned: which universities Viky lists is nobody's secret, and the funder choosing may not have an
 * account yet.
 *
 * With `?all=1`, the whole list in the same shape (the founder, 30 Sep 2026: the chooser opens on every country, and a
 * country only narrows it). It is the same for everybody, so the edge keeps it five minutes.
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const params = new URL(request.url).searchParams;
  if (params.get("all") === "1") {
    const portals = await allPortals();
    return NextResponse.json({ results: portals.map(portalListed) }, { headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400" } });
  }
  const country = params.get("country")?.trim().toUpperCase();
  if (country) {
    if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "A country is two letters.", code: "BAD_COUNTRY" }, { status: 400, headers: NO_STORE });
    const portals = await portalsIn(country);
    return NextResponse.json({ results: portals.map(portalListed) }, { headers: NO_STORE });
  }
  return NextResponse.json({ countries: await portalCountries() }, { headers: NO_STORE });
}
