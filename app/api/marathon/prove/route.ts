import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { proveCertificate } from "@/src/certificate-reading";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { marathonAccountOfGift } from "@/src/marathon-gift";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitPacedReading } from "@/src/reading-admission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The person's result, turned into money (D273): the account the service reads is built from the gift's own race
 * and the bib bound to it, never from anything the browser sends, and the outcome is `proveCertificate`'s, typed.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown }>(request, 1_024);
    const { giftId, account } = await marathonAccountOfGift(String(body.giftId ?? ""), auth.account);
    // A paced platform's readings are shared by everybody: one account, or one connection, takes a few a day at most.
    await admitPacedReading(request, auth.account);
    try {
      return NextResponse.json(await proveCertificate({ giftId, link: account }), { headers: NO_STORE });
    } catch (error) {
      console.error(`marathon proof failed for gift ${giftId}: ${error instanceof Error ? error.message : String(error)}`);
      return NextResponse.json({ kind: "refused", giftId, code: "SOURCE_UNAVAILABLE", message: "That did not go through, and nothing was changed. Try again." }, { status: 502, headers: NO_STORE });
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
