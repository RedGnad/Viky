import { NextResponse } from "next/server";
import { NO_STORE } from "@/src/gift-api";
import { reachOfWaysIn, reachOfWaysOut } from "@/src/rail-availability";
import { countryCode, guessCountry, regionOfLocale } from "@/src/rail-country";
import { cardOffered, cardReach, payerCountry } from "@/src/card-rail";
import { countryOfAccount } from "@/src/request-country";

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
 * One exception, for adding money by card only (the founder, 29 Sep 2026): the ways in are answered for the payer's
 * country, the account's own when it has one, else the connection's, each card partner by its own published list first,
 * and `card` says whether any of them serves it. Nothing else changes for a payer no card partner serves.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fromConnection = countryCode(request.headers.get("x-vercel-ip-country"));
  const fromDevice = regionOfLocale(params.get("locale")) ?? countryCode(params.get("region"));
  const guess = guessCountry({ fromConnection, fromDevice, answered: params.get("answered") });
  const accountCountry = await countryOfAccount(request);
  // Adding money by card is decided for the payer's country (the account's, else the connection's), each partner by its
  // own list first; paying out keeps the guess above.
  const payer = payerCountry({ account: accountCountry, connection: fromConnection });
  const [waysOut, live] = await Promise.all([reachOfWaysOut(guess.country), reachOfWaysIn(payer ?? guess.country)]);
  const waysIn = cardReach(payer, live);
  return NextResponse.json({ ...guess, waysOut, waysIn, card: { offered: cardOffered(waysIn), country: payer } }, { headers: NO_STORE });
}
