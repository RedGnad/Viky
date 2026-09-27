import { NextResponse } from "next/server";
import { encodeFunctionData, formatEther, getAddress, parseEther, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { giftGasLimit } from "@/src/gift-gas";
import { formatAusd, readGift } from "@/src/gift-reader";
import { loadGift } from "@/src/gift-store";
import { milestoneGasLimit } from "@/src/milestone-gas";
import { readMilestoneGift } from "@/src/milestone-reader";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { monadChain, waitForFinality } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, admitTopUp } from "@/src/relay-admission";
import { escrowOf, relayerClients, relayerPreflight } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Taking back a gift nobody has opened: what the funder's own account needs before it can send it.
 *
 * The contract asks for the funder in person (`msg.sender != g.funder` reverts), and there is no signed intent for
 * this one, so this is the one gesture the relayer cannot carry. The funder's account holds no chain coin, because
 * nothing else in the product needs it: every other move is a signature the relayer carries. So the relayer sends
 * this account exactly what its own transaction will cost, and the account sends the transaction itself.
 *
 * Nothing here cancels anything. It reads the gift, refuses everything the contract would refuse, puts the cost in
 * place, and hands back the call for the browser to send and the amount that is coming back, which is what the screen
 * shows before and after.
 */

/** A hard ceiling on what one ask can move, whatever the fee says: a bug here spends the relayer's own money. */
const MOST_TO_SEND = parseEther("0.05");

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    const record = await loadGift(id);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "That gift cannot be found.", 404);
    const funder = getAddress(auth.account);
    if (record.funder.toLowerCase() !== funder.toLowerCase()) throw new GiftApiError("NOT_FUNDER", "Only the account that made this gift can take it back.", 403);

    const escrow = escrowOf(record);
    const milestone = isMilestoneGiftId(id);
    const state = milestone ? await readMilestoneGift(escrow, id) : await readGift(escrow, id);
    if (state.cancelled) throw new GiftApiError("ALREADY_CANCELLED", "This gift has already been taken back.", 409);
    if (state.recipient) throw new GiftApiError("ALREADY_OPENED", "This gift is open, so it cannot be taken back any more.", 409);
    // What the contract would send back: everything that was put in, less anything already returned.
    const coming = state.amount - state.refundedToFunder;
    if (coming <= 0n) throw new GiftApiError("NOTHING_TO_TAKE_BACK", "There is nothing left in this gift.", 409);

    const data = encodeFunctionData({
      abi: [{ type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "giftId", type: "uint256" }], outputs: [] }] as const,
      functionName: "cancel",
      args: [BigInt(id)],
    });
    const gas = milestone ? milestoneGasLimit("cancel") : giftGasLimit("cancel");

    // Monad charges the limit that is declared, not what is used, so what this account needs is the whole limit at
    // today's price, and a third again so a rise between this answer and the send does not strand the gesture.
    await admitRelay(request, auth.account);
    const clients = relayerClients();
    await relayerPreflight(clients);
    const fees = await clients.publicClient.estimateFeesPerGas();
    const perGas = fees.maxFeePerGas ?? (await clients.publicClient.getGasPrice());
    const needs = (gas * perGas * 4n) / 3n;
    const held = await clients.publicClient.getBalance({ address: funder });
    let sent: Hex | null = null;
    if (held < needs) {
      const value = needs - held;
      if (value > MOST_TO_SEND) {
        console.error(JSON.stringify({ at: new Date().toISOString(), giftId: id, error: "TOO_EXPENSIVE", needs: formatEther(value) }));
        throw new GiftApiError("TOO_EXPENSIVE", "This cannot be done right now. Nothing was changed.", 503);
      }
      // One readying a minute, for the account and for the connection (D204): the top-up is MON of the relayer's.
      // And a few a gift for as long as it lives (the money path audit of 27 Sep 2026), so MON swept out after each
      // top-up cannot be asked for again in a loop.
      await admitTopUp(request, auth.account, id);
      sent = await clients.walletClient.sendTransaction({ account: clients.walletClient.account!, chain: monadChain, to: funder, value, gas: 21_000n });
      // The journal line of the relayer's MON given away: which gift, to whom, how much, under which transaction.
      console.log(JSON.stringify({ at: new Date().toISOString(), giftId: id, topUp: formatEther(value), to: funder, tx: sent }));
      await waitForFinality(clients.publicClient, sent);
    }

    return NextResponse.json({ to: escrow, data, gas: gas.toString(), comingBack: coming.toString(), comingBackDisplay: formatAusd(coming), readied: sent !== null }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
