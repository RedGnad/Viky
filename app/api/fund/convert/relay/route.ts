import { NextResponse } from "next/server";
import { getAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { alreadySpent, relayExit, toExitAuthorization } from "@/src/exit-relay";
import { attachSignature, claimExitRelay, loadExit, markExitSent, markExitStale, noteExitHash, releaseExitRelay } from "@/src/exit-store";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { AUSD_ADDRESS, USDC_ADDRESS } from "@/src/monad/chain";
import { RelayerError } from "@/src/relayer";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, countedIfSent } from "@/src/relay-admission";
import { canonicalSignature } from "@/src/signature";
import { usdcRouterAddress } from "@/src/usdc-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_READY = "Viky cannot change this money yet. Nothing was taken.";
const PRICE_MOVED = "The exchange's price moved. Nothing was taken. Viky will ask for a new one.";
const UNDER_WAY = "This money is already being changed. Give it a few minutes.";

/**
 * Carries one signed conversion to the chain, and carries the same one again if it did not land.
 *
 * Step for step what the way out's relay does (app/api/exit/relay/route.ts), on the copy of the router that takes
 * USDC: the first signature is kept and no other, the token is asked whether these terms were already spent, one
 * attempt at a time holds the row, and the hash is written down the moment it is submitted. Only terms that give back
 * what a gift holds are carried here, so a way out's terms can never be sent to the wrong contract.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const account = getAddress(auth.account);
    const router = usdcRouterAddress();
    if (!router) throw new GiftApiError("NOT_CONFIGURED", NOT_READY, 503);
    const body = await readJsonBody<{ id?: string; signature?: string }>(request, 4 * 1_024);
    const id = String(body.id ?? "").trim();
    if (!/^[0-9a-f]{24}$/.test(id)) throw new GiftApiError("INVALID_REQUEST", "Please try again");

    let record = await loadExit(id, account);
    if (!record || getAddress(record.tokenOut) !== getAddress(AUSD_ADDRESS)) throw new GiftApiError("UNKNOWN_CONVERSION", "That is no longer waiting. Nothing was taken.", 404);
    if (record.state === "sent") return NextResponse.json({ changed: true, hash: record.txHash }, { headers: NO_STORE });

    if (record.signature === null) {
      let signature: `0x${string}`;
      try {
        signature = canonicalSignature(String(body.signature ?? ""));
      } catch {
        throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
      }
      if (!(await attachSignature(id, signature))) throw new GiftApiError("STALE_REQUEST", "Please try again");
      record = (await loadExit(id, account))!;
    }

    if (record.deadline * 1_000n <= BigInt(Date.now())) throw new GiftApiError("TOO_SLOW", "This took too long. Nothing was taken.", 409);
    // Spent already means an earlier attempt landed and we never heard: it is said as done, and nothing is sent again.
    if (await alreadySpent(record.account, record.nonce, undefined, USDC_ADDRESS)) {
      await markExitSent(id, null);
      const landed = await loadExit(id, account);
      if (!landed?.txHash) console.error(`the conversion ${id} had already landed, with no hash written down`);
      return NextResponse.json({ changed: true, hash: landed?.txHash ?? null }, { headers: NO_STORE });
    }

    if (!(await claimExitRelay(id))) {
      const current = await loadExit(id, account);
      if (current?.state === "sent") return NextResponse.json({ changed: true, hash: current.txHash }, { headers: NO_STORE });
      if (current?.state === "stale") throw new GiftApiError("QUOTE_STALE", PRICE_MOVED, 409);
      throw new GiftApiError("ALREADY_UNDER_WAY", UNDER_WAY, 409);
    }

    let hash: Hex;
    let submitted: Hex | undefined;
    try {
      const admitted = await admitRelay(request, auth.account);
      ({ hash } = await countedIfSent(admitted, () => relayExit({
        router,
        onSubmitted: async (sent) => {
          submitted = sent;
          await noteExitHash(id, sent);
        },
        terms: {
          payer: record.account,
          amount: record.amount,
          tokenOut: record.tokenOut,
          minOut: record.minOut,
          exchange: record.exchange,
          callHash: record.callHash,
          deadline: record.deadline,
          salt: record.salt,
        },
        authorization: toExitAuthorization(0n, record.deadline, record.signature!),
        callData: record.callData,
      })));
    } catch (error) {
      // A route that moved is a retry to offer: these terms are set aside so the next attempt may quote again (D81).
      if (error instanceof RelayerError && error.contractError === "ExchangeFailed") {
        await markExitStale(id);
        throw new GiftApiError("QUOTE_STALE", PRICE_MOVED, 409);
      }
      // A typed refusal means nothing of this attempt is in flight, so the terms are given back at once.
      if (error instanceof GiftApiError || error instanceof RelayerError) {
        await releaseExitRelay(id).catch((failure: unknown) => console.error(`could not give back the conversion ${id}:`, failure));
        throw error;
      }
      // Anything else may have left a transaction out: the claim stays until its lease runs out.
      if (submitted) {
        console.error(`the conversion ${id} submitted ${submitted} and then failed:`, error);
        throw new GiftApiError("ALREADY_UNDER_WAY", UNDER_WAY, 409);
      }
      throw error;
    }
    await markExitSent(id, hash);
    return NextResponse.json({ changed: true, hash }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
