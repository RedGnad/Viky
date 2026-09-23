import type { Condition } from "./conditions";

/**
 * What Viky keeps of what a condition reads, condition by condition (D185, the founder's rule of 23 Sep 2026 for the
 * exams, the Study rail and School, the same as for an account the person connects): a number that is the person's
 * own, a score, a grade, an average, is seen once by them and by nobody else, kept nowhere, and the public program
 * receives the verdict alone. A number a source publishes about them, a rating or the XP a day is counted on, is kept
 * as it is read and written into the program, as it always was. The privacy page prints these lines, one per
 * condition, and the verification reads `kept` to know which rule a session falls under.
 */
export type ConditionPrivacy = Readonly<{
  /**
   * `number`: the number read is kept with each reading and goes to the public program. `fact`: a certificate found on
   * a page the person shares, kept with the gift as the day it was found. `verdict`: the number is the person's own;
   * only whether the target was reached is kept and attested.
   */
  kept: "number" | "fact" | "verdict";
  /** What is read, as the object of "read" or "shown": lower case, no full stop. */
  read: string;
}>;

export const PRIVACY: Readonly<Record<string, ConditionPrivacy>> = {
  "duolingo-daily": { kept: "number", read: "your Duolingo username, profile id and display name, your total XP at each reading, and the attested proof of the reading" },
  "chess-rating": { kept: "number", read: "your Chess.com username and player id, the rating the gift names and how settled it is, at each reading" },
  "chess-tactics": { kept: "number", read: "your Chess.com username and player id, and the best puzzle rating the account ever reached, at each reading" },
  "duolingo-english-test": { kept: "number", read: "the score, the day of the test and the name printed on the certificate page you share" },
  "coursera-certificate": { kept: "fact", read: "the course the certificate names and the day it was issued, on the certificate page you share" },
  "credly-badge": { kept: "fact", read: "the badge, its issuer and the day it was issued, on the badge's public record" },
  "toefl-mybest-shown": { kept: "verdict", read: "your MyBest total score" },
  "university-enrollment-shown": { kept: "verdict", read: "the page of your student portal that says you are enrolled" },
  "university-year-passed-shown": { kept: "verdict", read: "the results page of your student portal, saying the year or the semester is passed, or not" },
  "university-grade-shown": { kept: "verdict", read: "the results page of your student portal, with the grade on the university's own scale" },
  "cambridge-english-shown": { kept: "verdict", read: "your Statement of Results, with the overall score on the Cambridge English Scale" },
  "ielts-shown": { kept: "verdict", read: "your result, with the overall band" },
  "bac-morocco-shown": { kept: "verdict", read: "your result on Bac Digital, passed or not" },
  "bac-cameroon-shown": { kept: "verdict", read: "your result on Epim-Exam, passed or not" },
  "bac-france-shown": { kept: "verdict", read: "your result on Cyclades, passed or not" },
  "udemy-course-shown": { kept: "verdict", read: "the course the gift names, finished or not" },
  "ecoledirecte-grade-shown": { kept: "verdict", read: "the overall average out of 20 on the grades page" },
  "fitbit-daily": { kept: "verdict", read: "yesterday's active minutes, judged against the target each morning" },
};

/** The rule a condition falls under; a condition with no line is a defect the register's test catches. */
export function privacyOf(condition: Pick<Condition, "id">): ConditionPrivacy {
  const line = PRIVACY[condition.id];
  if (!line) throw new Error(`No privacy line for condition ${condition.id}`);
  return line;
}

/** Whether a session on this condition is verified under the verdict rule: the target attested, the number kept nowhere. */
export function verdictOnly(conditionId: string): boolean {
  return PRIVACY[conditionId]?.kept === "verdict";
}

/** The privacy page's sentence for one condition: what is read, who sees it, what is kept, what reaches the public program. */
export function privacyWords(condition: Pick<Condition, "id" | "source" | "nature">): string {
  const line = privacyOf(condition);
  switch (line.kept) {
    case "number":
      return `Read for you from ${condition.source}'s public page: ${line.read}. Kept in our database with each reading, and the number read is written into the public program, where anyone can see it.`;
    case "fact":
      return `Read for you from a public page you share: ${line.read}. Kept in our database with the gift, and the public program receives that it was found, and the day.`;
    case "verdict":
      return `${condition.nature === "connected" ? "Read each morning from the" : "Shown by you, from your own"} ${condition.source} account${condition.nature === "connected" ? " you connected" : ""}: ${line.read}. It is seen once, on your own screen, and by nobody else. Viky keeps neither the number nor the page's answer, only whether what the gift is for was reached, and the public program receives that alone. The person who funds the gift is told that it was reached and knows the target they chose; they do not see the number.`;
  }
}
