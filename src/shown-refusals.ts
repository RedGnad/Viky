import { SHOW_PROOF } from "./sentences";

/**
 * What a person reads for a typed refusal of a proof (the audit of 8 Oct 2026).
 *
 * Every refusal is typed, and most are written for the person where they are raised: a result under the target, a
 * page of another year, a verification that stopped. These are not. Their text says what happened inside the
 * verification ("The proof failed SDK or TEE verification", "The proof does not contain the pinned requests"), which
 * is for whoever reads the logs. The route keeps the code, logs the text, and says one of our sentences.
 *
 * A code raised anywhere in the verification is either here or named as said as written in
 * test/audit-proof-refusals-in-our-words.test.ts: a new one cannot reach a screen unclassified.
 */
const R = SHOW_PROOF.refusals;

export const REFUSALS_SAID_IN_OUR_WORDS: Readonly<Record<string, string>> = Object.freeze({
  // The proof itself, or what it is bound to, is not what was asked for.
  TEE_NOT_VERIFIED: R.notAccepted,
  PROOF_REJECTED: R.notAccepted,
  PROOF_IN_FUTURE: R.notAccepted,
  UNKNOWN_CONDITION: R.notAccepted,
  WRONG_PHASE: R.notAccepted,
  WRONG_KIND: R.notAccepted,
  WRONG_PROOF_COUNT: R.notAccepted,
  WRONG_REQUEST_SCHEMA: R.notAccepted,
  WRONG_SESSION: R.notAccepted,
  WRONG_GIFT_PHASE: R.notAccepted,
  WRONG_PROVIDER: R.notAccepted,
  WRONG_PHASE_ORDER: R.notAccepted,
  INVALID_POLICY: R.notAccepted,
  INVALID_PROOF_TIME: R.notAccepted,
  INVALID_CONTEXT: R.notAccepted,
  INVALID_PROFILE: R.notAccepted,
  INVALID_PROOF_ROLE: R.notAccepted,
  INVALID_XP: R.notAccepted,
  MISSING_FIELD: R.notAccepted,
  CONFLICTING_FIELD: R.notAccepted,
  CONFLICTING_FIELDS: R.notAccepted,
  REPLAYED_PROOF: R.notAccepted,
  NOT_AFTER_PREVIOUS: R.notAccepted,
  // A university's proof the pinned witness, method, version or pattern does not fit.
  WITNESS_MALFORMED: R.notAccepted,
  WITNESS_UNSIGNED: R.notAccepted,
  WITNESS_OTHER_SIGNER: R.notAccepted,
  WITNESS_OTHER_METHOD: R.notAccepted,
  WITNESS_OTHER_PATTERN: R.notAccepted,
  WITNESS_OTHER_VERSION: R.notAccepted,
  // Something of ours is missing: nothing the person did.
  NOT_CONFIGURED: R.notConfigured,
  NO_PORTAL: R.notConfigured,
  NO_SPACE: R.notConfigured,
  NO_GIFT_YEAR: R.notConfigured,
  // The session is not one to answer any more.
  UNKNOWN_SESSION: R.over,
  ALREADY_RECORDED: R.alreadyCounted,
});

/** The sentence for the person: ours for a refusal that speaks of the inside, the refusal's own otherwise. */
export function refusalForThePerson(code: string, message: string): string {
  return REFUSALS_SAID_IN_OUR_WORDS[code] ?? message;
}

/** Whether the refusal's own text was kept from the person, and so belongs in the logs. */
export function saidInOurWords(code: string): boolean {
  return code in REFUSALS_SAID_IN_OUR_WORDS;
}
