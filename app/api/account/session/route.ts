import { NextResponse } from "next/server";
import {
  ACCOUNT_AUTH_COOKIE_NAME,
  ACCOUNT_AUTH_SESSION_TTL_MS,
  accountAuthErrorStatus,
  accountAuthOriginFromRequest,
  accountAuthPublicMessage,
  issueAccountAuthSession,
  readAccountAuthSession,
} from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/** Step two: the signed challenge becomes a twelve-hour cookie bound to the account and this origin. */
export async function POST(request: Request) {
  try {
    const rate = checkRateLimit("session", request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const body = await readJsonBody<{ challenge?: string; signature?: string }>(request, 8 * 1_024);
    const session = await issueAccountAuthSession({
      challenge: String(body.challenge ?? ""),
      signature: String(body.signature ?? ""),
      origin: accountAuthOriginFromRequest(request),
    });
    return NextResponse.json(
      { account: session.account, expiresAt: session.expiresAt },
      { headers: { ...NO_STORE, "Set-Cookie": sessionCookie(session.token, ACCOUNT_AUTH_SESSION_TTL_MS / 1_000) } },
    );
  } catch (error) {
    const status = accountAuthErrorStatus(error);
    return NextResponse.json(
      { error: status ? accountAuthPublicMessage(error) : error instanceof Error ? error.message : "Could not sign in" },
      { status: status || 400, headers: NO_STORE },
    );
  }
}

/** Which account this browser is signed in as, or 401. */
export async function GET(request: Request) {
  try {
    const session = readAccountAuthSession(request);
    return NextResponse.json({ account: session.account, expiresAt: new Date(session.expiresAtMs).toISOString() }, { headers: NO_STORE });
  } catch (error) {
    const status = accountAuthErrorStatus(error);
    return NextResponse.json({ error: accountAuthPublicMessage(error) }, { status: status || 401, headers: NO_STORE });
  }
}

export async function DELETE() {
  return NextResponse.json({ signedOut: true }, { headers: { ...NO_STORE, "Set-Cookie": sessionCookie("", 0) } });
}
