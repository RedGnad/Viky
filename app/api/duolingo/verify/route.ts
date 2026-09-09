import { NextResponse } from "next/server";
import { fetchStatusUrl, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import type { Hex } from "viem";
import { isAddress } from "viem";
import { accountAuthErrorStatus, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { DUOLINGO_PROVIDER_ID, DUOLINGO_PROVIDER_VERSION } from "@/src/duolingo-proof-policy";
import { verifyDuolingoSession, VerificationError, type ReclaimStatus, type SdkVerification } from "@/src/duolingo-verification";
import { signCheckIn } from "@/src/gift-attestation";
import { consumeAndSaveVerification, loadLatestEvidence, loadProofSession } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

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
    const escrow = process.env.GIFT_ESCROW_ADDRESS?.trim();
    const escrowAddress = escrow && isAddress(escrow) ? (escrow as Hex) : undefined;

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
        signCheckIn: (message) => signCheckIn(message, escrowAddress as Hex),
        appId,
        escrowAddress,
        now: () => Math.floor(Date.now() / 1_000),
      },
      { sessionId: String(body.sessionId ?? "").trim(), account: auth.account },
    );

    return NextResponse.json({ ...result, attested: true }, { headers: { "Cache-Control": "no-store" } });
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
