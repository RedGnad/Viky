import type { DayOutcome } from "./day-record";
import type { GiftNames } from "./gift-names";
import { MORNING } from "./sentences";

/**
 * The morning message, in words (N1, 17 Sep 2026).
 *
 * Viky asks for one gesture a day from nobody: the recipient does their own thing, and the keeper reads it. So the
 * person only learns what happened by opening the app, which the product promises they never have to do. This is the
 * sentence a phone says instead, once a day for a gift, to whoever asked for it.
 *
 * Browser safe and pure: what to say is decided here, sending is src/morning-send.ts. A name is used only when the
 * gift carries one, and what was done yesterday is the register's word, never a source named in a sentence.
 */

export type MorningSide = "recipient" | "funder";

/** What happened, as the keeper's own record of it says. */
export type MorningNews =
  | Readonly<{ kind: "day"; outcome: DayOutcome; amount: string }>
  | Readonly<{ kind: "reached"; amount: string }>
  | Readonly<{ kind: "expired"; amount: string }>;

export type MorningWords = Readonly<{ yesterday?: string }>;

/** The one sentence this side reads on their phone. */
export function morningSentence(side: MorningSide, news: MorningNews, names: GiftNames, words: MorningWords = {}): string {
  const them = names.recipientName?.trim() || null;
  const funder = names.funderName?.trim() || null;
  if (side === "recipient") {
    if (news.kind === "reached") return MORNING.recipient.reached(news.amount);
    if (news.kind === "expired") return funder ? MORNING.recipient.expiredTo(news.amount, funder) : MORNING.recipient.expired(news.amount);
    if (news.outcome === "earned") return MORNING.recipient.earned(news.amount);
    return funder ? MORNING.recipient.returnedTo(funder) : MORNING.recipient.returned;
  }
  if (news.kind === "reached") return them ? MORNING.funder.reachedNamed(them, news.amount) : MORNING.funder.reached(news.amount);
  if (news.kind === "expired") return MORNING.funder.expired(news.amount);
  if (news.outcome === "returned") return MORNING.funder.returned(news.amount);
  if (them && words.yesterday) return MORNING.funder.didIt(them, words.yesterday, news.amount);
  if (them) return MORNING.funder.countedNamed(them, news.amount);
  return MORNING.funder.counted(news.amount);
}

/** What the push service carries: the title above the sentence, the sentence, and where a press opens. */
export type MorningPayload = Readonly<{ title: string; message: string; url: string }>;

export function morningPayload(giftId: string, side: MorningSide, news: MorningNews, names: GiftNames, words?: MorningWords): MorningPayload {
  return { title: MORNING.title, message: morningSentence(side, news, names, words), url: `/g/${giftId}` };
}

/** What the subject of one telling is called, so a gift is told about a day once and once only. */
export function morningSubject(news: MorningNews, day?: number): string {
  if (news.kind === "day") return `day:${day}`;
  return news.kind;
}

/**
 * What the button on the gift page can do, from what the browser allows. Kept here rather than in the component so
 * the iPhone case is a test rather than a thing to try on a phone.
 *
 * The order matters. An iPhone outside the Home Screen has no PushManager at all, and answering "your browser cannot"
 * would be true and useless: Safari can, once Viky is installed (webkit.org, 16 Feb 2023). So installing is offered
 * before anything is called impossible.
 */
export type MorningStep = "on" | "install" | "unsupported" | "refused" | "ask";

export function morningStep(
  browser: Readonly<{ supported: boolean; onIOS: boolean; standalone: boolean; permission: "default" | "granted" | "denied"; subscribed: boolean }>,
): MorningStep {
  if (browser.subscribed) return "on";
  if (browser.onIOS && !browser.standalone) return "install";
  if (!browser.supported) return "unsupported";
  if (browser.permission === "denied") return "refused";
  return "ask";
}
