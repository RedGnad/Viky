import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { accredibleIdOf } from "@/src/accredible-credential";
import { AccredibleReadError, readAccredibleCredential } from "@/src/accredible-reading";
import { NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What an Accredible credential says, read plainly, so a screen can answer before any money moves (D213): edX's route
 * for Accredible's record. Signed in only, and rate limited: it answers the person holding a link, on their own gift.
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
  const code = typeof body.link === "string" && body.link.length <= 512 ? accredibleIdOf(body.link) : undefined;
  if (!code) return NextResponse.json({ code: "INVALID_LINK", error: "That is not an Accredible credential link" }, { status: 400, headers: NO_STORE });

  try {
    const certificate = await readAccredibleCredential(code);
    return NextResponse.json(
      {
        code: certificate.id,
        name: certificate.name,
        title: certificate.title,
        issuer: certificate.issuerHost,
        grantedDay: certificate.issuedDay,
        subjects: certificate.subjects,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof AccredibleReadError) {
      // A certificate nobody has and a page that lost a field are different things, and the screen says different
      // sentences for them, so the code travels and the words come from the register.
      const status = error.code === "FETCH_FAILED" || error.code === "PROOF_INVALID" ? 502 : error.code === "CERTIFICATE_PRIVATE" || error.code === "CERTIFICATE_EXPIRED" ? 409 : 404;
      return NextResponse.json({ code: error.code, error: error.message }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ code: "FETCH_FAILED", error: "The certificate could not be read right now" }, { status: 502, headers: NO_STORE });
  }
}
