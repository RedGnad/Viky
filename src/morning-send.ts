import type { SettledDay } from "./day-record";
import type { GiftNames } from "./gift-names";
import { morningPayload, morningSubject, type MorningNews, type MorningSide, type MorningWords } from "./morning-message";
import { passNote } from "./pass-notes";
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

/** A sending the push service did not take: what it answered (0 when it never answered), and whether the browser is gone. */
export type PushRefusal = Readonly<{ ok: false; gone: boolean; status?: number }>;
export type PushSent = Readonly<{ ok: true }>;

/** What a gift's sentences need: the two names, what a day is worth, and the register's word for what was done. */
export type GiftFacts = Readonly<{
  funder: string;
  names: GiftNames;
  perDayDisplay: string;
  amountDisplay: string;
  /** The same two amounts in the coin's units, so each person can be told in the currency their account reads in. */
  perDayUnits?: bigint;
  amountUnits?: bigint;
  words: MorningWords;
}>;

export type TellingDeps = Readonly<{
  subscriptions: (giftId: string) => Promise<StoredSubscription[]>;
  claim: (giftId: string, subject: string) => Promise<boolean>;
  forgetEndpoint: (endpoint: string) => Promise<unknown>;
  facts: (giftId: string) => Promise<GiftFacts | null>;
  send: (subscription: StoredSubscription, payload: string) => Promise<PushSent | PushRefusal>;
  /**
   * An amount as this account reads money: "about €3.05" in the currency the account keeps, or the exact dollars. A
   * message sent outside the app speaks the account's currency, as the app does (the founder, 1 Oct 2026).
   */
  speak?: (account: string, units: bigint) => Promise<string>;
  log?: (line: string) => void;
}>;

/** Which side of the gift an account is on. Only these two are ever subscribed, so the funder decides it alone. */
function sideOf(account: string, funder: string): MorningSide {
  return account.toLowerCase() === funder.toLowerCase() ? "funder" : "recipient";
}

/**
 * Tells everyone subscribed to a gift about the day just settled. Several days can settle at once when the keeper
 * has been down, or when one reading catches up yesterday and pays today: the message speaks of the last of them.
 */
export async function tellAboutDays(giftId: string, days: readonly SettledDay[], deps: TellingDeps, nowMs: number = Date.now()): Promise<number> {
  const last = [...days].sort((a, b) => a.day - b.day).at(-1);
  if (!last) return 0;
  // A day counted the day it was done says "today": the third daily contract pays a day by a reading of that day.
  const today = last.outcome === "earned" && last.day === Math.floor(nowMs / 86_400_000);
  return await tell(giftId, { kind: "day", outcome: last.outcome, amount: "", ...(today ? { today } : {}) }, deps, last.day);
}

/**
 * Tells everyone subscribed to a gift how its first proof's review was closed, when it did not reach the gift:
 * decided by the operator, or never made before the contract stopped taking the proof (`unread`).
 */
export async function tellAboutReview(giftId: string, verdict: "refused" | "notYet" | "unread", deps: TellingDeps): Promise<number> {
  return await tell(giftId, { kind: "reviewed", verdict, amount: "" }, deps);
}

/** Tells everyone subscribed to a milestone gift that it was reached, or that its time ran out. */
export async function tellAboutMilestone(giftId: string, kind: "reached" | "expired", deps: TellingDeps): Promise<number> {
  return await tell(giftId, { kind, amount: "" }, deps);
}

/** Why a push service did not take a message, for the operator: its own status, and what was done about it. */
function refusalInWords(refusal: PushRefusal): string {
  if (refusal.gone) return `the push service answered ${refusal.status ?? "gone"}, that browser no longer listens and is forgotten`;
  return refusal.status ? `the push service answered ${refusal.status}` : "the push service did not answer";
}

async function tell(giftId: string, news: MorningNews, deps: TellingDeps, day?: number): Promise<number> {
  // Every refusal is a line in the logs and a note in the pass under way (src/pass-notes.ts): a message that did not
  // leave used to leave nothing behind unless the sending itself threw (the audit of 1 Oct 2026).
  const say = deps.log ?? ((line: string) => console.error(line));
  const log = (line: string) => {
    say(line);
    passNote(line);
  };
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
    const units = news.kind === "day" ? facts.perDayUnits : facts.amountUnits;
    let sent = 0;
    for (const subscription of subscriptions) {
      // Each person is told in the currency their own account reads in; the exact dollars when that cannot be said.
      const spoken = deps.speak && units !== undefined ? await deps.speak(subscription.account, units).catch(() => amount) : amount;
      const told = { ...news, amount: spoken } as MorningNews;
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
      log(`morning message refused for gift ${giftId}: ${refusalInWords(result)}`);
      // A push service answering that the browser is gone is the only signal there is: the row goes, at once.
      if (result.gone) await deps.forgetEndpoint(subscription.endpoint);
    }
    return sent;
  } catch (error) {
    log(`morning message not sent for gift ${giftId}: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}
