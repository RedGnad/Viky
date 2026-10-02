import { conditionById, conditionOfGoal } from "./conditions";
import { figureIn, markOf } from "./currencies";
import { figureInDisplayCurrency, type DisplayCurrency } from "./display-currency";
import { formatAusd } from "./gift-reader";
import { holdsGiftLink, loadGift, type GiftRecord } from "./gift-store";
import { isTheOpeningSecret } from "./v2-opening";
import { isMilestoneGiftId } from "./milestone-protocol";
import { loadMilestoneGift } from "./milestone-store";
import { loadPreferences } from "./preferences-store";
import { previewLine } from "./preview-line";
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
 * The amount is said in the funder's own currency, the one they were reading in when they made the gift, with "about",
 * when the link names them (the founder, 29 Sep and 1 Oct 2026):
 * the person who reads it is the funder's daughter or friend, who most often counts in the same money, and the image
 * is fetched by the messaging app's server, which cannot say what currency its reader counts in. The gift itself is
 * held in dollars, so the figure is a conversion at the day's rate and says so. A link without its key names nobody,
 * so it does not say where the funder lives either: it stays in dollars, as does any gift whose rate cannot be read.
 */

/** `amount` is the figure as the title writes it ("€23.04", "$25.00"), so the picture can set it in the text face. */
export type GiftPreview = Readonly<{ title: string; description: string; amount?: string }>;

/** How the gift's condition was found, so the line under the title can be right about a milestone it cannot read. */
export type PreviewTerms = Readonly<{ milestone?: boolean; conditionId?: string | null }>;

/** The funder's currency and the day's rates, when both could be read. */
export type FunderMoney = Readonly<{ currency: DisplayCurrency; rates: Rates }>;

/**
 * The amount as the title says it: the figure in the funder's currency, said with "about" because the gift is held
 * in dollars, or the exact dollars. Both the figure alone and the words it is said with, so the picture knows which
 * part of the title is the amount whatever its currency.
 */
function amountFor(units: bigint, money: FunderMoney | null): Readonly<{ figure: string; said: string }> {
  const dollars = formatAusd(units);
  if (!money) return { figure: dollars, said: dollars };
  const converted = figureInDisplayCurrency(units, money.currency, money.rates);
  if (!converted.rateDate) return { figure: dollars, said: dollars };
  // In a sentence the sign keeps the space its currency writes it with: "about F CFA 15,086", "about €23.04".
  const figure = `${converted.symbol}${markOf(money.currency).gap}${figureIn(converted.value, money.currency)}`;
  return { figure, said: W.about(figure) };
}

/** The preview of a gift from its record and whether the request holds its link. Pure, so each case is testable. */
export function previewOf(
  record: Pick<GiftRecord, "amount" | "funderName" | "goalType">,
  holdsTheLink: boolean,
  terms: PreviewTerms = {},
  money: FunderMoney | null = null,
): GiftPreview {
  const named = holdsTheLink && record.funderName ? record.funderName : null;
  const amount = named ? amountFor(record.amount, money) : amountFor(record.amount, null);
  const title = named ? W.named(named, amount.said) : W.someone(amount.said);
  const milestone = terms.milestone === true || Boolean(terms.conditionId);
  // A milestone's goal type belongs to another contract's numbering, so it is never asked of the daily register.
  const condition = terms.conditionId ? conditionById(terms.conditionId) : milestone ? undefined : conditionOfGoal(record.goalType);
  return { title, description: previewLine(condition, milestone), amount: amount.figure };
}

/** The preview for a gift number and the key the link carried, or the plain one when the gift cannot be read. */
export async function giftPreview(giftId: string, linkKey: string | null): Promise<GiftPreview> {
  const milestone = isMilestoneGiftId(giftId);
  try {
    const record = await loadGift(giftId);
    if (!record) return { title: W.unknown, description: W.asYouGo };
    const terms = milestone ? await loadMilestoneGift(giftId) : null;
    // A gift's opening secret is not its link's key: sent here, it names nobody (src/v2-opening.ts).
    const holds = !isTheOpeningSecret(record, linkKey) && holdsGiftLink(record, linkKey);
    const money = holds && record.funderName ? await funderMoney(record) : null;
    return previewOf(record, holds, { milestone, conditionId: terms?.conditionId ?? null }, money);
  } catch {
    // A preview never breaks the page: without the database it says no more than the link itself does.
    return { title: W.unknown, description: W.asYouGo };
  }
}

/**
 * The currency the gift speaks, with the day's rates, or nothing: then the title says dollars. It is the currency the
 * funder was reading in when they made the gift, kept on the gift (the founder, 1 Oct 2026); a gift made before that
 * was kept speaks the currency the funder's account reads in today, as every gift did.
 */
async function funderMoney(record: Pick<GiftRecord, "funder" | "funderCurrency">): Promise<FunderMoney | null> {
  const currency = record.funderCurrency ?? (await loadPreferences(record.funder).then((kept) => kept.displayCurrency).catch(() => null));
  if (!currency || currency === "USD") return null;
  const rates = await currentRates().catch(() => undefined);
  return ratesUsable(rates, Date.now()) ? { currency, rates } : null;
}
