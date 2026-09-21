import { NextResponse } from "next/server";
import { offeredCurrencies } from "@/src/currencies";
import { cardRailCurrencies, euroRailCurrencies } from "@/src/rail-availability";
import { RATE_SOURCE } from "@/src/rails";
import { currentRates } from "@/src/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The rate the screens convert with, read from the source named in src/rails.ts, or an honest nothing, and the
 * currencies a person may read in, which is what the two rails will pay somebody in crossed with what the rate file
 * can convert into (D152). Both come from the services themselves; neither is a list kept in this repository.
 *
 * Public and unsigned: a rate is nobody's secret, and the screen that reads it may be the signed-out home. When
 * the source has not answered for three days, `rates` is null and every screen shows the dollar alone and says
 * why. Cached for an hour by the browser too, since the source itself publishes once a working day.
 */
export async function GET() {
  const [rates, euro, card] = await Promise.all([currentRates(), euroRailCurrencies(), cardRailCurrencies()]);
  const payable = euro || card ? [...new Set([...(euro ?? []), ...(card ?? [])])] : null;
  return NextResponse.json(
    {
      rates: rates
        ? { date: rates.date, usdPerEur: rates.usdPerEur, eurPerUsd: rates.eurPerUsd, xofPerUsd: rates.xofPerUsd, eurPer: rates.eurPer, readAtMs: rates.readAtMs }
        : null,
      currencies: offeredCurrencies(payable, rates),
      source: { name: RATE_SOURCE.name, url: RATE_SOURCE.url, cfaFrancsPerEuro: RATE_SOURCE.cfaFrancsPerEuro },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
