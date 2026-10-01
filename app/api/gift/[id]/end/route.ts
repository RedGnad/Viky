import { NextResponse } from "next/server";
import { type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isOperator } from "@/src/dev-access";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { dailyEndOffer, milestoneEndOffer } from "@/src/gift-ending";
import { readGift } from "@/src/gift-reader";
import { relayEnd } from "@/src/gift-relay";
import { loadGift } from "@/src/gift-store";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { readMilestoneGift } from "@/src/milestone-reader";
import { relayMilestoneEnd } from "@/src/milestone-relay";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay } from "@/src/relay-admission";
import { assertGiftContractConfigured, escrowOf } from "@/src/relayer";
import { canonicalSignature } from "@/src/signature";
import { versionOfGift } from "@/src/v2-opening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type EndBody = { keep?: string; giveBack?: string; nonce?: string; deadline?: string; signature?: string };

/**
 * The person a gift is for ends it (the audit of 1 Oct 2026, section 3.6): what was counted stays theirs, the rest
 * goes back to the person who offered it in this same transaction, and it cannot be undone.
 *
 * It takes an `End` intent they signed with their own account, naming the two amounts their screen showed. The
 * relayer only pays for the transaction: the contract checks the signature against the recipient, works both amounts
 * out again and refuses if either differs. Only a gift of the second version can be ended; on the first there is no
 * such function, and nothing here pretends otherwise.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let account: string | undefined;
  const { id } = await context.params;
  try {
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const auth = readAccountAuthSession(request);
    account = auth.account;
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<EndBody>(request, 4 * 1_024);
    let signature: Hex;
    try {
      signature = canonicalSignature(String(body.signature ?? ""));
    } catch {
      throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
    }
    let keep: bigint;
    let giveBack: bigint;
    let nonce: bigint;
    let deadline: bigint;
    try {
      keep = BigInt(String(body.keep ?? ""));
      giveBack = BigInt(String(body.giveBack ?? ""));
      nonce = BigInt(String(body.nonce ?? ""));
      deadline = BigInt(String(body.deadline ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }

    assertGiftContractConfigured();
    const record = await loadGift(id);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    if (versionOfGift(record) !== 2) throw new GiftApiError("CANNOT_BE_ENDED", "This gift cannot be ended. Nothing was changed.", 409);
    const contract = escrowOf(record);
    const milestone = isMilestoneGiftId(id);
    const isRecipient = (recipient: string | null) => recipient !== null && recipient.toLowerCase() === auth.account.toLowerCase();
    // What ending it now would do, read from the contract: the amounts signed must be these, or the person is shown
    // them again rather than sent a transaction the contract would refuse.
    const offer = milestone
      ? await readMilestoneGift(contract, id).then((state) => (isRecipient(state.recipient) ? milestoneEndOffer(state, true) : "not yours"))
      : await readGift(contract, id).then((gift) => (isRecipient(gift.recipient) ? dailyEndOffer(gift, true) : "not yours"));
    if (offer === "not yours") throw new GiftApiError("NOT_YOURS", "Only the person the gift is for can end it.", 403);
    if (!offer) throw new GiftApiError("FINISHED", "This gift is finished.", 409);
    if (BigInt(offer.keep) !== keep || BigInt(offer.giveBack) !== giveBack) {
      throw new GiftApiError("END_CHANGED", "The amounts have changed since they were shown. Look at them again. Nothing was changed.", 409);
    }
    await admitRelay(request, auth.account);
    const result = milestone
      ? await relayMilestoneEnd({ giftId: id, contract, giveBack, nonce, deadline, signature })
      : await relayEnd({ giftId: id, escrow: contract, keep, giveBack, nonce, deadline, signature });
    return NextResponse.json({ giftId: id, ended: true, keep: keep.toString(), giveBack: giveBack.toString(), hash: result.hash }, { headers: NO_STORE });
  } catch (error) {
    return isMilestoneGiftId(id) ? milestoneErrorResponse(error, isOperator(account)) : giftErrorResponse(error, isOperator(account));
  }
}
