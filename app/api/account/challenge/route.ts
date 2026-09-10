import { NextResponse } from "next/server";
import {
  accountAuthErrorStatus,
  accountAuthOriginFromRequest,
  accountAuthPublicMessage,
  createAccountAuthChallenge,
} from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step one of signing in to the server: a five-minute challenge the passkey account signs silently. */
export async function POST(request: Request) {
  try {
    const rate = checkRateLimit("session", request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const body = await readJsonBody<{ account?: string }>(request, 1_024);
    const challenge = createAccountAuthChallenge({ account: String(body.account ?? ""), origin: accountAuthOriginFromRequest(request) });
    return NextResponse.json(challenge, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = accountAuthErrorStatus(error);
    return NextResponse.json(
      { error: status ? accountAuthPublicMessage(error) : error instanceof Error ? error.message : "Could not start sign-in" },
      { status: status || 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
