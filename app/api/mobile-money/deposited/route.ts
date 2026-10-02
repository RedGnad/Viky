import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { markDepositSent } from "@/src/mobile-money-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notes that the dollars left for the payout's deposit address, so the screen waits for the payout and not for the send. */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const body = await readJsonBody<{ reference?: string }>(request, 512);
    const reference = String(body.reference ?? "");
    const noted = /^[0-9a-f-]{36}$/i.test(reference) ? await markDepositSent(reference, auth.account) : false;
    return NextResponse.json({ noted }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
