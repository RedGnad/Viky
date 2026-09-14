import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { alreadySpent, relayExit, toExitAuthorization } from "@/src/exit-relay";
import { attachSignature, loadExit, markExitSent } from "@/src/exit-store";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { canonicalSignature } from "@/src/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Carries one signed way out to the chain, and carries the same one again if it did not land.
 *
 * A second attempt sends nothing new: the terms, the calldata and the signature were all written down when
 * they were made, so trying again cannot produce a second authorization for the same money. Before
 * submitting, the token itself is asked whether this authorization has already been spent, because an
 * attempt can succeed on chain and still fail to reach us.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const account = getAddress(auth.account);
    const body = await readJsonBody<{ id?: string; signature?: string }>(request, 4 * 1_024);
    const id = String(body.id ?? "").trim();
    if (!/^[0-9a-f]{24}$/.test(id)) throw new GiftApiError("INVALID_REQUEST", "Please try again");

    let record = await loadExit(id, account);
    if (!record) throw new GiftApiError("UNKNOWN_PAYOUT", "That payout is no longer waiting. Ask for a new quote.", 404);
    if (record.state === "sent") return NextResponse.json({ paid: true, hash: record.txHash }, { headers: NO_STORE });

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

    if (record.deadline * 1_000n <= BigInt(Date.now())) {
      throw new GiftApiError("TOO_SLOW", "This took too long. Nothing was taken. Ask for a new quote.", 409);
    }
    // Spent already means an earlier attempt landed and we never heard. Saying it was paid is the truth;
    // sending again would be refused by the token anyway, at the relayer's expense.
    if (await alreadySpent(record.account, record.nonce)) {
      await markExitSent(id, record.txHash ?? "0x");
      return NextResponse.json({ paid: true, hash: record.txHash }, { headers: NO_STORE });
    }

    const { hash } = await relayExit({
      terms: {
        payer: record.account,
        payoutTo: record.payoutTo,
        amount: record.amount,
        minOut: record.minOut,
        exchange: record.exchange,
        callHash: record.callHash,
        deadline: record.deadline,
        salt: record.salt,
      },
      authorization: toExitAuthorization(0n, record.deadline, record.signature!),
      callData: record.callData,
    });
    await markExitSent(id, hash);
    return NextResponse.json({ paid: true, hash }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
