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
  // Deployed 17 Sep 2026 16:36 UTC, block 105,654,716; Sourcify exact match at creation and at runtime, 16:37 UTC.
  deployTx: "0x12d91b784d5abcb14ed7941c6de60b3eeb73fc978209653dbdd5c6fb9f7806e1",
  sourcifyMatch: "1855380",
  giftId: null,
  createTx: null,
  claimTx: null,
  startTx: null,
  refusal: null,
};
