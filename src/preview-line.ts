import type { Condition } from "./conditions";
import { LINK_PREVIEW as W } from "./sentences";

/**
 * What a gift is, in the one line a link carries under its title: the condition's own from the register, or the
 * plain one where the condition could not be read. Browser safe: the link's preview says it on the server, and the
 * words a funder shares the link with say the same thing (the founder, 1 Oct 2026).
 */
export function previewLine(condition: Condition | undefined, milestone: boolean): string {
  if (condition?.words.preview) return condition.words.preview;
  if (condition) return condition.kind === "milestone" ? W.fromMilestone(condition.name) : W.fromCondition(condition.name);
  return milestone ? W.whenYouReachIt : W.asYouGo;
}

/**
 * The words a link is shared with: who, how much in the giver's own currency, what it is; the link follows them. The
 * same sentence the link's own title says, so the message and its preview never disagree.
 */
export function sharedWith(giver: string | null | undefined, amount: string, what: string): string {
  const who = giver?.trim();
  return `${who ? W.named(who, amount) : W.unnamedShare(amount)}. ${what}`;
}
