import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { outCountries } from "@/src/out-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every country where at least one way out works, and each one's calling prefix (D274): what "Where do you live?"
 * offers. Public and unsigned: which countries the services serve is nobody's secret.
 */
export async function GET() {
  return NextResponse.json(await outCountries(), { headers: NO_STORE });
}
