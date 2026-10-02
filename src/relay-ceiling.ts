import { RELAY_CEILING as W } from "./sentences";

/**
 * The ceilings on what the relayer pays for (D204, from finding 2 of the money path review of 23 Sep 2026).
 *
 * Every relayed action costs the relayer MON, and nothing bounded how often one account or one connection could make
 * it pay: below its reserve, nobody can be paid and no day is counted. So: per account and per connection, a number
 * of relayed actions per hour and per day; a smallest amount a relayed send or withdrawal may carry, unless it is
 * everything the person has, so that small money is never locked; and one readying top-up per minute on the cancel
 * route. The daily pass and the keeper's claims never go through these: they are the operator's own, not a request.
 *
 * The numbers are the founder's defaults and read from the environment when it names others.
 */
export type RelayCeilings = Readonly<{ perHour: number; perDay: number; minimumUnits: bigint; topUpsPerMinute: number; topUpsPerGift: number; perDayAll: number; reservedForWaysOut: number }>;

// Two top-ups a gift, for as long as it lives (the money path audit of 27 Sep 2026): a fee that rose between the
// answer and the send may be readied once more, and a funder who sweeps the MON out cannot be readied in a loop.
//
// And one count for everybody together (the audit of 1 Oct 2026): the ceilings above are each account's and each
// connection's, so many accounts on many connections had no ceiling at all, and what they cost is one relayer's coin.
// Five hundred a day: a credited day costs the relayer about 0.018 of it (measured 1 Oct 2026) and a gift's creation
// several times that, so a day at this ceiling costs it under thirty, which it holds above its reserve.
//
// A part of that one count is kept for the ways out of a gift (the review of 2 Oct 2026, R-16): opening it, ending it,
// taking out what is earned, and the funder taking back a gift nobody opened. Everything else, making a gift, counting
// a day, writing an agreement down, is refused once the count reaches what is not kept. So a day in which everybody's
// count is used up still opens, ends and pays out. A hundred of the five hundred.
export const DEFAULT_RELAY_CEILINGS: RelayCeilings = { perHour: 20, perDay: 100, minimumUnits: 1_000_000n, topUpsPerMinute: 1, topUpsPerGift: 2, perDayAll: 500, reservedForWaysOut: 100 };

const wholeNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value?.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** `RELAY_PER_HOUR`, `RELAY_PER_DAY`, `RELAY_MINIMUM_CENTS` (100 is one dollar), `TOP_UPS_PER_MINUTE`, `TOP_UPS_PER_GIFT`, `RELAY_PER_DAY_ALL`, `RELAY_RESERVED_FOR_WAYS_OUT`. */
export function relayCeilings(env: Readonly<Record<string, string | undefined>> = process.env): RelayCeilings {
  const perDayAll = wholeNumber(env.RELAY_PER_DAY_ALL, DEFAULT_RELAY_CEILINGS.perDayAll);
  return {
    // Never more than half of everybody's count: a reserve that took it all would leave nothing to make a gift with.
    reservedForWaysOut: Math.min(wholeNumber(env.RELAY_RESERVED_FOR_WAYS_OUT, DEFAULT_RELAY_CEILINGS.reservedForWaysOut), Math.floor(perDayAll / 2)),
    perHour: wholeNumber(env.RELAY_PER_HOUR, DEFAULT_RELAY_CEILINGS.perHour),
    perDay: wholeNumber(env.RELAY_PER_DAY, DEFAULT_RELAY_CEILINGS.perDay),
    minimumUnits: BigInt(wholeNumber(env.RELAY_MINIMUM_CENTS, Number(DEFAULT_RELAY_CEILINGS.minimumUnits / 10_000n))) * 10_000n,
    topUpsPerMinute: wholeNumber(env.TOP_UPS_PER_MINUTE, DEFAULT_RELAY_CEILINGS.topUpsPerMinute),
    topUpsPerGift: wholeNumber(env.TOP_UPS_PER_GIFT, DEFAULT_RELAY_CEILINGS.topUpsPerGift),
    perDayAll,
  };
}

export type RelayWindow = "minute" | "hour" | "day" | "ever";

const LENGTH_MS: Record<Exclude<RelayWindow, "ever">, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/** The one bucket of a count that never ends, dated where the sweep of old windows never reaches it. */
const EVER = new Date("9999-12-31T00:00:00Z");

/** The start of the window the moment falls in, in UTC: every server counts in the same buckets. */
export function bucketOf(window: RelayWindow, nowMs: number): Date {
  if (window === "ever") return EVER;
  return new Date(Math.floor(nowMs / LENGTH_MS[window]) * LENGTH_MS[window]);
}

export function windowEndsMs(window: Exclude<RelayWindow, "ever">, nowMs: number): number {
  return bucketOf(window, nowMs).getTime() + LENGTH_MS[window];
}

export const minutesUntil = (window: Exclude<RelayWindow, "ever">, nowMs: number): number => Math.max(1, Math.ceil((windowEndsMs(window, nowMs) - nowMs) / 60_000));

export type RelayScope = Readonly<{ scope: string; window: RelayWindow; limit: number; who: "account" | "connection" | "gift" | "everybody" }>;

/** The one count every relayed action of a day is held against, whoever asks. */
export const RELAY_DAY_ALL = "relay:day:all";

/**
 * The five counts a relayed action is held against: the account and the connection, each by the hour and by the day,
 * and everybody together by the day. A way out of a gift is held against the whole of everybody's count; anything else
 * against the part that is not kept for the ways out.
 */
export function relayScopes(account: string, ip: string, ceilings: RelayCeilings, wayOut = false): readonly RelayScope[] {
  const who = account.toLowerCase();
  const everybody = wayOut ? ceilings.perDayAll : ceilings.perDayAll - ceilings.reservedForWaysOut;
  return [
    { scope: `relay:hour:account:${who}`, window: "hour", limit: ceilings.perHour, who: "account" },
    { scope: `relay:day:account:${who}`, window: "day", limit: ceilings.perDay, who: "account" },
    { scope: `relay:hour:ip:${ip}`, window: "hour", limit: ceilings.perHour, who: "connection" },
    { scope: `relay:day:ip:${ip}`, window: "day", limit: ceilings.perDay, who: "connection" },
    { scope: RELAY_DAY_ALL, window: "day", limit: everybody, who: "everybody" },
  ];
}

/**
 * The counts a readying top-up is held against: one a minute for the account, one a minute for the connection, and a
 * few for the gift being cancelled, for as long as it lives.
 */
export function topUpScopes(account: string, ip: string, ceilings: RelayCeilings, giftId: string): readonly RelayScope[] {
  return [
    { scope: `topup:minute:account:${account.toLowerCase()}`, window: "minute", limit: ceilings.topUpsPerMinute, who: "account" },
    { scope: `topup:minute:ip:${ip}`, window: "minute", limit: ceilings.topUpsPerMinute, who: "connection" },
    { scope: `topup:gift:${giftId}`, window: "ever", limit: ceilings.topUpsPerGift, who: "gift" },
  ];
}

export type Counted = RelayScope & Readonly<{ count: number }>;

/** The first count over its ceiling, once this action has been counted, or nothing when all are within theirs. */
export function overTheCeiling(counted: readonly Counted[]): Counted | undefined {
  return counted.find((one) => one.count > one.limit);
}

export function ceilingSentence(over: Counted, nowMs: number): string {
  if (over.who === "everybody") return W.dayAll;
  if (over.window === "day") return W.day(over.who === "gift" ? "account" : over.who);
  if (over.window === "minute") return W.topUpTooSoon;
  if (over.window === "ever") return W.topUpsForGift;
  return W.hour(over.who === "gift" ? "account" : over.who, minutesUntil("hour", nowMs));
}

/** Below the smallest amount, unless it is everything there is: small money is never locked, and dust is never relayed. */
export function tooSmallToRelay(amount: bigint, whole: bigint, minimumUnits: bigint): boolean {
  return amount < minimumUnits && amount !== whole;
}
