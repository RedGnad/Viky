import { conditionById, conditionOfGoal, type Condition } from "./conditions";
import { figureIn, markOf } from "./currencies";
import { figureInDisplayCurrency, type DisplayCurrency } from "./display-currency";
import { formatAusd } from "./gift-reader";
import { holdsGiftLink, loadGift, type GiftRecord } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { loadMilestoneGift } from "./milestone-store";
import { loadPreferences } from "./preferences-store";
import { currentRates, ratesUsable, type Rates } from "./rates";
import { LINK_PREVIEW as W } from "./sentences";

/**
 * What a messaging app shows when a gift's link is pasted into it: a title and one line. It is the first thing the
 * person the gift is for sees, before they open anything.
 *
 * The funder's name is printed only when the link carries its key: gift numbers follow each other, so a link without
 * one, or with a wrong one, must never name anybody (D85). The line under the title is the condition's own, from the
 * register. Text only; an image comes with the look.
 *
 * Which condition, and how it is found: a daily gift carries its goal type on the daily contract, and the register
 * holds the same number. A milestone gift lives on a contract of its own whose goal types are numbered from zero
 * again, so the one and the same number means two different conditions across the two contracts (D36, D44). The
 * condition of a milestone gift is therefore read from its own record, never from the number, and gift 1000000 said
 * "A Duolingo lesson each day" under a chess rating until this was so (founder, 18 Sep 2026).
 *
 * The amount is said in the funder's own currency, with "about", when the link names them (the founder, 29 Sep 2026):
 * the person who reads it is the funder's daughter or friend, who most often counts in the same money, and the image
 * is fetched by the messaging app's server, which cannot say what currency its reader counts in. The gift itself is
 * held in dollars, so the figure is a conversion at the day's rate and says so. A link without its key names nobody,
 * so it does not say where the funder lives either: it stays in dollars, as does any gift whose rate cannot be read.
 */

export type GiftPreview = Readonly<{ title: string; description: string }>;

/** How the gift's condition was found, so the line under the title can be right about a milestone it cannot read. */
export type PreviewTerms = Readonly<{ milestone?: boolean; conditionId?: string | null }>;

/** The funder's currency and the day's rates, when both could be read. */
export type FunderMoney = Readonly<{ currency: DisplayCurrency; rates: Rates }>;

/** The amount as the title says it: "about €23.04" in the funder's currency, or the exact dollars. */
function amountFor(units: bigint, money: FunderMoney | null): string {
  if (!money) return formatAusd(units);
  const figure = figureInDisplayCurrency(units, money.currency, money.rates);
  // In a sentence the sign keeps the space its currency writes it with: "about F CFA 15,086", "about €23.04".
  return figure.rateDate ? W.about(`${figure.symbol}${markOf(money.currency).gap}${figureIn(figure.value, money.currency)}`) : formatAusd(units);
}

function lineFor(condition: Condition | undefined, milestone: boolean): string {
  if (condition?.words.preview) return condition.words.preview;
  if (condition) return condition.kind === "milestone" ? W.fromMilestone(condition.name) : W.fromCondition(condition.name);
  return milestone ? W.whenYouReachIt : W.asYouGo;
}

/** The preview of a gift from its record and whether the request holds its link. Pure, so each case is testable. */
export function previewOf(
  record: Pick<GiftRecord, "amount" | "funderName" | "goalType">,
  holdsTheLink: boolean,
  terms: PreviewTerms = {},
  money: FunderMoney | null = null,
): GiftPreview {
  const named = holdsTheLink && record.funderName ? record.funderName : null;
  const title = named ? W.named(named, amountFor(record.amount, money)) : W.someone(formatAusd(record.amount));
  const milestone = terms.milestone === true || Boolean(terms.conditionId);
  // A milestone's goal type belongs to another contract's numbering, so it is never asked of the daily register.
  const condition = terms.conditionId ? conditionById(terms.conditionId) : milestone ? undefined : conditionOfGoal(record.goalType);
  return { title, description: lineFor(condition, milestone) };
}

/** The preview for a gift number and the key the link carried, or the plain one when the gift cannot be read. */
export async function giftPreview(giftId: string, linkKey: string | null): Promise<GiftPreview> {
  const milestone = isMilestoneGiftId(giftId);
  try {
    const record = await loadGift(giftId);
    if (!record) return { title: W.unknown, description: W.asYouGo };
    const terms = milestone ? await loadMilestoneGift(giftId) : null;
    const holds = holdsGiftLink(record, linkKey);
    const money = holds && record.funderName ? await funderMoney(record.funder) : null;
    return previewOf(record, holds, { milestone, conditionId: terms?.conditionId ?? null }, money);
  } catch {
    // A preview never breaks the page: without the database it says no more than the link itself does.
    return { title: W.unknown, description: W.asYouGo };
  }
}

/** The currency the funder chose on their account, with the day's rates, or nothing: then the title says dollars. */
async function funderMoney(funder: string): Promise<FunderMoney | null> {
  const currency = await loadPreferences(funder).then((kept) => kept.displayCurrency).catch(() => null);
  if (!currency || currency === "USD") return null;
  const rates = await currentRates().catch(() => undefined);
  return ratesUsable(rates, Date.now()) ? { currency, rates } : null;
}
