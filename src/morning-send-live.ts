import webPush from "web-push";
import { conditionOfGoal } from "./conditions";
import { formatAusd, readGift } from "./gift-reader";
import { loadGift } from "./gift-store";
import type { GiftFacts, PushRefusal, PushSent, TellingDeps } from "./morning-send";
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
  const words = { yesterday: conditionOfGoal(record.goalType)?.words.yesterday };
  try {
    const gift = await readGift(escrowOf(record), giftId);
    return { funder: record.funder, names, words, perDayDisplay: formatAusd(gift.perDay), amountDisplay: formatAusd(gift.amount) };
  } catch {
    // A milestone gift lives on another contract, and a gift of a deployment we do not serve cannot be read at all.
    // The record's own amount is what the funder paid, so the whole-gift sentences stay true; a day's share does not
    // exist on a milestone gift, and its sentences never ask for one.
    const perDay = record.durationDays > 0 ? record.amount / BigInt(record.durationDays) : 0n;
    return { funder: record.funder, names, words, perDayDisplay: formatAusd(perDay), amountDisplay: formatAusd(record.amount) };
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

export function liveTellingDeps(): TellingDeps {
  return {
    subscriptions: async (giftId) => (pushConfigured() ? await subscriptionsForGift(giftId) : []),
    claim: claimTelling,
    forgetEndpoint,
    facts: liveFacts,
    send: sendOne,
  };
}
