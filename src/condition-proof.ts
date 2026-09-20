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
  /**
   * Whether the source itself describes watching the act, rather than only owning the account. It was false of every
   * condition until the Duolingo English Test, and the sentence below has to follow it either way (U3).
   */
  supervised: boolean;
  /** Question 3: who performed the activity. Where nothing is watched, the honest answer is "Unknown". */
  whoActed: string;
  /** Question 4: what the source does about cheating, and what it publishes that we can read. */
  sourcePolicing: string;
}>;

export const CONDITION_PROOFS: readonly ConditionProof[] = [
  {
    conditionId: "duolingo-daily",
    supervised: false,
    inShort: "Read each morning from Duolingo. It proves the account did the lesson, not who held the phone.",
    data: "Duolingo's own servers, read once a morning through an attested fetch. The reading is signed by Reclaim's attestor and Viky checks that signature, the address that signed it and the request it was about, before a day can count. Nobody types a number, and the person never touches the proof. When the gift is made on one course, the reading is anchored on that course's id, so experience won in another course is not in it.",
    account: "Proved once, before anything counts: either the funder names the Duolingo account when they offer the gift, or the person puts a short code in their Duolingo display name and Viky reads it there.",
    whoActed: "Unknown, and it is the honest answer: the reading proves what that account did, never who did it. Somebody else with the password, or a script, would read the same. Duolingo describes no proctoring and verifies no identity.",
    sourcePolicing: "Duolingo's own rules forbid scripts written to cheat and forbid scraping, and its terms let it delete an account for it. It publishes no anti-cheat status a third party can read, so Viky has nothing to check against: this is the weakest of the conditions on that question, and it is said here rather than left to be found.",
  },
  {
    conditionId: "chess-rating",
    supervised: false,
    inShort: "Read from Chess.com, which polices cheating itself. Viky never pays an account it has closed.",
    data: "Chess.com's public API, read every day through an attested fetch and checked the same way as Duolingo. The rating read is the one Chess.com publishes for that cadence, with its own reliability figure beside it.",
    account: "The funder names the Chess.com account, and the person proves it is theirs with a short code when they open the gift.",
    whoActed: "Unknown here too: the rating belongs to the account. What is different is that Chess.com hunts exactly that, and says so publicly.",
    sourcePolicing: "Chess.com polices engine use, outside help, account sharing and arranged results itself, publishes the sanction in the same API Viky reads (`status: closed:fair_play_violations`), and Viky refuses a closed account at every reading, so a gift is never paid on an account its own source has closed.",
  },
  {
    conditionId: "chess-tactics",
    supervised: false,
    inShort: "Read from Chess.com, which says nothing about policing puzzles. It only goes up, and never comes back down.",
    data: "Chess.com's public API, the same page as the rating, read through an attested fetch and checked the same way. What is read is `tactics.highest`, the best puzzle rating that account ever reached: it never goes down, so nothing the person does after beating their record can take the gift away from them.",
    account: "The funder names the Chess.com account, and the person proves it is theirs with a short code when they open the gift.",
    whoActed: "Unknown, and less watched here than in a game: a puzzle is solved alone against a clock, with no opponent and no game anybody can examine afterwards. The reading proves what that account reached, never who was at the keyboard.",
    sourcePolicing:
      "Chess.com closes an account for a Fair Play violation and publishes it in the same API Viky reads (`status: closed:fair_play_violations`), and Viky refuses a closed account at every reading. What it does not publish is anything about puzzles: read on 20 Sep 2026, neither its Fair Play policy nor its help centre article on Fair Play mentions the puzzle rating, and what they forbid is written about play. So nothing tells us this number is policed the way a rating is, and this condition is the weaker of the two on that question.",
  },
  {
    conditionId: "duolingo-english-test",
    supervised: true,
    inShort: "A test sat under watch, with an identity document and examiners. The result has a page they share.",
    data: "The page of the certificate its taker chose to make public, read through an attested fetch that takes three fields and no more: the score, the day of the test, and the name printed on it. The same answer also carries a date of birth and a photograph; Viky matches neither, receives neither and stores neither. The link is read again at every reading, so a certificate taken private again or past its two years stops paying, and says which. That reading is made by a program, which is the act Duolingo's terms ask to be asked about first, and that question has not been answered.",
    account: "The funder types the name the person will sit the test under, and it is hashed into the terms they sign. A certificate in another name pays nothing. Two people with the same name cannot be told apart by this, because the page has no field its holder can edit: that gap is written down rather than dressed up.",
    whoActed: "Known, and this is the only condition where it is: Duolingo records the session, checks a valid identity document, and has qualified examiners review it before a score is released.",
    sourcePolicing: "Duolingo may invalidate a result after it has been certified and notify everyone who received it, and it says so in its own terms. A certificate can also be taken private again by its holder, and expires two years after the test. All three are visible in the reading Viky already makes.",
  },
  {
    conditionId: "coursera-certificate",
    supervised: false,
    inShort: "Read from the certificate's public page. Coursera checks identity once, not each piece of work.",
    data: "The public page of the certificate, read through an attested fetch when the person shares its link, and read again at every reading: four things come out of it and nothing else, the name on it, the course, the certificate's own code and the day it was granted. That reading is made by a program, which is the act Coursera's terms ask to be asked about first, and that question has not been answered.",
    account: "The funder names the person and the course, and both are hashed into the terms they sign, so a certificate for another course or in another name pays nothing. Two people of the same name who finish the same course inside the same days cannot be told apart by this, because the page has no field its holder can edit: that gap is written down rather than dressed up.",
    whoActed: "Unknown: Coursera describes no supervision of each assignment.",
    sourcePolicing: "Coursera verifies identity once per account, with an official document and a selfie, and says some programmes require it while others only check a name. Nothing published says a certificate was earned under supervision.",
  },
  {
    conditionId: "credly-badge",
    supervised: false,
    inShort: "The badge its issuer published: nobody can award themselves one, and the record says which it is.",
    data: "Two public records of the same badge, read through an attested fetch and read again at every reading: the Open Badges assertion, which says the day and carries the issuer's id and the badge class's id, and the badge's public page, which is the only place the holder's name is published. Three things come out of them and nothing else. The assertion also carries the holder's email address, hashed; nothing here matches it, receives it or keeps it.",
    account: "The funder names the person and chooses the certification, and both are hashed into the terms they sign, so a badge for another certification or in another name pays nothing. The certification is decided by the pair of ids Credly publishes rather than by a title, which can be edited or reused. Two people of the same name who earn the same certification inside the same days cannot be told apart by this, because the page has no field its holder can edit: that gap is written down rather than dressed up.",
    whoActed: "Unknown: nothing describes how the work behind the badge was supervised, and it varies by issuer. What is different from a certificate a site prints for its own course is that the issuer is a third party who awards the badge, so nobody can award one to themselves.",
    sourcePolicing: "Credly hosts what issuers award and does not mark the work: a badge can be revoked by its issuer, and a holder can make it private again, and both stop the reading, because the two records are read again every time. Nothing published says a badge was earned under supervision.",
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
