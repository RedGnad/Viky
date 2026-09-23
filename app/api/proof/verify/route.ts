import { NextResponse } from "next/server";
import { fetchStatusUrl, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import type { Hex } from "viem";
import { isAddress } from "viem";
import { accountAuthErrorStatus, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { VerificationError, type ReclaimStatus, type SdkVerification } from "@/src/duolingo-verification";
import { contractRefusal } from "@/src/gift-api";
import { signCheckIn } from "@/src/gift-attestation";
import { relayCheckIn } from "@/src/gift-relay";
import { loadGift } from "@/src/gift-store";
import { readMilestoneGift } from "@/src/milestone-reader";
import { loadMilestoneGift } from "@/src/milestone-store";
import { relayProve } from "@/src/milestone-relay";
import { recordReading } from "@/src/milestone-store";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { consumeAndSaveVerification, loadLatestEvidence, loadProofSession } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { escrowOf, RelayerError } from "@/src/relayer";
import { shownConditionById } from "@/src/shown-conditions";
import { verifyShownSession } from "@/src/shown-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verifies one shown-proof session and, when it passes, records what the contract needs (D162). Ported from
 * Lock-in's verify route, where it knew one source by name. The AI fallback is refused by requiring a TEE
 * attestation, not by reading the self-reported isAiProof flag: that flag lives in a context a liar controls, the
 * attestation is cryptographic. The browser only says "session X finished".
 *
 * A daily session ends as it always did: a signed check-in, relayed to the daily contract. A milestone session ends
 * as a certificate reading does: a signed proof, relayed to the milestone contract, which checks it again.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 4 * 1_024);
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }

    const appId = process.env.RECLAIM_APP_ID?.trim() ?? "";
    const appSecret = process.env.RECLAIM_APP_SECRET?.trim() ?? "";
    const sessionId = String(body.sessionId ?? "").trim();
    // Fail closed before any database access, with the same typed code the core would raise.
    const configured = process.env.GIFT_ESCROW_ADDRESS?.trim();
    if (!configured || !isAddress(configured)) throw new VerificationError("NOT_CONFIGURED", "The gift contract is not configured", 503);
    const session = /^[a-zA-Z0-9_-]{6,200}$/.test(sessionId) ? await loadProofSession(sessionId) : null;
    // The check-in is signed for the contract that holds this gift (D30). With no session the core refuses with
    // UNKNOWN_SESSION before anything is signed, so the configured contract stands in.
    const giftEscrow: Hex = session ? escrowOf(await loadGift(session.giftId)) : (configured as Hex);
    const entry = session ? shownConditionById(session.conditionId) : undefined;
    const record = session && entry?.providerOf ? await loadMilestoneGift(session.giftId) : null;
    const provider = entry?.providerOf && record ? await entry.providerOf(record) : null;

    const result = await verifyShownSession(
      {
        loadSession: loadProofSession,
        loadLatestEvidence,
        consumeAndSaveVerification,
        consumeShownSession: consumeAndSaveVerification,
        fetchStatus: (id) => fetchStatusUrl(id) as Promise<ReclaimStatus>,
        verifyProofs: async (proofs: Proof[]) => {
          if (!appSecret) throw new VerificationError("NOT_CONFIGURED", "The Reclaim application is not configured", 503);
          const verified = await verifyProof(proofs, {
            providerId: provider?.providerId ?? entry?.condition.providerId,
            providerVersion: provider?.providerVersion ?? entry?.condition.providerVersion,
            allowedTags: [],
            teeAttestation: { appSecret },
          } as never);
          return verified as unknown as SdkVerification;
        },
        signCheckIn: (message) => signCheckIn(message, giftEscrow),
        prove: relayProve,
        record: recordReading,
        milestoneRecordOf: loadMilestoneGift,
        milestoneOf: async (giftId) => {
          if (!isMilestoneGiftId(giftId)) return null;
          const state = await readMilestoneGift(giftEscrow, giftId);
          return state.recipient ? { contract: giftEscrow, recipient: state.recipient, opened: true, settled: state.settled || state.cancelled } : { contract: giftEscrow, recipient: "0x0000000000000000000000000000000000000000", opened: false, settled: false };
        },
        appId,
        escrowAddress: giftEscrow,
        now: () => Math.floor(Date.now() / 1_000),
      },
      { sessionId, account: auth.account },
    );

    if (result.kind === "reached") return NextResponse.json({ ...result, attested: true }, { headers: { "Cache-Control": "no-store" } });

    // A daily attestation expires in ten minutes: relay it now. A contract refusal is reported as such, with its
    // reason, not hidden behind a generic failure.
    let relayed: { hash: string; creditedDays: number } | null = null;
    let refusal: { code: string; message: string } | null = null;
    if (process.env.RELAYER_PRIVATE_KEY?.trim()) {
      try {
        const submitted = await relayCheckIn(result.sessionId, giftEscrow);
        relayed = { hash: submitted.hash, creditedDays: submitted.creditedDays };
      } catch (error) {
        if (error instanceof RelayerError && error.code === "REVERTED") {
          refusal = contractRefusal(error.contractError) ?? { code: "REFUSED", message: "This could not be recorded." };
        } else {
          throw error;
        }
      }
    }
    return NextResponse.json({ ...result, attested: true, relayed, refusal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authStatus = accountAuthErrorStatus(error);
    if (authStatus) return NextResponse.json({ error: accountAuthPublicMessage(error) }, { status: authStatus, headers: { "Cache-Control": "no-store" } });
    if (error instanceof VerificationError) {
      // The reason is the product here: every refusal is typed and demonstrable.
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "The proof was rejected", code: "REJECTED" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
