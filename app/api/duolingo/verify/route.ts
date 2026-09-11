import { NextResponse } from "next/server";
import { fetchStatusUrl, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import type { Hex } from "viem";
import { isAddress } from "viem";
import { accountAuthErrorStatus, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { DUOLINGO_PROVIDER_ID, DUOLINGO_PROVIDER_VERSION } from "@/src/duolingo-proof-policy";
import { verifyDuolingoSession, VerificationError, type ReclaimStatus, type SdkVerification } from "@/src/duolingo-verification";
import { contractRefusal } from "@/src/gift-api";
import { signCheckIn } from "@/src/gift-attestation";
import { relayCheckIn } from "@/src/gift-relay";
import { consumeAndSaveVerification, loadLatestEvidence, loadProofSession } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { loadGift } from "@/src/gift-store";
import { escrowOf, RelayerError } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verifies one Duolingo session and, when it passes, records the signed check-in attestation for the
 * relayer. Ported from Lock-in's verify route: the AI fallback is refused by requiring a TEE attestation,
 * not by reading the self-reported isAiProof flag; that flag lives in a context a liar controls, the
 * attestation is cryptographic. The browser only says "session X finished".
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
    if (!configured || !isAddress(configured)) {
      throw new VerificationError("NOT_CONFIGURED", "The gift contract is not configured", 503);
    }
    const session = /^[a-zA-Z0-9_-]{6,200}$/.test(sessionId) ? await loadProofSession(sessionId) : null;
    // The check-in is signed for the contract that holds this gift (D30). With no session the core
    // refuses with UNKNOWN_SESSION before anything is signed, so the configured contract stands in.
    const giftEscrow: Hex = session ? escrowOf(await loadGift(session.giftId)) : (configured as Hex);

    const result = await verifyDuolingoSession(
      {
        loadSession: loadProofSession,
        loadLatestEvidence,
        consumeAndSaveVerification,
        fetchStatus: (sessionId) => fetchStatusUrl(sessionId) as Promise<ReclaimStatus>,
        verifyProofs: async (proofs: Proof[]) => {
          if (!appSecret) throw new VerificationError("NOT_CONFIGURED", "The Reclaim application is not configured", 503);
          const verified = await verifyProof(proofs, {
            providerId: DUOLINGO_PROVIDER_ID,
            providerVersion: DUOLINGO_PROVIDER_VERSION,
            allowedTags: [],
            teeAttestation: { appSecret },
          } as never);
          return verified as unknown as SdkVerification;
        },
        signCheckIn: (message) => signCheckIn(message, giftEscrow),
        appId,
        escrowAddress: giftEscrow,
        now: () => Math.floor(Date.now() / 1_000),
      },
      { sessionId, account: auth.account },
    );

    // The attestation expires in ten minutes: relay it now. A contract refusal is reported as such, with
    // its reason, not hidden behind a generic failure.
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
    if (authStatus) {
      return NextResponse.json({ error: accountAuthPublicMessage(error) }, { status: authStatus, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof VerificationError) {
      // The reason is the product here: every refusal is typed and demonstrable.
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The Duolingo proof was rejected", code: "REJECTED" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
