import { conditionOfGoal } from "./conditions";
import { formatAusd } from "./gift-reader";
import { holdsGiftLink, loadGift, type GiftRecord } from "./gift-store";
import { LINK_PREVIEW as W } from "./sentences";

/**
 * What a messaging app shows when a gift's link is pasted into it: a title and one line. It is the first thing the
 * person the gift is for sees, before they open anything.
 *
 * The funder's name is printed only when the link carries its key: gift numbers follow each other, so a link without
 * one, or with a wrong one, must never name anybody (D85). The line under the title is the condition's own, from the
 * register. Text only; an image comes with the look.
 */

export type GiftPreview = Readonly<{ title: string; description: string }>;

/** The preview of a gift from its record and whether the request holds its link. Pure, so each case is testable. */
export function previewOf(record: Pick<GiftRecord, "amount" | "funderName" | "goalType">, holdsTheLink: boolean): GiftPreview {
  const amount = formatAusd(record.amount);
  const title = holdsTheLink && record.funderName ? W.named(record.funderName, amount) : W.someone(amount);
  const condition = conditionOfGoal(record.goalType);
  const description = condition?.words.preview ?? (condition ? W.fromCondition(condition.name) : W.asYouGo);
  return { title, description };
}

/** The preview for a gift number and the key the link carried, or the plain one when the gift cannot be read. */
export async function giftPreview(giftId: string, linkKey: string | null): Promise<GiftPreview> {
  try {
    const record = await loadGift(giftId);
    if (!record) return { title: W.unknown, description: W.asYouGo };
    return previewOf(record, holdsGiftLink(record, linkKey));
  } catch {
    // A preview never breaks the page: without the database it says no more than the link itself does.
    return { title: W.unknown, description: W.asYouGo };
  }
}
