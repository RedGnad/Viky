import { NextResponse } from "next/server";
import { getAddress, type Hex } from "viem";
import { accountAuthErrorStatus, accountAuthPublicMessage } from "./account-auth-server";
import { RelayerError } from "./relayer";
import { RequestError } from "./request-error";

/** Shared response helpers of the gift routes: every refusal carries a typed code and a plain sentence. */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export class GiftApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 429 | 503 = 400,
  ) {
    super(message);
    this.name = "GiftApiError";
  }
}

/**
 * A gift is opened by the person it is for, never by the account that made it (the audit of 1 Oct 2026): a funder who
 * signed in on their own link was shown "Open my gift" and the route let them, which binds the money to its own giver
 * and leaves nothing to send. Refused before anything is relayed, with what to do instead.
 */
export function refuseOwnGift(gift: Readonly<{ funder: string }>, account: string): void {
  if (gift.funder.toLowerCase() === account.toLowerCase()) {
    throw new GiftApiError("OWN_GIFT", "This is the gift you made. Send its link to the person it is for.", 409);
  }
}

/** What the contract's typed errors mean to a person. Unknown names fall back to the name itself. */
const CONTRACT_REFUSALS: Record<string, { code: string; message: string; status: 400 | 404 | 409 | 503 }> = {
  InsufficientProgress: { code: "NOT_ENOUGH_PROGRESS", message: "Not enough yet for a full day. One more lesson and it counts.", status: 409 },
  NothingToCredit: { code: "NOTHING_TO_CREDIT", message: "Everything up to yesterday is already counted. Come back tomorrow.", status: 409 },
  OutsideWindow: { code: "NOT_STARTED", message: "Your gift starts counting tomorrow.", status: 409 },
  NullifierAlreadyUsed: { code: "ALREADY_RECORDED", message: "That reading was already counted.", status: 409 },
  IdentityMismatch: { code: "OTHER_ACCOUNT", message: "This is not the account connected to this gift.", status: 409 },
  ProviderMismatch: { code: "OTHER_GOAL", message: "That reading is for another kind of goal.", status: 409 },
  MetricDecreased: { code: "PROGRESS_WENT_BACKWARDS", message: "Your Duolingo reads lower than last time. Nothing was changed.", status: 409 },
  StaleObservation: { code: "OLDER_THAN_LAST", message: "That reading is older than the last one. Try again in a moment.", status: 409 },
  AttestationExpired: { code: "EXPIRED", message: "That reading took too long. Try again in a moment.", status: 409 },
  InvalidAttestationWindow: { code: "EXPIRED", message: "That reading took too long. Try again in a moment.", status: 409 },
  AlreadyClaimed: { code: "ALREADY_CLAIMED", message: "This gift was already opened.", status: 409 },
  ContactMismatch: { code: "CLAIM_LINK_INVALID", message: "This link does not match the gift.", status: 409 },
  GiftIsCancelled: { code: "CANCELLED", message: "This gift was taken back before it was opened.", status: 409 },
  AlreadyFinalised: { code: "FINISHED", message: "This gift is finished.", status: 409 },
  NotClaimed: { code: "NOT_OPENED", message: "Open the gift first.", status: 409 },
  InsufficientEarned: { code: "NOT_ENOUGH_EARNED", message: "That is more than what is yours so far.", status: 409 },
  IntentExpired: { code: "EXPIRED", message: "This request took too long. Please try again.", status: 409 },
  InvalidIntentNonce: { code: "STALE_REQUEST", message: "Please try again.", status: 409 },
  InvalidRecipientSignature: { code: "NOT_YOURS", message: "Only the person the gift is for can take it.", status: 409 },
  CheckInIsPaused: { code: "PAUSED", message: "Check-ins are paused for a moment. Try again later.", status: 409 },
  CreationIsPaused: { code: "PAUSED", message: "New gifts are paused for a moment. Try again later.", status: 409 },
  UnknownGoal: { code: "GOAL_NOT_OFFERED", message: "This goal is not offered yet.", status: 400 },
  InvalidAuthorizationNonce: { code: "TERMS_MISMATCH", message: "The signed terms do not match the gift.", status: 400 },
  NothingToDrain: { code: "NOTHING_TO_DRAIN", message: "No missed day to settle yet.", status: 409 },
  FinalisationTooEarly: { code: "TOO_EARLY", message: "The gift is not over yet.", status: 409 },
  NothingToRefund: { code: "NOTHING_TO_REFUND", message: "Nothing to send back yet.", status: 409 },
  // Sixteen refusals had no sentence, so a person met "This could not be recorded", which says nothing and
  // hides which rule stopped them. Some of these should never reach anybody; they still say something true.
  NotRecipient: { code: "NOT_YOURS", message: "Only the person the gift is for can take it.", status: 409 },
  NotFunder: { code: "NOT_YOURS", message: "Only the person who sent this gift can do that.", status: 409 },
  CancellationClosed: { code: "ALREADY_OPENED", message: "This gift was already opened, so it cannot be taken back.", status: 409 },
  NoBaseline: { code: "NOT_STARTED", message: "This gift has not started counting yet.", status: 409 },
  GiftNotFound: { code: "UNKNOWN_GIFT", message: "This gift does not exist.", status: 404 },
  InvalidAddress: { code: "INVALID_DESTINATION", message: "That destination is not valid.", status: 400 },
  InvalidAmount: { code: "INVALID_AMOUNT", message: "That amount is not allowed.", status: 400 },
  InvalidDuration: { code: "INVALID_DURATION", message: "That number of days is not allowed.", status: 400 },
  InvalidDailyTarget: { code: "INVALID_TARGET", message: "That daily target is not allowed.", status: 400 },
  InvalidContactHash: { code: "INVALID_CONTACT", message: "That way of reaching them is not valid.", status: 400 },
  InvalidGoalType: { code: "GOAL_NOT_OFFERED", message: "This goal is not offered yet.", status: 400 },
  InvalidGiftId: { code: "UNKNOWN_GIFT", message: "This gift does not exist.", status: 404 },
  InvalidProofHash: { code: "REFUSED", message: "That reading could not be used. Try again in a minute.", status: 409 },
  InvalidEvidenceSigner: { code: "REFUSED", message: "That reading was not signed by Viky. Nothing was changed.", status: 409 },
  InvalidTokenDecimals: { code: "NOT_CONFIGURED", message: "Viky is not ready for this yet. Nothing was changed.", status: 503 },
  TransferShortfall: { code: "REFUSED", message: "The money did not move as expected, so nothing was changed.", status: 409 },
  // The second version of the two gift contracts (the audit of 1 Oct 2026).
  InvalidOpeningSignature: { code: "CLAIM_LINK_INVALID", message: "This link does not open this gift.", status: 409 },
  InvalidOpeningKey: { code: "OUT_OF_DATE", message: "This page is out of date. Load it again and send the gift from there. Nothing was taken.", status: 400 },
  RecipientIsFunder: { code: "OWN_GIFT", message: "This is the gift you made. Send its link to the person it is for.", status: 409 },
  EndTermsChanged: { code: "END_CHANGED", message: "The amounts have changed since they were shown. Look at them again. Nothing was changed.", status: 409 },
  // The way out. Its refusals all end the same way on purpose: their money did not move.
  TooLittleBack: { code: "RATE_MOVED", message: "The rate moved, so this would have paid you less than you were shown. Nothing was taken.", status: 409 },
  DeadlinePassed: { code: "TOO_SLOW", message: "This took too long. Nothing was taken. Ask for a new quote.", status: 409 },
  ExchangeFailed: { code: "EXCHANGE_REFUSED", message: "The exchange could not do it right now. Nothing was taken.", status: 409 },
  PayoutFailed: { code: "PAYOUT_REFUSED", message: "The money could not reach that destination. Nothing was taken.", status: 409 },
  PayoutNotDelivered: { code: "PAYOUT_REFUSED", message: "The money could not reach that destination. Nothing was taken.", status: 409 },
  ExchangeMoved: { code: "NOT_CONFIGURED", message: "Viky stopped before doing anything, because the exchange changed. Nothing was taken.", status: 503 },
  ExchangeNotAllowed: { code: "NOT_CONFIGURED", message: "Viky is not ready for this yet. Nothing was taken.", status: 503 },
  ExchangeNotEligible: { code: "NOT_CONFIGURED", message: "Viky is not ready for this yet. Nothing was taken.", status: 503 },
  TermsMismatch: { code: "NOT_CONFIGURED", message: "Viky is not ready for this yet. Nothing was taken.", status: 503 },
  UnexpectedTokens: { code: "NOT_CONFIGURED", message: "Viky stopped before doing anything, because the exchange did something it does not normally do. Nothing was taken.", status: 503 },
  PinRequired: { code: "NOT_CONFIGURED", message: "Viky is not ready for this yet. Nothing was taken.", status: 503 },
  OwnershipIsNotRenounceable: { code: "NOT_CONFIGURED", message: "Viky is not ready for this yet. Nothing was taken.", status: 503 },
};

/**
 * `forOperator` adds the refusal exactly as the chain gave it. Only ever true for one of our own accounts
 * (src/dev-access.ts): it is technical text, and a person using Viky must never meet it.
 */
export function giftErrorResponse(error: unknown, forOperator = false): NextResponse {
  const authStatus = accountAuthErrorStatus(error);
  if (authStatus) return NextResponse.json({ error: accountAuthPublicMessage(error), code: "SIGN_IN_REQUIRED" }, { status: authStatus, headers: NO_STORE });
  if (error instanceof GiftApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  if (error instanceof RequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  if (error instanceof RelayerError) {
    if (error.code === "REVERTED") {
      const known = error.contractError ? CONTRACT_REFUSALS[error.contractError] : undefined;
      if (known) return NextResponse.json({ error: known.message, code: known.code, contractError: error.contractError }, { status: known.status, headers: NO_STORE });
      // Put the reason in the sentence itself for one of our own accounts. A page already open, or served
      // from a cache, shows the message and may not know about any newer field, and the reason is the whole
      // point of asking someone to try again.
      const reason = error.contractError ?? error.rawReason;
      if (forOperator && reason) {
        return NextResponse.json(
          { error: `This could not be recorded: ${reason}`, code: "REFUSED", contractError: error.contractError ?? null, detail: reason },
          { status: 409, headers: NO_STORE },
        );
      }
      console.error(`contract refusal with no message: ${error.contractError ?? "undecodable"}`);
      return NextResponse.json(
        {
          error: "This could not be recorded.",
          code: "REFUSED",
          contractError: error.contractError ?? null,
          // Whatever the chain gave, decoded name or raw text. Showing it only when nothing decoded was the
          // wrong test: a refusal can be named and still have no sentence of ours to map to.
          detail: forOperator ? (error.contractError ?? error.rawReason) : undefined,
        },
        { status: 409, headers: NO_STORE },
      );
    }
    return NextResponse.json({ error: "Viky is not ready for this yet. Nothing was changed.", code: error.code }, { status: 503, headers: NO_STORE });
  }
  // Anything else is a library or infrastructure error: its text is for our logs, never for the person.
  console.error("gift route failed:", error);
  return NextResponse.json({ error: "Something went wrong. Nothing was changed.", code: "FAILED" }, { status: 500, headers: NO_STORE });
}

export function contractRefusal(name: string | undefined): { code: string; message: string } | null {
  if (!name) return null;
  const known = CONTRACT_REFUSALS[name];
  if (known) return { code: known.code, message: known.message };
  // A refusal with no sentence is a gap in the table, not a fact about the person. Say so in the log, so the
  // next one is named rather than guessed at from a screenshot.
  console.error(`contract refusal with no message: ${name}`);
  return { code: "REFUSED", message: "This could not be recorded." };
}

/**
 * Where unearned money goes back: the account that offers the gift, and no other (the audit, 29 Sep 2026). A request
 * naming another destination is refused rather than quietly corrected, so nothing the browser sends can send a
 * funder's money anywhere else.
 */
export function refundDestination(asked: unknown, account: string): Hex {
  const named = asked !== undefined && asked !== null && asked !== "";
  if (named && (typeof asked !== "string" || asked.toLowerCase() !== account.toLowerCase())) {
    throw new GiftApiError("INVALID_REFUND", "Unearned money can only go back to the account that offers the gift.");
  }
  return getAddress(account);
}
