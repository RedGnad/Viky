import { NextResponse } from "next/server";
import { fetchStatusUrl, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import { noteAttestedCall } from "@/src/attested-calls";
import type { Hex } from "viem";
import { isAddress } from "viem";
import { accountAuthErrorStatus, accountAuthPublicMessage, readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { VerificationError, type ReclaimStatus, type SdkVerification } from "@/src/duolingo-verification";
import { contractRefusal, GiftApiError } from "@/src/gift-api";
import { signCheckIn } from "@/src/gift-attestation";
import { readGift } from "@/src/gift-reader";
import { drainExpiredDays, relayCheckIn } from "@/src/gift-relay";
import { loadGift } from "@/src/gift-store";
import { holdTheStart, type StartAsked } from "@/src/held-start";
import { assertReadingInProportion, ReadingOutOfProportion } from "@/src/reading-proportion";
import { StartNotSigned } from "@/src/v2-start";
import { readMilestoneGift } from "@/src/milestone-reader";
import { loadMilestoneGift } from "@/src/milestone-store";
import { relayProve } from "@/src/milestone-relay";
import { recordReading } from "@/src/milestone-store";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { consumeAndSaveVerification, loadAttestation, loadLatestEvidence, loadProofSession } from "@/src/proof-session-store";
import { giftReadingLeave } from "@/src/consent-guard";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, countedIfSent } from "@/src/relay-admission";
import { escrowOf, RelayerError } from "@/src/relayer";
import { confirmPin, holdForReview, loadPortal } from "@/src/portal-store";
import { sendPinnedRuleAlert, sendReviewAlert } from "@/src/provider-alert";
import { shownConditionById } from "@/src/shown-conditions";
import { verifyShownSession } from "@/src/shown-verification";
import { tellReached } from "@/src/morning-send-live";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { FinalityTimeout } from "@/src/monad/chain";
import { RequestError } from "@/src/request-error";
import { SHOW_PROOF } from "@/src/sentences";
import { refusalForThePerson, saidInOurWords } from "@/src/shown-refusals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verifies one shown-proof session and, when it passes, records what the contract needs (D162). Ported from
 * Lock-in's verify route, where it knew one source by name. A witness portal aside (D312, verified by the pinned
 * witness on its own domain, and held for review until pinned), the AI fallback is refused by requiring a TEE
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

    // A proof came back from Reclaim: counted once for its session, whatever is then made of it, because it is the
    // proof that Reclaim's month counts and not the verdict (src/attested-calls.ts). Counted here and not where the
    // enclave is checked (7 Oct 2026): a university's proof is verified by the witness and never goes there, and a
    // proof refused before that check came back all the same.
    let cameBackWithProof = false;
    let counted = false;
    const cameBack = async (ok: boolean) => {
      counted = true;
      await noteAttestedCall({ kind: "verification", source: session?.conditionId ?? "unknown", ok, ref: sessionId });
    };
    const result = await verifyShownSession(
      {
        loadSession: loadProofSession,
        loadLatestEvidence,
        consumeAndSaveVerification,
        consumeShownSession: consumeAndSaveVerification,
        fetchStatus: async (id) => {
          const status = (await fetchStatusUrl(id)) as ReclaimStatus;
          const proofs = status.session?.proofs;
          cameBackWithProof = Array.isArray(proofs) ? proofs.length > 0 : Boolean(proofs);
          return status;
        },
        verifyProofs: async (proofs: Proof[]) => {
          if (!appSecret) throw new VerificationError("NOT_CONFIGURED", "The Reclaim application is not configured", 503);
          const verified = await verifyProof(proofs, {
            providerId: provider?.providerId ?? entry?.condition.providerId,
            providerVersion: provider?.providerVersion ?? entry?.condition.providerVersion,
            allowedTags: [],
            teeAttestation: { appSecret },
          } as never).catch(async (error: unknown) => {
            await cameBack(false);
            throw error;
          });
          await cameBack((verified as { isVerified?: unknown }).isVerified === true);
          return verified as unknown as SdkVerification;
        },
        // A figure out of all proportion with the target is not signed for (src/reading-proportion.ts).
        signCheckIn: async (message) => {
          await assertReadingInProportion(giftEscrow, await readGift(giftEscrow, message.giftId.toString()), message);
          return signCheckIn(message, giftEscrow);
        },
        drainExpired: async (giftId) => {
          await drainExpiredDays(giftId, giftEscrow);
        },
        prove: relayProve,
        record: recordReading,
        milestoneRecordOf: loadMilestoneGift,
        leave: giftReadingLeave,
        // A first proof held for review is checked within an hour (the founder, 29 Sep 2026): the operator is told at once.
        holdForReview: async (review) => {
          const held = await holdForReview(review);
          if (held) await sendReviewAlert(review, (await loadPortal(review.portalId).catch(() => null))?.university ?? null);
          return held;
        },
        confirmPin,
        // A session of a pinned rule that Reclaim ended with no proof (9 Oct 2026): the operator is told, in one line.
        pinnedRuleStopped: async (stop) => sendPinnedRuleAlert(stop, (await loadPortal(stop.portalId).catch(() => null))?.university ?? null),
        milestoneOf: async (giftId) => {
          if (!isMilestoneGiftId(giftId)) return null;
          const state = await readMilestoneGift(giftEscrow, giftId);
          // The target too (D185): for a result whose number is the person's own, the verdict is what is attested.
          return state.recipient
            ? { contract: giftEscrow, recipient: state.recipient, opened: true, settled: state.settled || state.cancelled, target: state.target }
            : { contract: giftEscrow, recipient: "0x0000000000000000000000000000000000000000", opened: false, settled: false, target: state.target };
        },
        appId,
        escrowAddress: giftEscrow,
        now: () => Math.floor(Date.now() / 1_000),
      },
      { sessionId, account: auth.account },
    ).then(
      async (outcome) => {
        if (cameBackWithProof && !counted) await cameBack(true);
        return outcome;
      },
      async (error: unknown) => {
        if (cameBackWithProof && !counted) await cameBack(false);
        throw error;
      },
    );

    if (result.kind === "reached") {
      // Whoever asked to be told that it is theirs is told now, by the request that made it so (the founder, 1 Oct 2026).
      if (result.arrived) await tellReached(result.giftId);
      return NextResponse.json({ ...result, attested: true }, { headers: { "Cache-Control": "no-store" } });
    }
    // A first proof held for review (D312): nothing attested, nothing relayed.
    if (result.kind === "held") return NextResponse.json({ ...result, attested: false }, { headers: { "Cache-Control": "no-store" } });

    // A daily attestation expires in ten minutes: relay it now. A contract refusal is reported as such, with its
    // reason, not hidden behind a generic failure.
    let relayed: { hash: string; creditedDays: number } | null = null;
    let refusal: { code: string; message: string } | null = null;
    /** The second version: a first reading waits for the recipient's own signature, and the browser is told what to sign. */
    let sign: StartAsked | null = null;
    if (process.env.RELAYER_PRIVATE_KEY?.trim()) {
      try {
        const admitted = await admitRelay(request, auth.account);
        const submitted = await countedIfSent(admitted, () => relayCheckIn(result.sessionId, giftEscrow));
        relayed = { hash: submitted.hash, creditedDays: submitted.creditedDays };
      } catch (error) {
        if (error instanceof StartNotSigned) {
          const stored = await loadAttestation(result.sessionId);
          sign = stored ? await holdTheStart(error, { account: auth.account, message: stored.message, sessionId: result.sessionId, after: {} }) : null;
        } else if (error instanceof RelayerError && error.code === "REVERTED") {
          refusal = contractRefusal(error.contractError) ?? { code: "REFUSED", message: "This could not be recorded." };
        } else if (error instanceof GiftApiError) {
          // The ceiling (D204): the proof stands, attested; the day is not relayed now, and the person reads why.
          refusal = { code: error.code, message: error.message };
        } else {
          throw error;
        }
      }
    }
    return NextResponse.json({ ...result, attested: true, relayed, refusal, ...(sign ? { sign } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authStatus = accountAuthErrorStatus(error);
    if (authStatus) return NextResponse.json({ error: accountAuthPublicMessage(error) }, { status: authStatus, headers: { "Cache-Control": "no-store" } });
    // A figure out of all proportion with the gift's target: nothing was signed, and the operator was told.
    if (error instanceof ReadingOutOfProportion) return NextResponse.json({ error: error.message, code: error.code }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (error instanceof VerificationError) {
      // The reason is the product here: every refusal is typed and demonstrable. Its code is the refusal's own; its
      // sentence is the refusal's too when it was written for the person, and ours when it speaks of the inside
      // (src/shown-refusals.ts), in which case the logs keep what it said.
      if (saidInOurWords(error.code)) console.warn(JSON.stringify({ proofRefused: error.code, said: error.message.slice(0, 300) }));
      return NextResponse.json({ error: refusalForThePerson(error.code, error.message), code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    // The proof is for another subject than the gift's: the milestone table's sentence names a chess account.
    if (error instanceof RelayerError && error.code === "REVERTED" && error.contractError === "IdentityMismatch") {
      return NextResponse.json({ error: SHOW_PROOF.refusals.otherSubject, code: "OTHER_SUBJECT", contractError: error.contractError }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    // The relay's own answers, as every other route says them: a contract's refusal by its name, the relayer not
    // ready, and a send that left and is not known to be final yet, which must not be started again.
    if (error instanceof RelayerError || error instanceof FinalityTimeout) return milestoneErrorResponse(error);
    // A body this route refused is said as written. Anything else is a library's or the network's text: for our
    // logs, never for the person (the audit of 8 Oct 2026).
    if (error instanceof RequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("proof not verified:", error);
    return NextResponse.json({ error: SHOW_PROOF.refusals.unavailable, code: "REJECTED" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
