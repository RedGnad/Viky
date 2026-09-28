import { NextResponse } from "next/server";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { accountAuthErrorStatus, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { DUOLINGO_MAX_DAY_INDEX } from "@/src/duolingo-proof-policy";
import { resolvePublicDuolingoProfile } from "@/src/duolingo-profile";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";
import { loadLatestEvidence, pruneExpiredProofSessions, saveProofSession, type ProofSessionPhase } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { reclaimChannelInitOptions, reclaimChannelLaunchOptions, resolveReclaimChannel } from "@/src/reclaim-channel";
import { loadGift } from "@/src/gift-store";
import { loadMilestoneGift } from "@/src/milestone-store";
import { shownConditionById, type ShownProvider } from "@/src/shown-conditions";
import { shownContextMessage } from "@/src/shown-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Opens a Reclaim session for one phase of a gift, for whichever condition the gift is on (D162). Ported from
 * Lock-in's session route, where it knew one source by name.
 *
 * The account, the gift, the phase and the day are sealed into the SIGNED Reclaim context as `<giftId>:baseline`,
 * `<giftId>:<dayIndex>` or `<giftId>:reach`, so a baseline can never come back as a check-in, one day's proof cannot
 * serve another day, a milestone's one proof cannot serve a daily gift, and no proof can be moved between accounts or
 * gifts. A daily condition still resolves the profile it binds from the source's public API here rather than
 * trusting the browser: the proof must be bound to the account we asked about, not to whichever account the
 * recipient is signed into.
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
    const entry = shownConditionById(String(body.conditionId ?? "duolingo-daily").trim());
    if (!entry) throw new Error("Unknown condition");

    const asked = String(body.phase ?? "");
    const phase: ProofSessionPhase = entry.kind === "milestone" ? "reach" : asked === "check-in" ? "check-in" : "baseline";
    const dayIndex = phase === "check-in" ? Number(body.dayIndex) : 0;
    if (phase === "check-in" && (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > DUOLINGO_MAX_DAY_INDEX)) {
      throw new Error("A check-in needs a valid day");
    }

    // A daily condition binds a named account, and a check-in must be on the account the baseline bound: the profile
    // is read back from the stored evidence, never from the request.
    let bound: { username: string; profileId: string } | undefined;
    if (entry.kind === "daily") {
      const username = String(body.username ?? "").trim();
      if (!username) throw new Error("Enter your Duolingo username");
      const previous = phase === "check-in" ? await loadLatestEvidence(giftId, account) : null;
      if (phase === "check-in" && !previous) throw new Error("Connect your Duolingo account before checking in");
      const profile = await resolvePublicDuolingoProfile(username);
      if (previous && previous.profileId !== profile.id) throw new Error("This is a different Duolingo account than the one connected to this gift");
      bound = { username: profile.username, profileId: profile.id };
    }

    // Only the person the gift is for opens a proof for it (the review of 23 Sep 2026, finding 5): a session is a
    // Reclaim verification, counted against the account's quota, and a proof is only ever theirs to show.
    const gift = await loadGift(giftId);
    if (!gift) throw new Error("Unknown gift");
    if (gift.recipient?.toLowerCase() !== account.toLowerCase()) throw new Error("This gift is not yours to prove");
    const appId = process.env.RECLAIM_APP_ID?.trim();
    const appSecret = process.env.RECLAIM_APP_SECRET?.trim();
    if (!appId || !appSecret) throw new Error("The Reclaim application is not configured");

    // The provider this gift's proof comes from: the condition's own, or read off the gift (a university gift's
    // portal, D165).
    const record = entry.providerOf ? await loadMilestoneGift(giftId) : null;
    const provider: ShownProvider | null = entry.providerOf && record ? await entry.providerOf(record) : null;
    const providerId = provider?.providerId ?? entry.condition.providerId;
    const providerVersion = provider?.providerVersion ?? entry.condition.providerVersion;
    // A university whose provider of this sense is being built (D313): said as such, never as "no portal".
    if (!providerId) throw new Error(provider?.missing?.message ?? "This gift names no portal a proof could come from");

    // A university read through a Reclaim AI provider (D312): the one case AI is accepted, verified by the pinned
    // witness on the portal's domain. Before its pin, whichever version the agent writes; after, the pinned one.
    const witness = provider?.witness;
    const channel = resolveReclaimChannel();
    const proofRequest = await ReclaimProofRequest.init(appId, appSecret, providerId, {
      ...(witness && !witness.pin ? {} : { providerVersion }),
      // Everywhere else the portal can substitute AI-witnessed proofs while still reporting success. We refuse AI
      // there, and the verify route refuses anything without a verified TEE attestation anyway.
      acceptAiProviders: Boolean(witness),
      ...reclaimChannelInitOptions(channel),
    });
    if (bound) proofRequest.setParams({ duolingo_user_id: bound.profileId });
    proofRequest.addContext(account.toLowerCase(), shownContextMessage(giftId, phase, dayIndex));

    const sessionId = proofRequest.getStatusUrl().split("/").pop() || "";
    const requestUrl = await proofRequest.getRequestUrl(reclaimChannelLaunchOptions(channel));

    await saveProofSession({
      sessionId,
      account,
      giftId,
      goalType: GOAL_TYPE_DUOLINGO_XP,
      conditionId: entry.condition.conditionId,
      phase,
      dayIndex,
      ...(bound ? { duolingoUsername: bound.username, duolingoProfileId: bound.profileId } : {}),
    });

    return NextResponse.json({ sessionId, phase, dayIndex, requestUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authStatus = accountAuthErrorStatus(error);
    return NextResponse.json(
      { error: authStatus ? accountAuthPublicMessage(error) : error instanceof Error ? error.message : "Could not start the proof" },
      { status: authStatus || 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
