import { DUOLINGO_OWNERSHIP_REQUEST_HASH, DUOLINGO_PROVIDER_ID, DUOLINGO_PROVIDER_VERSION, DUOLINGO_XP_REQUEST_HASH } from "./duolingo-proof-policy";
import { DUOLINGO_SESSION_PROVIDER_ID } from "./gift-terms";
import { refuseShown, type ShownCondition } from "./shown-proof";

/**
 * The conditions a person proves by showing their own account, in one register (D162).
 *
 * Two kinds. A daily one binds an account once and then proves one day at a time; its proof is judged by the
 * daily contract and it keeps the policy it always had, because that policy knows things only Duolingo knows (the
 * ownership marker, the profile the baseline bound, the XP since the previous proof). A milestone one takes a
 * single proof that reaches it, judged by the milestone contract like any certificate (form 1), and its proof is
 * read by the generic policy in src/shown-proof.ts.
 *
 * What both kinds share is everything a session is: sealed with the gift and the phase, pinned to a provider and
 * its version and requests, refused without a TEE attestation. That is why they live in one list.
 */

export type ShownKind = "daily" | "milestone";

export type ShownEntry = Readonly<{
  kind: ShownKind;
  condition: ShownCondition;
  /**
   * The subject a milestone gift is made with (D162, the founder's decision of 22 Sep 2026): constant per condition,
   * because the proof carries no name. What binds the person is the account they signed in to, and the recipient the
   * contract already checks. A daily condition has none: its identity is the profile the baseline bound.
   */
  subject?: `0x${string}`;
}>;

/** The daily lesson, as the connected flow has always proved it. Its `read` is never called: the daily policy reads it. */
export const DUOLINGO_SHOWN: ShownEntry = {
  kind: "daily",
  condition: {
    conditionId: "duolingo-daily",
    providerId: DUOLINGO_PROVIDER_ID,
    providerVersion: DUOLINGO_PROVIDER_VERSION,
    requestHashes: [DUOLINGO_OWNERSHIP_REQUEST_HASH, DUOLINGO_XP_REQUEST_HASH],
    proofCount: 2,
    phases: ["baseline", "check-in"],
    attestationProviderId: DUOLINGO_SESSION_PROVIDER_ID,
    read: () => refuseShown("WRONG_KIND", "A daily proof is read by the daily policy, not here"),
  },
};

export const SHOWN_CONDITIONS: readonly ShownEntry[] = [DUOLINGO_SHOWN];

export function shownConditionById(conditionId: string): ShownEntry | undefined {
  return SHOWN_CONDITIONS.find((entry) => entry.condition.conditionId === conditionId);
}
