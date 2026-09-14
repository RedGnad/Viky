import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { EXIT_WINDOW_SECONDS, planExit } from "@/src/exit-plan";
import { buildExitTerms, exitExchangeAddress, exitRouterAddress, heldAusd, newSalt } from "@/src/exit-relay";
import { asOpenExit, discardExit, newExitId, openExit, saveExit } from "@/src/exit-store";
import { readExitTicket } from "@/src/exit-ticket";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote, NATIVE_MON } from "@/src/kuru";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The terms one signature will cover, written down before the person is asked for it.
 *
 * Two rules live here and both are about not asking twice. The floor is the figure the screen showed, which
 * arrives inside a ticket we signed, so nothing between the screen and here can lower it. And if this
 * account already has a way out open, the terms already written are returned unchanged: a second set would
 * mean a second live authorization for the same money, and only one of them has to land for them to be paid
 * twice out of their own account (src/exit-plan.ts).
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const account = getAddress(auth.account);
    const router = exitRouterAddress();
    const exchange = exitExchangeAddress();

    const body = await readJsonBody<{ ticket?: string; payoutTo?: string }>(request, 8 * 1_024);
    const payoutTo = String(body.payoutTo ?? "").trim();
    if (!isAddress(payoutTo)) throw new GiftApiError("INVALID_DESTINATION", "That destination is not valid.");
    const destination = getAddress(payoutTo);
    // Paying into the router or the token would look exactly like being paid and be nothing at all.
    if (destination === router || destination === getAddress(AUSD_ADDRESS)) {
      throw new GiftApiError("INVALID_DESTINATION", "That destination is not valid.");
    }
    const ticket = readExitTicket(body.ticket, account);

    const open = await openExit(account);
    const plan = planExit(open ? asOpenExit(open) : null, { amount: ticket.amount, payoutTo: destination, minOut: ticket.floor });
    if (plan.kind === "reuse") {
      return NextResponse.json(termsResponse(open!, ticket.shown, open!.signature !== null), { headers: NO_STORE });
    }
    if (plan.kind === "blocked") {
      throw new GiftApiError(
        "ALREADY_UNDER_WAY",
        "You already have a payout waiting to finish. Give it a few minutes, then try again.",
        409,
      );
    }

    const held = await heldAusd(account);
    if (held < ticket.amount) throw new GiftApiError("NOT_ENOUGH", "That is more than you have.", 409);

    // Fresh calldata, because a route is only good for a moment. The floor is not refreshed with it: it is
    // what they were shown. If the exchange can no longer reach it, they are told now rather than after they
    // have signed and watched a transaction refuse.
    const quote = await kuruQuote({ userAddress: router, tokenIn: AUSD_ADDRESS, tokenOut: NATIVE_MON, amount: ticket.amount });
    if (getAddress(quote.to) !== exchange) throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet.", 503);
    if (BigInt(quote.minOut) < ticket.floor) {
      throw new GiftApiError("RATE_MOVED", "The rate moved, so this would pay you less than you were shown. Ask for a new quote.", 409);
    }

    if (plan.discard) await discardExit(plan.discard);
    const deadline = BigInt(Math.floor(Date.now() / 1_000) + EXIT_WINDOW_SECONDS);
    const prepared = buildExitTerms({
      payer: account,
      payoutTo: destination,
      amount: ticket.amount,
      floor: ticket.floor,
      exchange,
      callData: quote.data,
      deadline,
      salt: newSalt(),
    });
    const id = newExitId();
    await saveExit({
      id,
      account,
      amount: prepared.terms.amount,
      payoutTo: prepared.terms.payoutTo,
      minOut: prepared.terms.minOut,
      exchange: prepared.terms.exchange,
      callData: prepared.callData,
      callHash: prepared.terms.callHash,
      salt: prepared.terms.salt,
      deadline,
      nonce: prepared.nonce,
    });
    return NextResponse.json(
      {
        id,
        shown: ticket.shown,
        signed: false,
        // What the browser hands to the passkey account: the authorization dies with the terms, so nothing
        // spendable outlives the window the contract enforces.
        authorization: { to: router, value: ticket.amount.toString(), validAfter: "0", validBefore: deadline.toString(), nonce: prepared.nonce },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}

function termsResponse(open: { id: string; amount: bigint; deadline: bigint; nonce: string }, shown: string, signed: boolean) {
  return {
    id: open.id,
    shown,
    signed,
    authorization: {
      to: exitRouterAddress(),
      value: open.amount.toString(),
      validAfter: "0",
      validBefore: open.deadline.toString(),
      nonce: open.nonce,
    },
  };
}
