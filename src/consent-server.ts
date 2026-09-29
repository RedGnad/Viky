import { climbOfGoal, CODEFORCES_CLIMB } from "./climbs";
import { conditionOfGoal } from "./conditions";
import { consentText, KEPT_AFTER, type ConsentKind } from "./consent";
import { consentTermsFor, type ConsentTerms, type Voice } from "./consent-terms";
import { readGift } from "./gift-reader";
import { loadGift, type GiftRecord } from "./gift-store";
import { readMilestoneGift } from "./milestone-reader";
import { isMilestoneGiftId } from "./milestone-protocol";
import { loadMilestoneGift } from "./milestone-store";
import { contractDayInWords, dateInWords } from "./moments";
import { escrowOf } from "./relayer";

/**
 * A gift's agreement, as the server writes it (the founder, 29 Sep 2026): who may sign it, what it covers, until when,
 * and its exact text. Server only: it reads the gift's record and its state on the contract.
 */

export type GiftConsent = Readonly<{
  giftId: string;
  /** The person it is for, as the contract knows them, or nobody before the gift is opened. */
  recipient: string | null;
  funder: string;
  /** What the yes covers, in the person's voice and in the funder's. */
  terms: ConsentTerms;
  termsTheirs: ConsentTerms;
  until: string;
  /** The day the yes stops holding, as an epoch second, or nothing before the gift has started. */
  endsAt: number | null;
  conditionId: string;
  /** When it was funded, which says whether it began before agreements (src/consent-guard.ts). */
  fundedAt: number;
  /** Settled or taken back: nothing is read for it any more. */
  finished: boolean;
  funderName: string | null;
}>;

/** The gift's agreement, or nothing for a gift that does not exist or whose condition Viky does not read. */
export async function giftConsent(giftId: string, record?: GiftRecord | null): Promise<GiftConsent | null> {
  const gift = record ?? (await loadGift(giftId));
  if (!gift) return null;
  const contract = escrowOf(gift);
  if (isMilestoneGiftId(giftId)) {
    const [state, milestone] = await Promise.all([readMilestoneGift(contract, giftId), loadMilestoneGift(giftId)]);
    // The record names its condition; a record without one is read by the goal the contract holds.
    const climb = climbOfGoal(state.goalType);
    const conditionId = milestone?.conditionId || conditionOfGoal(state.goalType)?.id || (climb && climb !== CODEFORCES_CLIMB ? "chess-rating" : "");
    const cadence = conditionId === "chess-rating" ? milestone?.mode || climb || "" : "";
    const terms = consentTermsFor(conditionId, "yours", cadence);
    const termsTheirs = consentTermsFor(conditionId, "theirs", cadence);
    if (!terms || !termsTheirs) return null;
    const until = state.deadline > 0 ? `${dateInWords(state.deadline * 1000, "UTC")}, the gift's last day` : `the gift's end, ${state.durationDays} days after its first reading`;
    return {
      giftId,
      recipient: state.recipient,
      funder: gift.funder,
      terms,
      termsTheirs,
      until,
      endsAt: state.deadline > 0 ? state.deadline : null,
      conditionId,
      fundedAt: state.fundedAt,
      finished: state.settled || state.cancelled,
      funderName: gift.funderName,
    };
  }
  const state = await readGift(contract, giftId);
  const condition = conditionOfGoal(state.goalType);
  const terms = condition ? consentTermsFor(condition.id, "yours") : null;
  const termsTheirs = condition ? consentTermsFor(condition.id, "theirs") : null;
  if (!terms || !termsTheirs) return null;
  const until = state.endDay > 0 ? `${contractDayInWords(state.endDay, true)}, the gift's last day` : `the gift's end, ${state.durationDays} days after it starts counting`;
  return {
    giftId,
    recipient: state.recipient,
    funder: gift.funder,
    terms,
    termsTheirs,
    until,
    endsAt: state.endDay > 0 ? (state.endDay + 1) * 86_400 : null,
    conditionId: condition?.id ?? "",
    fundedAt: state.fundedAt,
    finished: state.finalised || state.cancelled,
    funderName: gift.funderName,
  };
}

/** The exact text of a yes or a stop for this gift and this account. */
export function giftConsentText(kind: ConsentKind, consent: GiftConsent, account: string): string {
  return consentText(kind, { account, giftId: consent.giftId, terms: consent.terms, until: consent.until, kept: KEPT_AFTER });
}

export function termsFor(consent: GiftConsent, voice: Voice): ConsentTerms {
  return voice === "yours" ? consent.terms : consent.termsTheirs;
}
