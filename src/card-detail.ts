import { conditionById } from "./conditions";
import type { GiftDraft } from "./gift-draft";
import { certificateById, milestoneById } from "./milestone-conditions";
import { OFFER } from "./sentences";

/**
 * The line the card carries under the condition, and what it says (D136).
 *
 * Every condition the register gives a detail to has one, and pressing it opens that condition's own questions.
 * Before this, the only way in was to press the condition again inside the catalogue, which nobody found: on Duolingo
 * the funder could not name the account, choose the course or set the bar for a day, while on Coursera the same
 * gesture worked, because a certificate's questions are what the sheet opens on. One gesture, one result, on all six.
 *
 * What it says is what has been answered, in the register's own words, and never a summary of ours. When nothing has
 * been answered it says so rather than disappearing: on a daily condition that is the register's own sentence about
 * a name nobody gave, because leaving it empty is a real answer (D27).
 */
export type CardDetail = Readonly<{ title: string; said: string; answered: boolean }>;

export function cardDetail(draft: GiftDraft): CardDetail | undefined {
  const condition = conditionById(draft.conditionId);
  if (!condition) return undefined;
  const certificate = certificateById(draft.conditionId);
  const milestone = milestoneById(draft.conditionId);
  const title = condition.detailTitle ?? certificate?.words.detailQuestion;
  if (!title) return undefined;
  const subject = draft.subject.trim();
  const daily = !certificate && !milestone;
  const said: string[] = [];
  // On a daily condition the name is optional (D27), so the line says whose account will be read or, when nobody has
  // said, the register's own sentence about a recipient naming their own. It never falls silent.
  if (subject.length > 0) said.push(subject);
  else if (daily && condition.link.kind === "username") said.push(condition.link.noneGiven);
  if (draft.courseTitle && draft.courseTitle.trim().length > 0) said.push(draft.courseTitle.trim());
  else if (daily && condition.course && subject.length > 0) said.push(condition.course.wholeProfile);
  const target = draft.target.trim();
  const number = Number(target);
  if (target.length > 0 && Number.isFinite(number)) {
    // In the register's own words wherever it has them: a daily bar says "10 XP a day", a climb and a certificate
    // carry the label of what is being reached, so the figure is said under it.
    if (condition.target) said.push(condition.target.inWords(number));
    else if (milestone) said.push(`${milestone.words.targetLabel}: ${target}`);
    else if (certificate) said.push(certificate.words.goal(number));
  }
  if (said.length > 0) return { title, said: said.join(" · "), answered: true };
  // Nothing given. A daily condition has the register's own sentence for it, because an empty name is an answer
  // there; a climb and a certificate have questions that must be answered, so the line says it is not filled in.
  const noneGiven = !certificate && !milestone && condition.link.kind === "username" ? condition.link.noneGiven : undefined;
  return { title, said: noneGiven ?? OFFER.detailNeeded, answered: false };
}
