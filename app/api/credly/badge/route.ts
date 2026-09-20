import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { credlyBadgeIdOf } from "@/src/credly-badge";
import { CredlyReadError, readCredlyBadge } from "@/src/credly-reading";
import { NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a Credly badge says, read plainly, so a screen can answer before any money moves (20 Sep 2026). The twin of
 * the course certificate's own route, with the one difference the source has: a badge is two records, and what says
 * which certification it is are the two ids its issuer publishes, never its title.
 *
 * It reads and writes nothing else: no gift, no record, no relay. What it gives back is what the attested reading is
 * allowed to take, and the subject is the same hash the funder's terms carry, so a screen can say "that badge is in
 * another name, or for another certification" without either side learning anything the pages do not already show.
 *
 * Signed in only, and rate limited. The page is public, but Viky is not a service for reading other people's badges:
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
  const badgeId = typeof body.link === "string" && body.link.length <= 512 ? credlyBadgeIdOf(body.link) : undefined;
  if (!badgeId) return NextResponse.json({ code: "INVALID_LINK", error: "That is not a badge link" }, { status: 400, headers: NO_STORE });

  try {
    const badge = await readCredlyBadge(badgeId);
    return NextResponse.json(
      {
        badgeId: badge.badgeId,
        name: badge.name,
        certification: badge.pair,
        certificationTitle: badge.certificationTitle,
        issuer: badge.issuer,
        issuedDay: badge.issuedDay,
        subject: badge.subject,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof CredlyReadError) {
      // A badge nobody has and a record that lost a field are different things, and the screen says different
      // sentences for them, so the code travels and the words come from the register.
      const status = error.code === "FETCH_FAILED" || error.code === "PROOF_INVALID" ? 502 : 404;
      return NextResponse.json({ code: error.code, error: error.message }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ code: "FETCH_FAILED", error: "The badge could not be read right now" }, { status: 502, headers: NO_STORE });
  }
}
