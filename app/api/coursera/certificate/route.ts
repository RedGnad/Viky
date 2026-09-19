import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { courseraCodeOf } from "@/src/coursera-certificate";
import { CourseraReadError, readCourseraCertificate } from "@/src/coursera-reading";
import { NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a Coursera certificate says, read plainly, so a screen can answer before any money moves (C3). The twin of
 * the English test's own route, with the one difference the source has: it names a course as well as a person.
 *
 * It reads and writes nothing else: no gift, no record, no relay. What it gives back is what the attested reading is
 * allowed to take, and the subject is the same hash the funder's terms carry, so a screen can say "that certificate
 * is in another name, or for another course" without either side learning anything the page does not already show.
 *
 * Signed in only, and rate limited. The page is public, but Viky is not a service for reading other people's
 * certificates: it answers the person holding a link, on their own gift.
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
  const code = typeof body.link === "string" && body.link.length <= 512 ? courseraCodeOf(body.link) : undefined;
  if (!code) return NextResponse.json({ code: "INVALID_LINK", error: "That is not a certificate link" }, { status: 400, headers: NO_STORE });

  try {
    const certificate = await readCourseraCertificate(code);
    return NextResponse.json(
      {
        code: certificate.code,
        name: certificate.name,
        courseSlug: certificate.courseSlug,
        courseName: certificate.courseName,
        grantedDay: certificate.grantedDay,
        subject: certificate.subject,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof CourseraReadError) {
      // A certificate nobody has and a page that lost a field are different things, and the screen says different
      // sentences for them, so the code travels and the words come from the register.
      const status = error.code === "FETCH_FAILED" || error.code === "PROOF_INVALID" ? 502 : 404;
      return NextResponse.json({ code: error.code, error: error.message }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ code: "FETCH_FAILED", error: "The certificate could not be read right now" }, { status: 502, headers: NO_STORE });
  }
}
