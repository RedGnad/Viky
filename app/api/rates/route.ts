import { NextResponse } from "next/server";
import { RATE_SOURCE } from "@/src/rails";
import { currentRates } from "@/src/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The rate the screens convert with, read from the source named in src/rails.ts, or an honest nothing.
 *
 * Public and unsigned: a rate is nobody's secret, and the screen that reads it may be the signed-out home. When
 * the source has not answered for three days, `rates` is null and every screen shows the dollar alone and says
 * why. Cached for an hour by the browser too, since the source itself publishes once a working day.
 */
export async function GET() {
  const rates = await currentRates();
  return NextResponse.json(
    {
      rates: rates ? { date: rates.date, usdPerEur: rates.usdPerEur, eurPerUsd: rates.eurPerUsd, xofPerUsd: rates.xofPerUsd, readAtMs: rates.readAtMs } : null,
      source: { name: RATE_SOURCE.name, url: RATE_SOURCE.url, cfaFrancsPerEuro: RATE_SOURCE.cfaFrancsPerEuro },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
