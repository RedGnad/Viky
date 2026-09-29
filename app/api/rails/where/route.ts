import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { reachOfWaysIn, reachOfWaysOut } from "@/src/rail-availability";
import { countryCode, guessCountry, regionOfLocale } from "@/src/rail-country";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { cardOffered, payerCountry } from "@/src/card-rail";
import { loadPreferences } from "@/src/preferences-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the person's bank or card probably is, and what each rail says about that country (R1).
 *
 * Two signals: the country the platform reads from the connection (`x-vercel-ip-country`, set by Vercel on every
 * request and not something a page can forge from the browser), and the region of the device's own language, which the
 * screen sends because the server cannot see it. When they differ, this answers `ask: true` and orders nothing: the
 * screen asks one question and sends the answer back as `answered`.
 *
 * The answer only ever **orders** the ways out. Both stay on the screen whatever this returns, because a guess about
 * somebody's country is wrong often enough that hiding on it would take money out of reach, and because the rail's own
 * identity check is the only thing that actually decides.
 *
 * One exception, for adding money by card only (the founder, 29 Sep 2026): `card` says whether it is offered, from the
 * account's own country when it has one, else the connection's. A payer in a country under a US embargo is not offered
 * the card, which its providers' terms exclude; nothing else changes for them.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fromConnection = countryCode(request.headers.get("x-vercel-ip-country"));
  const fromDevice = regionOfLocale(params.get("locale")) ?? countryCode(params.get("region"));
  const guess = guessCountry({ fromConnection, fromDevice, answered: params.get("answered") });
  const [waysOut, waysIn, accountCountry] = await Promise.all([reachOfWaysOut(guess.country), reachOfWaysIn(guess.country), countryOfAccount(request)]);
  const payer = payerCountry({ account: accountCountry, connection: fromConnection });
  return NextResponse.json({ ...guess, waysOut, waysIn, card: { offered: cardOffered(payer), country: payer } }, { headers: NO_STORE });
}

/** The country the signed-in account keeps (D274), or nothing for a visitor, an account that has none, or a failed read. */
async function countryOfAccount(request: Request): Promise<string | null> {
  try {
    const { account } = readAccountAuthSession(request);
    return (await loadPreferences(account)).country;
  } catch {
    return null;
  }
}
