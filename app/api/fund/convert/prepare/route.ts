import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { EXIT_WINDOW_SECONDS } from "@/src/exit-plan";
import { buildExitTerms, exitExchangeAddress, heldOf, newSalt } from "@/src/exit-relay";
import { discardExit, newExitId, openConversion, saveExit, type ExitRecord } from "@/src/exit-store";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote } from "@/src/kuru";
import { AUSD_ADDRESS, USDC_ADDRESS } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { conversionFloor, SMALLEST_CONVERSION, termsToJson, usdcRouterAddress } from "@/src/usdc-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_READY = "Viky cannot change this money yet. Nothing was taken.";
const UNDER_WAY = "This money is already being changed. Give it a few minutes.";

/**
 * The terms one signature will cover, for USDC a card payment delivered, written down before the browser signs.
 *
 * The same two rules as the way out (app/api/exit/prepare/route.ts). The pair is fixed here, USDC in and what a gift
 * holds out, so this is never a general exchange. And while terms are open for this account, they are the ones given
 * back: a second set would be a second live authorization for the same money.
 *
 * What differs is the floor. Nobody read a figure before this, so the floor is a rule and not a ticket: the quote
 * whose bytes will be relayed must promise at least ninety-nine for a hundred, or nothing is prepared.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const account = getAddress(auth.account);
    const router = usdcRouterAddress();
    if (!router) throw new GiftApiError("NOT_CONFIGURED", NOT_READY, 503);
    const exchange = exitExchangeAddress();

    const body = await readJsonBody<{ amount?: string }>(request, 1_024);
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    if (amount < SMALLEST_CONVERSION) throw new GiftApiError("INVALID_REQUEST", "Please try again");

    const open = await openConversion(account);
    if (open && open.amount === amount) return NextResponse.json(answer(open, router), { headers: NO_STORE });
    // Signed terms hold the money they name until they land, are refused by the exchange, or expire.
    if (open?.signature) throw new GiftApiError("ALREADY_UNDER_WAY", UNDER_WAY, 409);

    const held = await heldOf(USDC_ADDRESS, account);
    if (held < amount) throw new GiftApiError("NOT_ENOUGH", "That is more than arrived.", 409);

    const quote = await kuruQuote({ userAddress: router, tokenIn: USDC_ADDRESS, tokenOut: AUSD_ADDRESS, amount });
    if (getAddress(quote.to) !== exchange) throw new GiftApiError("NOT_CONFIGURED", NOT_READY, 503);
    // The floor is this quote's own minimum, the one its bytes carry (D81), and it must clear the rule.
    const floor = BigInt(quote.minOut);
    if (floor < conversionFloor(amount)) {
      throw new GiftApiError("RATE_TOO_LOW", "The exchange would give too little for this right now. Nothing was taken.", 409);
    }

    if (open) await discardExit(open.id);
    const deadline = BigInt(Math.floor(Date.now() / 1_000) + EXIT_WINDOW_SECONDS);
    const prepared = buildExitTerms({ payer: account, amount, tokenOut: AUSD_ADDRESS, floor, exchange, callData: quote.data, deadline, salt: newSalt() });
    const record = {
      id: newExitId(),
      account,
      amount,
      tokenOut: prepared.terms.tokenOut,
      minOut: floor,
      exchange: prepared.terms.exchange,
      callData: prepared.callData,
      callHash: prepared.terms.callHash,
      salt: prepared.terms.salt,
      deadline,
      nonce: prepared.nonce,
    };
    await saveExit(record);
    return NextResponse.json(answer({ ...record, signature: null }, router), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}

/** The terms themselves go back with the nonce, so the browser reads what it signs (src/usdc-router.ts). */
function answer(record: Pick<ExitRecord, "id" | "account" | "amount" | "tokenOut" | "minOut" | "exchange" | "callHash" | "salt" | "deadline" | "nonce" | "signature">, router: string) {
  return {
    id: record.id,
    signed: record.signature !== null,
    terms: termsToJson({ payer: record.account, amount: record.amount, tokenOut: record.tokenOut, minOut: record.minOut, exchange: record.exchange, callHash: record.callHash, deadline: record.deadline, salt: record.salt }),
    authorization: { to: router, value: record.amount.toString(), validAfter: "0", validBefore: record.deadline.toString(), nonce: record.nonce },
  };
}
