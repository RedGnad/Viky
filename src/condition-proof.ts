import { CONDITIONS, type Condition } from "./conditions";

/**
 * What each condition actually proves, in the register's own words (U2).
 *
 * It sits beside `src/conditions.ts` rather than inside it because it answers a different question: that file says what
 * a condition is and how it is read, this one says what a reading is worth. Four questions, the same four for every
 * condition, so two conditions can be compared rather than praised:
 *
 * 1. Does the data come from the source's own servers?
 * 2. Is the account theirs?
 * 3. Who acted on the account?
 * 4. What does the source itself do against cheating?
 *
 * The rule for every sentence here: never stronger than what the code does. Where a thing is not known, it says so,
 * and `docs/SCREEN-CLAIMS.md` names the code path that makes each line true. The sources for question four are the
 * platforms' own published pages, read on 17 Sep 2026 and listed in `docs/DECISIONS.md`.
 */

export type ConditionProof = Readonly<{
  conditionId: string;
  /** The one line the chooser shows under the condition, so the funder reads it before choosing, not after. */
  inShort: string;
  /** Question 1: where the number comes from. */
  data: string;
  /** Question 2: how the account is tied to the person the gift is for. */
  account: string;
  /** Question 3: who performed the activity. The honest answer is the same everywhere, and it is not flattering. */
  whoActed: string;
  /** Question 4: what the source does about cheating, and what it publishes that we can read. */
  sourcePolicing: string;
}>;

export const CONDITION_PROOFS: readonly ConditionProof[] = [
  {
    conditionId: "duolingo-daily",
    inShort: "Read each morning from Duolingo. It proves the account did the lesson, not who held the phone.",
    data: "Duolingo's own servers, read once a morning through an attested fetch. The reading is signed by Reclaim's attestor and Viky checks that signature, the address that signed it and the request it was about, before a day can count. Nobody types a number, and the person never touches the proof. When the gift is made on one course, the reading is anchored on that course's id, so experience won in another course is not in it.",
    account: "Proved once, before anything counts: either the funder names the Duolingo account when they offer the gift, or the person puts a short code in their Duolingo display name and Viky reads it there.",
    whoActed: "Unknown, and it is the honest answer: the reading proves what that account did, never who did it. Somebody else with the password, or a script, would read the same. Duolingo describes no proctoring and verifies no identity.",
    sourcePolicing: "Duolingo's own rules forbid scripts written to cheat and forbid scraping, and its terms let it delete an account for it. It publishes no anti-cheat status a third party can read, so Viky has nothing to check against: this is the weakest of the conditions on that question, and the founder says so.",
  },
  {
    conditionId: "chess-rating",
    inShort: "Read from Chess.com, which polices cheating itself. Viky never pays an account it has closed.",
    data: "Chess.com's public API, read every day through an attested fetch and checked the same way as Duolingo. The rating read is the one Chess.com publishes for that cadence, with its own reliability figure beside it.",
    account: "The funder names the Chess.com account, and the person proves it is theirs with a short code when they open the gift.",
    whoActed: "Unknown here too: the rating belongs to the account. What is different is that Chess.com hunts exactly that, and says so publicly.",
    sourcePolicing: "Chess.com polices engine use, outside help, account sharing and arranged results itself, publishes the sanction in the same API Viky reads (`status: closed:fair_play_violations`), and Viky refuses a closed account at every reading, so a gift is never paid on an account its own source has closed.",
  },
  {
    conditionId: "coursera-certificate",
    inShort: "Read from the certificate's public page. Coursera checks identity once, not each piece of work.",
    data: "The public page of the certificate, read through an attested fetch when the person shares its link.",
    account: "The certificate page names its holder, and the funder names who the gift is for. A certificate shared by somebody else would be read exactly the same.",
    whoActed: "Unknown: Coursera describes no supervision of each assignment.",
    sourcePolicing: "Coursera verifies identity once per account, with an official document and a selfie, and says some programmes require it while others only check a name. Nothing published says a certificate was earned under supervision.",
  },
];

export function proofOfCondition(conditionId: string): ConditionProof | undefined {
  return CONDITION_PROOFS.find((entry) => entry.conditionId === conditionId);
}

/** Every condition with what it proves, for the judges page: the register's order, so nothing can be left out quietly. */
export function conditionsWithProof(): ReadonlyArray<{ condition: Condition; proof: ConditionProof }> {
  return CONDITIONS.flatMap((condition) => {
    const proof = proofOfCondition(condition.id);
    return proof ? [{ condition, proof }] : [];
  });
}
