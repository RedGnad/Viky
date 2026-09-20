import { NextResponse } from "next/server";
import { credlyCertificationsOf, credlySearchUrl, isValidCredlySearch } from "@/src/credly-badge";
import { NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The certifications Credly knows by some words, for the funder's step (the founder's line of 20 Sep 2026): they
 * type "comptia", read the certifications with the issuer of each, choose one, and the pair of ids is pinned into
 * the terms exactly as before. Credly's own search answers this, unauthenticated, in under a second; it sends no
 * CORS header, so the browser asks Viky and Viky asks Credly.
 *
 * No sign-in: the card is filled before any account exists. Rate limited like the other plain reads, because Viky
 * is not a mirror of Credly's catalogue. Nothing is kept: the answer is the funder's to choose from and is not
 * stored anywhere.
 */
export async function GET(request: Request) {
  const rate = checkRateLimit("status", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const words = new URL(request.url).searchParams.get("q") ?? "";
  if (!isValidCredlySearch(words)) return NextResponse.json({ code: "INVALID_SEARCH", error: "Type a word or two of the certification's name" }, { status: 400, headers: NO_STORE });

  let response: Response;
  try {
    response = await fetch(credlySearchUrl(words), {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Viky)" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ code: "SOURCE_UNAVAILABLE", error: "Credly is not answering. Try again in a moment." }, { status: 503, headers: NO_STORE });
  }
  if (response.status !== 200) return NextResponse.json({ code: "SOURCE_UNAVAILABLE", error: `Credly answered ${response.status}` }, { status: 503, headers: NO_STORE });
  const answer = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json({ results: credlyCertificationsOf(answer) }, { headers: NO_STORE });
}
