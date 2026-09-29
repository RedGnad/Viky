import { conditionById, type Condition } from "./conditions";

/**
 * What a recipient's yes covers, by condition (the founder, 29 Sep 2026): what Viky reads, field by field, what the
 * person who offered the gift sees of it, and the short name the stop line and the funder's line use. Browser safe.
 *
 * Every source is named by the register (`condition.source`), never here. For Fitbit and Strava the words are their
 * own consent pane's (`link.consent`), the one the person already reads before they connect. Every other line says the
 * fields the reading takes and no more, so the text a person signs is the reading, not a summary of it.
 */

export type Voice = "yours" | "theirs";

export type ConsentTerms = Readonly<{
  /** What Viky reads for this gift, and nothing else: "your rapid rating on Chess.com, each time it is read". */
  reads: string;
  /** What the person who offered the gift sees of it. */
  funderSees: string;
  /** The short name of it, for the stop line and the funder's line: "your rapid rating". */
  what: string;
}>;

const your = (voice: Voice) => (voice === "yours" ? "your" : "their");

type Terms = (source: string, voice: Voice, cadence: string) => ConsentTerms;

const byCondition: Readonly<Record<string, Terms>> = {
  "university-enrollment-shown": (_, v) => ({
    reads: `whether ${your(v)} own student portal says ${v === "yours" ? "you are" : "they are"} enrolled this academic year: yes or no, from the page ${v === "yours" ? "you open" : "they open"} and nothing else on it`,
    funderSees: "yes or no",
    what: `${your(v)} enrolment`,
  }),
  "university-year-passed-shown": (_, v) => ({
    reads: `whether ${your(v)} own student portal says the year is passed: yes or no, from the page ${v === "yours" ? "you open" : "they open"} and nothing else on it`,
    funderSees: "yes or no",
    what: `${your(v)} year's result`,
  }),
  "university-grade-shown": (_, v) => ({
    reads: `${your(v)} overall grade on ${your(v)} own student portal, from the page ${v === "yours" ? "you open" : "they open"} and nothing else on it`,
    funderSees: "whether the grade reaches the target, and the grade",
    what: `${your(v)} grade`,
  }),
  "toefl-mybest-shown": (source, v) => ({
    reads: `${your(v)} score from ${source}, shown from ${your(v)} own account, and nothing else on it`,
    funderSees: "whether the score reaches the target, and the score",
    what: `${your(v)} score`,
  }),
  "duolingo-english-test": (source, v) => ({
    reads: `the ${source} certificate page ${v === "yours" ? "you share" : "they share"}: the score, the day of the test and the name printed on it`,
    funderSees: "whether the score reaches the target, and the score",
    what: `${your(v)} certificate`,
  }),
  "duolingo-daily": (source, v) => ({
    reads: `${your(v)} lessons on ${source}, each day, from ${your(v)} public profile: whether the day has one`,
    funderSees: "for each day, whether it counted",
    what: `${your(v)} lessons`,
  }),
  "codeforces-rating": (source, v) => ({
    reads: `${your(v)} rating on ${source}, from ${your(v)} public profile, each time it is read`,
    funderSees: "the rating read, and whether it reaches the target",
    what: `${your(v)} rating`,
  }),
  "chess-rating": (source, v, cadence) => ({
    reads: `${your(v)} ${cadence ? `${cadence} ` : ""}rating on ${source}, from ${your(v)} public profile, each time it is read`,
    funderSees: "the rating read, and whether it reaches the target",
    what: `${your(v)} ${cadence ? `${cadence} ` : ""}rating`,
  }),
  "chess-tactics": (source, v) => ({
    reads: `${your(v)} puzzle rating on ${source}, from ${your(v)} public profile, each time it is read`,
    funderSees: "the rating read, and whether it reaches the target",
    what: `${your(v)} puzzle rating`,
  }),
  "wca-time": (source, v) => ({
    reads: `${your(v)} results at the competition named in this gift, on ${source}'s public results: the event and the time`,
    funderSees: "whether the time reaches the target, and the time",
    what: `${your(v)} results`,
  }),
  "marathon-finish": (_, v) => ({
    reads: `${your(v)} finish at the race named in this gift, on its official results: the distance and whether it was finished`,
    funderSees: "whether it was finished",
    what: `${your(v)} race result`,
  }),
};

/** A certificate read from a page the person shares: the fields its line reads, the same for every such source. */
const certificate: Terms = (source, v) => ({
  reads: `the ${source} certificate page ${v === "yours" ? "you share" : "they share"}: the course or certification, the day it was granted and the name printed on it`,
  funderSees: "whether it is the certificate the gift is for",
  what: `${your(v)} certificate`,
});

/** A connected source reads what its own consent pane says, in its own words. */
function connected(condition: Condition, voice: Voice): ConsentTerms | null {
  if (condition.link.kind !== "connect") return null;
  const pane = condition.link.consent;
  // The pane speaks to the person connecting; said to the funder, "you" and "your" are theirs.
  const said = (text: string) =>
    voice === "yours" ? text : text.replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their").replace(/\byou\b/g, "they").replace(/\bYou\b/g, "They");
  return {
    reads: said(pane.sees),
    funderSees: said(pane.never),
    what: voice === "yours" ? `your ${condition.source}` : `their ${condition.source}`,
  };
}

/** What a yes covers for this condition, or nothing for a condition Viky does not read. */
export function consentTermsFor(conditionId: string, voice: Voice = "yours", cadence = ""): ConsentTerms | null {
  const condition = conditionById(conditionId);
  if (!condition) return null;
  const own = connected(condition, voice);
  if (own) return own;
  const terms = byCondition[conditionId] ?? (condition.link.kind === "link" ? certificate : undefined);
  return terms ? terms(condition.source, voice, cadence) : null;
}
