import { DUOLINGO_OWNERSHIP_REQUEST_HASH, DUOLINGO_PROVIDER_ID, DUOLINGO_PROVIDER_VERSION, DUOLINGO_XP_REQUEST_HASH } from "./duolingo-proof-policy";
import { DUOLINGO_SESSION_PROVIDER_ID } from "./gift-terms";
import { refuseShown, type ShownCondition, type ShownReading } from "./shown-proof";
import type { Hex } from "viem";
import type { MilestoneRecord } from "./milestone-store";
import { loadPortal, type Portal } from "./portal-store";
import { TOEFL_RECLAIM_PROVIDER, TOEFL_SHOWN_SUBJECT, toeflScoreOf, toeflShownProviderId } from "./toefl-shown";
import {
  enrolledBy,
  gradeShownBy,
  NO_RESULTS_PAGE,
  type ResultsExtract,
  type ResultsVerdict,
  UNIVERSITY_ENROLLED,
  universityGradeProviderId,
  universityGradeSubject,
  universityShownProviderId,
  universitySubject,
  universityYearProviderId,
  universityYearSubject,
  yearPassedBy,
} from "./university-shown";

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

/** The Reclaim provider a proof must come from, and what its fields mean: fixed for a condition, or read off the gift. */
export type ShownProvider = Readonly<{
  providerId: string;
  providerVersion: string;
  requestHashes: readonly string[];
  read: ShownCondition["read"];
  /** Where the person signs in, for the screen that hands them there. */
  loginUrl?: string;
  /**
   * Why no proof can come from this gift's source, when the reason is not "no portal": a portal proved for
   * enrolment and not for its results page (D174). Set with an empty provider id, and said by its code.
   */
  missing?: Readonly<{ code: string; message: string }>;
}>;

export type ShownEntry = Readonly<{
  kind: ShownKind;
  condition: ShownCondition;
  /**
   * The provider for one gift, when it is not the condition's own: a university gift reads it off the portal the
   * gift was made on (D165). Nothing when the condition's provider is the one, as the TOEFL's is.
   */
  providerOf?: (record: MilestoneRecord) => Promise<ShownProvider | null>;
  /**
   * The subject a milestone gift is made with (D162, the founder's decision of 22 Sep 2026): constant per condition,
   * because the proof carries no name. What binds the person is the account they signed in to, and the recipient the
   * contract already checks. A daily condition has none: its identity is the profile the baseline bound.
   */
  subject?: `0x${string}`;
  /** The subject for one gift, when it depends on the gift: the portal, for a university gift (D165). */
  subjectOf?: (record: MilestoneRecord) => Hex | null;
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

/**
 * A TOEFL score shown from the person's own ETS account (D164): one proof, one field that counts. The booking id the
 * provider also extracts is kept as the key of the account, never printed.
 */
export const TOEFL_SHOWN: ShownEntry = {
  kind: "milestone",
  subject: TOEFL_SHOWN_SUBJECT,
  condition: {
    conditionId: "toefl-mybest-shown",
    providerId: TOEFL_RECLAIM_PROVIDER.id,
    providerVersion: TOEFL_RECLAIM_PROVIDER.version,
    requestHashes: [TOEFL_RECLAIM_PROVIDER.requestHash],
    proofCount: 1,
    phases: ["reach"],
    attestationProviderId: toeflShownProviderId(),
    read: (fields) => {
      const score = toeflScoreOf(fields.scoreValue);
      if (score === undefined) refuseShown("INVALID_SCORE", "The page showed no score on the test's own scale");
      return { metricValue: BigInt(score), eventAt: null, accountKey: fields.bookingId ?? null, inWords: String(score) };
    },
  },
};

/** A portal's own provider, as its row pins it, and what its field means (D165). */
function providerOfPortal(portal: Portal): ShownProvider {
  return {
    providerId: portal.providerId,
    providerVersion: portal.providerVersion,
    requestHashes: [portal.requestHash],
    loginUrl: portal.loginUrl,
    read: (fields) => {
      if (!enrolledBy(portal.extract, fields)) refuseShown("NOT_ENROLLED", "The page shown does not say enrolled");
      return { metricValue: BigInt(UNIVERSITY_ENROLLED), eventAt: null, accountKey: null, inWords: "Enrolled" };
    },
  };
}

/**
 * Staying enrolled, shown from the person's own student portal (D165). The condition has no provider of its own: each
 * gift names the portal it was made on, and the portal's row says which provider, which request and which field.
 */
export const UNIVERSITY_SHOWN: ShownEntry = {
  kind: "milestone",
  subjectOf: (record) => (record.portal ? universitySubject(record.portal) : null),
  providerOf: async (record) => {
    if (!record.portal) return null;
    const portal = await loadPortal(record.portal);
    return portal ? providerOfPortal(portal) : null;
  },
  condition: {
    conditionId: "university-enrollment-shown",
    providerId: "",
    providerVersion: "",
    requestHashes: [],
    proofCount: 1,
    phases: ["reach"],
    attestationProviderId: universityShownProviderId(),
    read: () => refuseShown("NO_PORTAL", "A university gift reads its provider from its portal, and this gift names none"),
  },
};

/** What a results page carries once read by the row's own rule, as the policy takes it, or the typed refusal. */
function readingOf(verdict: ResultsVerdict): ShownReading {
  if (verdict.kind === "refused") refuseShown(verdict.code, verdict.message);
  return { metricValue: BigInt(verdict.metricValue), eventAt: null, accountKey: null, inWords: verdict.inWords };
}

/**
 * The results page of a portal, as its row pins it (D174): the second provider on the row, or, when only enrolment
 * has been proved there, a provider that cannot serve and says why, so a gift on the year or a grade is refused
 * `NO_RESULTS_PAGE` by name and never `NO_PORTAL`.
 */
function resultsProviderOf(portal: Portal, read: (results: ResultsExtract, fields: Readonly<Record<string, string>>) => ResultsVerdict): ShownProvider {
  const results = portal.results;
  if (!results) return { providerId: "", providerVersion: "", requestHashes: [], missing: NO_RESULTS_PAGE, read: () => refuseShown(NO_RESULTS_PAGE.code, NO_RESULTS_PAGE.message) };
  return {
    providerId: results.providerId,
    providerVersion: results.providerVersion,
    requestHashes: [results.requestHash],
    loginUrl: portal.loginUrl,
    read: (fields) => readingOf(read(results, fields)),
  };
}

async function resultsOf(record: MilestoneRecord, read: (results: ResultsExtract, fields: Readonly<Record<string, string>>) => ResultsVerdict): Promise<ShownProvider | null> {
  if (!record.portal) return null;
  const portal = await loadPortal(record.portal);
  return portal ? resultsProviderOf(portal, read) : null;
}

/** Passing the year at their university, shown from the results page of the portal the gift names (D174). */
export const UNIVERSITY_YEAR_SHOWN: ShownEntry = {
  kind: "milestone",
  subjectOf: (record) => (record.portal ? universityYearSubject(record.portal) : null),
  providerOf: (record) => resultsOf(record, yearPassedBy),
  condition: {
    conditionId: "university-year-passed-shown",
    providerId: "",
    providerVersion: "",
    requestHashes: [],
    proofCount: 1,
    phases: ["reach"],
    attestationProviderId: universityYearProviderId(),
    read: () => refuseShown("NO_PORTAL", "A university gift reads its provider from its portal, and this gift names none"),
  },
};

/** Reaching a grade at their university, shown from the same results page, on the row's own scale (D174). */
export const UNIVERSITY_GRADE_SHOWN: ShownEntry = {
  kind: "milestone",
  subjectOf: (record) => (record.portal ? universityGradeSubject(record.portal) : null),
  providerOf: (record) => resultsOf(record, gradeShownBy),
  condition: {
    conditionId: "university-grade-shown",
    providerId: "",
    providerVersion: "",
    requestHashes: [],
    proofCount: 1,
    phases: ["reach"],
    attestationProviderId: universityGradeProviderId(),
    read: () => refuseShown("NO_PORTAL", "A university gift reads its provider from its portal, and this gift names none"),
  },
};

export const SHOWN_CONDITIONS: readonly ShownEntry[] = [DUOLINGO_SHOWN, TOEFL_SHOWN, UNIVERSITY_SHOWN, UNIVERSITY_YEAR_SHOWN, UNIVERSITY_GRADE_SHOWN];

export function shownConditionById(conditionId: string): ShownEntry | undefined {
  return SHOWN_CONDITIONS.find((entry) => entry.condition.conditionId === conditionId);
}
