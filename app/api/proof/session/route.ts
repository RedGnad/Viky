import { NextResponse } from "next/server";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { accountAuthErrorStatus, accountAuthOriginFromRequest, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { DUOLINGO_MAX_DAY_INDEX } from "@/src/duolingo-proof-policy";
import { resolvePublicDuolingoProfile } from "@/src/duolingo-profile";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";
import { isReclaimQuotaRefusal, limitsNow, noteAttestedCall, REAL_READINGS_OFF, realReadingsOff, ReclaimLimitReached, startsAgainInWords } from "@/src/attested-calls";
import { conditionById } from "@/src/conditions";
import { LIMIT } from "@/src/sentences";
import { loadLatestEvidence, loadOpenShownSession, PROOF_SESSION_TTL_SECONDS, pruneExpiredProofSessions, saveProofSession, type ProofSessionPhase } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { channelFor, reclaimChannelInitOptions, reclaimChannelLaunchOptions } from "@/src/reclaim-channel";
import { loadGift } from "@/src/gift-store";
import { loadMilestoneGift } from "@/src/milestone-store";
import { shownConditionById, type ShownProvider } from "@/src/shown-conditions";
import { shownContextMessage } from "@/src/shown-proof";
import { ruleAsked } from "@/src/witness-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The session this account has open for a gift's one proof, or nothing (7 Oct 2026). The gift's page asks when it
 * loads, so a page loaded again while a proof is being made goes on waiting for it instead of offering to start over.
 * By the signed cookie's account and the gift alone: the browser names no session here.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    }
    const giftId = new URL(request.url).searchParams.get("giftId")?.trim() ?? "";
    const open = await loadOpenShownSession(giftId, auth.account);
    return NextResponse.json({ open }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authStatus = accountAuthErrorStatus(error);
    return NextResponse.json(
      { error: authStatus ? accountAuthPublicMessage(error) : "The open proof could not be read" },
      { status: authStatus || 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

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
  // The source a refusal names, once the condition is known: the register's own word for it.
  let source = "this";
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
    source = conditionById(entry.condition.conditionId)?.source ?? source;

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
    // witness on the portal's domain. Before its pin, whichever version the agent writes, unless the operator set the
    // version it runs on (a rule written by hand, src/portal-store.ts `runProviderOn`); after, the pinned one.
    const witness = provider?.witness;
    // A university's portal runs on the portal channel whatever the setting says (src/reclaim-channel.ts).
    const channel = channelFor({ witness: Boolean(witness) });
    // The month's limit of proofs (src/attested-calls.ts): said before the person starts, and nothing is opened at
    // Reclaim. The same when Reclaim itself refuses the session for its quota.
    if ((await limitsNow()).proofs) throw new ReclaimLimitReached("proofs");
    // A developer's machine opens no proof at Reclaim (src/attested-calls.ts).
    if (realReadingsOff()) throw new Error(REAL_READINGS_OFF);
    // The version asked and whether the agent's proofs are taken, from the provider alone (`ruleAsked`): under a pin,
    // the pinned rule at every press, whatever an earlier session of this gift came to (9 Oct 2026).
    const proofRequest = await ReclaimProofRequest.init(appId, appSecret, providerId, {
      ...ruleAsked({ providerVersion, witness }),
      ...reclaimChannelInitOptions(channel),
    }).catch((error: unknown) => {
      if (isReclaimQuotaRefusal(error)) throw new ReclaimLimitReached("proofs", { cause: error });
      throw error;
    });
    if (bound) proofRequest.setParams({ duolingo_user_id: bound.profileId });
    proofRequest.addContext(account.toLowerCase(), shownContextMessage(giftId, phase, dayIndex));
    // Once the proof is made, the verification page brings the person back to the gift's page (7 Oct 2026): with no
    // address to go to it left them where they were, and a phone had by then let go of the page they came from. The
    // address is this request's own site and the gift's number, and carries nothing else.
    proofRequest.setRedirectUrl(`${accountAuthOriginFromRequest(request)}/g/${giftId}`);
    // And when the session is abandoned, by inactivity or by an error (9 Oct 2026): the verification page goes to this
    // address after a moment if the request carries one, and stays on its closing screen otherwise. The same page, the
    // gift's, which then says the verification stopped.
    proofRequest.setCancelRedirectUrl(`${accountAuthOriginFromRequest(request)}/g/${giftId}`);

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
      requestUrl,
    });
    // Written down from the moment it is opened: a session that never comes back is deleted from its table after a
    // day, and this row is what still says it was asked (src/attested-calls.ts).
    await noteAttestedCall({ kind: "asked", source: entry.condition.conditionId, ok: true, ref: sessionId });

    return NextResponse.json({ sessionId, phase, dayIndex, requestUrl, secondsLeft: PROOF_SESSION_TTL_SECONDS }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReclaimLimitReached) {
      return NextResponse.json({ code: error.code, error: LIMIT.said(source, "proofs", startsAgainInWords(), true) }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const authStatus = accountAuthErrorStatus(error);
    return NextResponse.json(
      { error: authStatus ? accountAuthPublicMessage(error) : error instanceof Error ? error.message : "Could not start the proof" },
      { status: authStatus || 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
