import type { SettledDay } from "./day-record";
import type { GiftNames } from "./gift-names";
import { morningPayload, morningSubject, type MorningNews, type MorningSide, type MorningWords } from "./morning-message";
import type { StoredSubscription } from "./push-store";

/**
 * Sending the morning message (N1, 17 Sep 2026).
 *
 * The keeper writes a day's record the moment the contract settles it (src/gift-relay.ts), and that write is the only
 * place a sending starts: what a phone is told is exactly what the record says, never a second judgement about it.
 * A gift is told about a day once, whoever writes the record and however often.
 *
 * Nothing here may make a settled day fail. The money has already moved when this runs, so every refusal is caught and
 * logged: a message that does not leave is a message nobody gets, not a gift in the wrong state.
 *
 * Everything the outside world does is a dependency, so the tests are the real thing minus the network.
 */

export type PushRefusal = Readonly<{ ok: false; gone: boolean }>;
export type PushSent = Readonly<{ ok: true }>;

/** What a gift's sentences need: the two names, what a day is worth, and the register's word for what was done. */
export type GiftFacts = Readonly<{ funder: string; names: GiftNames; perDayDisplay: string; amountDisplay: string; words: MorningWords }>;

export type TellingDeps = Readonly<{
  subscriptions: (giftId: string) => Promise<StoredSubscription[]>;
  claim: (giftId: string, subject: string) => Promise<boolean>;
  forgetEndpoint: (endpoint: string) => Promise<unknown>;
  facts: (giftId: string) => Promise<GiftFacts | null>;
  send: (subscription: StoredSubscription, payload: string) => Promise<PushSent | PushRefusal>;
  log?: (line: string) => void;
}>;

/** Which side of the gift an account is on. Only these two are ever subscribed, so the funder decides it alone. */
function sideOf(account: string, funder: string): MorningSide {
  return account.toLowerCase() === funder.toLowerCase() ? "funder" : "recipient";
}

/**
 * Tells everyone subscribed to a gift about the day just settled. Several days can settle at once when the keeper
 * has been down: the message speaks of the last of them, because that is the one a person wakes up to.
 */
export async function tellAboutDays(giftId: string, days: readonly SettledDay[], deps: TellingDeps): Promise<number> {
  const last = [...days].sort((a, b) => a.day - b.day).at(-1);
  if (!last) return 0;
  return await tell(giftId, { kind: "day", outcome: last.outcome, amount: "" }, deps, last.day);
}

/** Tells everyone subscribed to a gift how its first proof's review was decided, when it did not reach the gift. */
export async function tellAboutReview(giftId: string, verdict: "refused" | "notYet", deps: TellingDeps): Promise<number> {
  return await tell(giftId, { kind: "reviewed", verdict, amount: "" }, deps);
}

/** Tells everyone subscribed to a milestone gift that it was reached, or that its time ran out. */
export async function tellAboutMilestone(giftId: string, kind: "reached" | "expired", deps: TellingDeps): Promise<number> {
  return await tell(giftId, { kind, amount: "" }, deps);
}

async function tell(giftId: string, news: MorningNews, deps: TellingDeps, day?: number): Promise<number> {
  const log = deps.log ?? ((line: string) => console.error(line));
  try {
    const subscriptions = await deps.subscriptions(giftId);
    if (subscriptions.length === 0) return 0;
    const facts = await deps.facts(giftId);
    if (!facts) return 0;
    // Claimed last, and only once there is somebody to tell: a subject burned on a gift nobody listens to would
    // silence the day if a device subscribed a minute later.
    if (!(await deps.claim(giftId, morningSubject(news, day)))) return 0;
    // A day is worth a day's share; a milestone reached or expired moves the whole gift.
    const amount = news.kind === "day" ? facts.perDayDisplay : facts.amountDisplay;
    const told = { ...news, amount } as MorningNews;
    let sent = 0;
    for (const subscription of subscriptions) {
      const payload = morningPayload(giftId, sideOf(subscription.account, facts.funder), told, facts.names, facts.words);
      let result: PushSent | PushRefusal;
      try {
        result = await deps.send(subscription, JSON.stringify(payload));
      } catch (error) {
        log(`morning message refused for gift ${giftId}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (result.ok) {
        sent += 1;
        continue;
      }
      // A push service answering that the browser is gone is the only signal there is: the row goes, at once.
      if (result.gone) await deps.forgetEndpoint(subscription.endpoint);
    }
    return sent;
  } catch (error) {
    log(`morning message not sent for gift ${giftId}: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}
