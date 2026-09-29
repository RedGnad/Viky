import { NextResponse } from "next/server";
import { erc20Abi, getAddress, isAddress, type Abi, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { AUSD, coinAt, movesOnASignature } from "@/src/coins";
import { monadChain, waitForFinality } from "@/src/monad/chain";
import { addMonadGasBuffer } from "@/src/monad-gas";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, assertNotTooSmall } from "@/src/relay-admission";
import { relayerClients, relayerPreflight, RelayerError } from "@/src/relayer";
import { recordSend, sendReference } from "@/src/send-store";
import { isVikyContract } from "@/src/viky-contracts";
import { canonicalSignature } from "@/src/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Only the six fields the token itself checks, so nothing here can redirect what the person signed. */
const TRANSFER_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/**
 * Moves someone's own money where they asked, from an authorization they signed. Viky's relayer submits it
 * and pays, as it does for everything else.
 *
 * This exists because Monad reserves 10 MON per account and an account below that can make no contract call
 * at all (D53). Moving an ERC-20 is a contract call, so a person holding only their gift could never move it
 * themselves. The token accepts a signed authorization instead, and the signature is the whole authority:
 * the server chooses nothing, and cannot send anywhere the person did not sign for.
 *
 * Which coin is asked for rather than assumed since D77. This route was pinned to what a gift holds in four
 * separate places, so once the way out could change money into something else, none of it could be sent on.
 * The chain's own coin is refused here on purpose and not as an oversight: an authorization is a feature of a
 * token contract, so nobody can move it for somebody else, and the person sends that one themselves.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const body = await readJsonBody<{ to?: string; value?: string; validAfter?: string; validBefore?: string; nonce?: string; signature?: string; coin?: string }>(request, 4 * 1_024);
    const to = String(body.to ?? "");
    if (!isAddress(to)) throw new GiftApiError("INVALID_DESTINATION", "That destination is not valid.");
    // One of Viky's own contracts takes a plain transfer and can never give it back (the audit, 29 Sep 2026).
    if (isVikyContract(to)) throw new GiftApiError("VIKY_DESTINATION", "That code is Viky's own: money sent there could never be taken back out. Nothing was sent.");
    // Defaults to what a gift holds, so anything asking the way it always did keeps working unchanged.
    const coin = body.coin === undefined ? AUSD : coinAt(String(body.coin));
    if (!coin) throw new GiftApiError("UNKNOWN_COIN", "Viky cannot send that.");
    if (!movesOnASignature(coin)) {
      throw new GiftApiError(
        "SENT_BY_THEMSELVES",
        `${coin.symbol} is the network's own coin, so it is sent from your own account and the fee comes out of it. Viky cannot send it for you.`,
        409,
      );
    }
    const nonce = String(body.nonce ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    let signature: Hex;
    try {
      signature = canonicalSignature(String(body.signature ?? ""));
    } catch {
      throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
    }
    let value: bigint;
    let validAfter: bigint;
    let validBefore: bigint;
    try {
      value = BigInt(String(body.value ?? ""));
      validAfter = BigInt(String(body.validAfter ?? ""));
      validBefore = BigInt(String(body.validBefore ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    if (value <= 0n) throw new GiftApiError("INVALID_AMOUNT", "Enter an amount");

    // The sender is the signed-in account and nobody else: a signature for someone else's money is not
    // ours to relay, whatever the token would make of it.
    const from = getAddress(auth.account);
    // Counted against the account's and the connection's ceilings before the relayer is asked for anything (D204).
    await admitRelay(request, auth.account);
    const clients = relayerClients();
    await relayerPreflight(clients);

    const held = (await clients.publicClient.readContract({ address: coin.address, abi: erc20Abi, functionName: "balanceOf", args: [from] })) as bigint;
    if (held < value) throw new GiftApiError("NOT_ENOUGH", "That is more than you have.", 409);
    assertNotTooSmall("send", value, held);

    const args = [from, getAddress(to), value, validAfter, validBefore, nonce as Hex, signature] as const;
    try {
      await clients.publicClient.simulateContract({ address: coin.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, account: clients.address });
    } catch {
      throw new GiftApiError("REFUSED", "That could not be sent. Please try again.", 409);
    }
    const estimate = await clients.publicClient.estimateContractGas({ address: coin.address, abi: TRANSFER_ABI, functionName: "transferWithAuthorization", args, account: clients.address });
    const hash = await clients.walletClient.writeContract({
      address: coin.address,
      abi: TRANSFER_ABI,
      functionName: "transferWithAuthorization",
      args,
      gas: addMonadGasBuffer(estimate),
      account: clients.walletClient.account!,
      chain: monadChain,
    });
    let receipt;
    try {
      receipt = await waitForFinality(clients.publicClient, hash);
    } catch (error) {
      // Sent, and not known final yet: the money may have moved, so it is never said that nothing did, and the person
      // is asked to look before sending again rather than moving it twice (the money path audit of 27 Sep 2026).
      console.error(JSON.stringify({ at: new Date().toISOString(), sendUnconfirmed: hash, from, error: error instanceof Error ? error.message : String(error) }));
      throw new GiftApiError("SENT_UNCONFIRMED", "It was sent and is being confirmed. Check your balance in a minute before sending again.", 409);
    }
    if (receipt.status !== "success") throw new RelayerError("REVERTED", "That could not be sent. Nothing was taken.");
    // Written down once it is final, so the confirmation has a reference to print (decision 7). The money moved
    // whether or not this row lands, so a store that refuses is logged rather than turned into a refusal.
    let reference = sendReference(hash);
    try {
      reference = (await recordSend({ account: from, coin: coin.address, destination: getAddress(to), amount: value, txHash: hash })).reference;
    } catch (error) {
      console.error(`a send landed and could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
    return NextResponse.json({ sent: true, reference, sentAtMs: Date.now() }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
