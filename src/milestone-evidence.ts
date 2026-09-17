/**
 * What the judges page may say about the milestone contract, as facts recorded once they happened on mainnet (C2).
 * Every field is empty until the thing it names exists, and the page prints nothing for an empty field: a claim on
 * that page is a transaction anybody can look up, or it is not there.
 */
export type MilestoneEvidence = Readonly<{
  /** The deployment transaction. */
  deployTx: string | null;
  /** Set only once Sourcify has answered a match for the deployed code. */
  sourcifyMatch: string | null;
  /** The first real milestone gift, and the transactions that made, opened, started and settled it. */
  giftId: string | null;
  createTx: string | null;
  claimTx: string | null;
  startTx: string | null;
  /** A refusal read from the contract for that gift, with the exact command and the typed error it returns. */
  refusal: Readonly<{ command: string; error: string; selector: string }> | null;
}>;

export const MILESTONE_EVIDENCE: MilestoneEvidence = {
  deployTx: null,
  sourcifyMatch: null,
  giftId: null,
  createTx: null,
  claimTx: null,
  startTx: null,
  refusal: null,
};
