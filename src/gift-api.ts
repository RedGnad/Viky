import { NextResponse } from "next/server";
import { accountAuthErrorStatus, accountAuthPublicMessage } from "./account-auth-server";
import { RelayerError } from "./relayer";
import { RequestError } from "./request-error";

/** Shared response helpers of the gift routes: every refusal carries a typed code and a plain sentence. */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export class GiftApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
  ) {
    super(message);
    this.name = "GiftApiError";
  }
}

/** What the contract's typed errors mean to a person. Unknown names fall back to the name itself. */
const CONTRACT_REFUSALS: Record<string, { code: string; message: string; status: 400 | 409 }> = {
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
};

export function giftErrorResponse(error: unknown): NextResponse {
  const authStatus = accountAuthErrorStatus(error);
  if (authStatus) return NextResponse.json({ error: accountAuthPublicMessage(error), code: "SIGN_IN_REQUIRED" }, { status: authStatus, headers: NO_STORE });
  if (error instanceof GiftApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  if (error instanceof RequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  if (error instanceof RelayerError) {
    if (error.code === "REVERTED") {
      const known = error.contractError ? CONTRACT_REFUSALS[error.contractError] : undefined;
      if (known) return NextResponse.json({ error: known.message, code: known.code, contractError: error.contractError }, { status: known.status, headers: NO_STORE });
      return NextResponse.json({ error: "This could not be recorded.", code: "REFUSED", contractError: error.contractError ?? null }, { status: 409, headers: NO_STORE });
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
  return known ? { code: known.code, message: known.message } : { code: "REFUSED", message: "This could not be recorded." };
}
