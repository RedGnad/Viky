import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readDetCertificate, DetReadError } from "@/src/det-reading";
import { detAliasOf } from "@/src/duolingo-english-test";
import { NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a certificate says, read plainly, so a screen can answer before any money moves (U3).
 *
 * It reads and writes nothing else: no gift, no record, no relay. The three fields it gives back are the three the
 * attested reading is allowed to take, and the subject is the same hash the funder's terms carry, so a screen can say
 * "that certificate is in another name" without either side learning anything the page does not already show.
 *
 * Signed in only, and rate limited. The page is public, but Viky is not a service for reading other people's results:
 * it answers the person holding a link, on their own gift.
 */
export async function POST(request: Request) {
  const rate = checkRateLimit("verify", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  try {
    readAccountAuthSession(request);
  } catch {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }

  let body: { link?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }
  const alias = typeof body.link === "string" && body.link.length <= 512 ? detAliasOf(body.link) : undefined;
  if (!alias) return NextResponse.json({ code: "INVALID_LINK", error: "That is not a certificate link" }, { status: 400, headers: NO_STORE });

  try {
    const certificate = await readDetCertificate(alias);
    return NextResponse.json(
      { alias: certificate.alias, score: certificate.score, testDay: certificate.testDay, name: certificate.name, subject: certificate.subject },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof DetReadError) {
      // A page that is private again, expired or missing is a fact about the page: 404 for all three would make the
      // screen say the wrong sentence, so the code travels and the screen picks the words from the register.
      const status = error.code === "FETCH_FAILED" || error.code === "PROOF_INVALID" ? 502 : 404;
      return NextResponse.json({ code: error.code, error: error.message }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ code: "FETCH_FAILED", error: "The certificate could not be read right now" }, { status: 502, headers: NO_STORE });
  }
}
