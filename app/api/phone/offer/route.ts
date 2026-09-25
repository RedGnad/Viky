import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { bitrefillConfigured } from "@/src/bitrefill";
import { isOperator } from "@/src/dev-access";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { phoneDataOffered, phoneWayOffered } from "@/src/phone-order";
import { treasuryConfigured } from "@/src/phone-treasury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether "Use your money" shows the phone card to this account (D238): a boolean, and nothing about why. */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const offered = phoneWayOffered(auth.account, { isOperator, configured: () => bitrefillConfigured() && treasuryConfigured() });
    const data = offered && phoneDataOffered(auth.account, { isOperator });
    return NextResponse.json({ offered, data }, { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
