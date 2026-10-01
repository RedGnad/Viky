import webPush from "web-push";
import { conditionOfGoal } from "./conditions";
import { ledAmount, spokenAmount } from "./display-currency";
import { formatAusd, readGift } from "./gift-reader";
import { loadGift } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { loadPreferences } from "./preferences-store";
import { currentRates, ratesUsable } from "./rates";
import { tellAboutMilestone, type GiftFacts, type PushRefusal, type PushSent, type TellingDeps } from "./morning-send";
import { forgetEndpoint, subscriptionsForGift, claimTelling } from "./push-store";
import { escrowOf } from "./relayer";

/**
 * The morning message against the real world: the gift read from its own contract, and the push services of the
 * browsers that asked to be told.
 *
 * The amounts in the sentence are the contract's own: a day's share and the gift's total are read back, never
 * recomputed from the record, so the sentence is true of the money that moved.
 */

/** Configured when the three keys are in the environment; nothing is sent, and nothing fails, when they are not. */
export function pushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim() && env.WEB_PUSH_PRIVATE_KEY?.trim() && env.WEB_PUSH_EMAIL?.trim());
}

function vapid(env: NodeJS.ProcessEnv = process.env): void {
  webPush.setVapidDetails(`mailto:${env.WEB_PUSH_EMAIL?.trim()}`, String(env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim()), String(env.WEB_PUSH_PRIVATE_KEY?.trim()));
}

/** The gift's words and amounts, or nothing when this deployment cannot read the gift. */
export async function liveFacts(giftId: string): Promise<GiftFacts | null> {
  const record = await loadGift(giftId);
  if (!record) return null;
  const names = { recipientName: record.recipientName, funderName: record.funderName };
  // The daily register is asked by the goal type, which only the daily contract numbers: a milestone gift's own
  // number means something else there, and no milestone sentence carries a word for yesterday anyway.
  const words = { yesterday: isMilestoneGiftId(giftId) ? undefined : conditionOfGoal(record.goalType)?.words.yesterday };
  try {
    const gift = await readGift(escrowOf(record), giftId);
    return { funder: record.funder, names, words, perDayDisplay: formatAusd(gift.perDay), amountDisplay: formatAusd(gift.amount), perDayUnits: gift.perDay, amountUnits: gift.amount };
  } catch {
    // A milestone gift lives on another contract, and a gift of a deployment we do not serve cannot be read at all.
    // The record's own amount is what the funder paid, so the whole-gift sentences stay true; a day's share does not
    // exist on a milestone gift, and its sentences never ask for one.
    const perDay = record.durationDays > 0 ? record.amount / BigInt(record.durationDays) : 0n;
    return { funder: record.funder, names, words, perDayDisplay: formatAusd(perDay), amountDisplay: formatAusd(record.amount), perDayUnits: perDay, amountUnits: record.amount };
  }
}

async function sendOne(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string): Promise<PushSent | PushRefusal> {
  vapid();
  try {
    await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
    return { ok: true };
  } catch (error) {
    // 404 and 410 are the push services' way of saying this browser is gone for good; anything else may be temporary.
    const status = error instanceof webPush.WebPushError ? error.statusCode : 0;
    return { ok: false, gone: status === 404 || status === 410 };
  }
}

/**
 * An amount in the currency an account reads in, "about" when it is a conversion, or the exact dollars: when the
 * account keeps no currency, keeps the dollar, or the day's rate cannot be read.
 */
export async function spokenFor(account: string, units: bigint): Promise<string> {
  const currency = await loadPreferences(account).then((kept) => kept.displayCurrency).catch(() => null);
  if (!currency || currency === "USD") return formatAusd(units);
  const rates = await currentRates().catch(() => undefined);
  return spokenAmount(ledAmount(units, currency, ratesUsable(rates, Date.now()) ? rates : undefined));
}

export function liveTellingDeps(): TellingDeps {
  return {
    speak: spokenFor,
    subscriptions: async (giftId) => (pushConfigured() ? await subscriptionsForGift(giftId) : []),
    claim: claimTelling,
    forgetEndpoint,
    facts: liveFacts,
    send: sendOne,
  };
}

/**
 * Tells a milestone gift's subscribers that it was reached, from the request that reached it (the founder, 1 Oct 2026).
 *
 * A gift had or not is reached by its own person showing or pasting what proves it, and none of those requests told
 * anybody: only the passes and the reading on opening did, which never reach such a gift. A funder offered "Get a
 * message when it is theirs" would have heard nothing. Told once whoever tells (`claimTelling`), and never a reason
 * for the request to fail: the money has moved by then.
 */
export async function tellReached(giftId: string): Promise<void> {
  await tellAboutMilestone(giftId, "reached", liveTellingDeps()).catch(() => 0);
}
