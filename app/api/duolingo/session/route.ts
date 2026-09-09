import { NextResponse } from "next/server";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { accountAuthErrorStatus, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import {
  DUOLINGO_MAX_DAY_INDEX,
  DUOLINGO_PROVIDER_ID,
  DUOLINGO_PROVIDER_VERSION,
  duolingoContextMessage,
} from "@/src/duolingo-proof-policy";
import { resolvePublicDuolingoProfile } from "@/src/duolingo-profile";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-attestation";
import { loadLatestEvidence, pruneExpiredProofSessions, saveProofSession } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { reclaimChannelInitOptions, reclaimChannelLaunchOptions, resolveReclaimChannel } from "@/src/reclaim-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Opens a Reclaim session for one phase of a gift: the baseline that binds the Duolingo account, or a
 * check-in for one day. Ported from Lock-in's session route.
 *
 * The account, the gift, the phase and the day are sealed into the SIGNED Reclaim context as
 * `<giftId>:baseline` or `<giftId>:<dayIndex>`, so a baseline can never come back as a check-in, one
 * day's proof cannot serve another day, and a proof cannot be moved between accounts or gifts. The
 * profile id is resolved from Duolingo's public API here rather than trusted from the browser: the proof
 * must be bound to the account we asked about, not to whichever account the recipient is signed into.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 4 * 1_024);
    // The account comes from the signed session cookie, never from the body.
    const auth = readAccountAuthSession(request);
    const account = auth.account;
    const rate = checkRateLimit("session", request, account);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    // Cheap opportunistic cleanup so aged sessions never accumulate; failure here must not block a proof.
    void pruneExpiredProofSessions().catch(() => {});

    const giftId = String(body.giftId ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId)) throw new Error("Unknown gift");
    const phase = body.phase === "check-in" ? "check-in" : "baseline";
    const dayIndex = phase === "baseline" ? 0 : Number(body.dayIndex);
    if (phase === "check-in" && (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > DUOLINGO_MAX_DAY_INDEX)) {
      throw new Error("A check-in needs a valid day");
    }
    const username = String(body.username ?? "").trim();
    if (!username) throw new Error("Enter your Duolingo username");

    // A check-in must be on the account the baseline bound: the profile is read back from the stored
    // evidence, never from the request.
    const previous = phase === "check-in" ? await loadLatestEvidence(giftId, account) : null;
    if (phase === "check-in" && !previous) throw new Error("Connect your Duolingo account before checking in");

    const profile = await resolvePublicDuolingoProfile(username);
    if (previous && previous.profileId !== profile.id) {
      throw new Error("This is a different Duolingo account than the one connected to this gift");
    }

    const appId = process.env.RECLAIM_APP_ID?.trim();
    const appSecret = process.env.RECLAIM_APP_SECRET?.trim();
    if (!appId || !appSecret) throw new Error("The Reclaim application is not configured");

    const channel = resolveReclaimChannel();
    const proofRequest = await ReclaimProofRequest.init(appId, appSecret, DUOLINGO_PROVIDER_ID, {
      providerVersion: DUOLINGO_PROVIDER_VERSION,
      // The portal can substitute AI-witnessed proofs while still reporting success. We refuse AI here,
      // and the verify route refuses anything without a verified TEE attestation anyway.
      acceptAiProviders: false,
      ...reclaimChannelInitOptions(channel),
    });
    proofRequest.setParams({ duolingo_user_id: profile.id });
    proofRequest.addContext(account.toLowerCase(), duolingoContextMessage(giftId, phase, dayIndex));

    const sessionId = proofRequest.getStatusUrl().split("/").pop() || "";
    const requestUrl = await proofRequest.getRequestUrl(reclaimChannelLaunchOptions(channel));

    await saveProofSession({
      sessionId,
      account,
      giftId,
      goalType: GOAL_TYPE_DUOLINGO_XP,
      phase,
      dayIndex,
      duolingoUsername: profile.username,
      duolingoProfileId: profile.id,
    });

    return NextResponse.json({ sessionId, phase, dayIndex, requestUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authStatus = accountAuthErrorStatus(error);
    return NextResponse.json(
      {
        error: authStatus ? accountAuthPublicMessage(error) : error instanceof Error ? error.message : "Could not start the Duolingo check-in",
      },
      { status: authStatus || 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
