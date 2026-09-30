import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { portalCountries, portalListed, portalsIn } from "@/src/portal-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { countryOfRequest } from "@/src/request-country";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Which university?" (D247, D313): the countries the list holds, and with `?country=SN`, that country's universities,
 * each with its country, and nothing else. The world's list is thousands long, so it is read a country at a time.
 * Public and unsigned: which universities Viky lists is nobody's secret, and the funder choosing may not have an
 * account yet.
 *
 * With the countries comes `here`, the country the chooser opens on (the founder, 29 Sep 2026: no country to choose
 * before the list): the account's own, else the connection's, when the list holds universities there, else nothing.
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const country = new URL(request.url).searchParams.get("country")?.trim().toUpperCase();
  if (country) {
    if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "A country is two letters.", code: "BAD_COUNTRY" }, { status: 400, headers: NO_STORE });
    const portals = await portalsIn(country);
    return NextResponse.json({ results: portals.map(portalListed) }, { headers: NO_STORE });
  }
  const [countries, from] = await Promise.all([portalCountries(), countryOfRequest(request)]);
  const here = from && countries.some((one) => one.code === from.toUpperCase()) ? from.toUpperCase() : null;
  return NextResponse.json({ countries, here }, { headers: NO_STORE });
}
