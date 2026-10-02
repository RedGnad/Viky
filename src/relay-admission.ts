import { GiftApiError } from "./gift-api";
import { formatAusd } from "./gift-reader";
import { clientIpFromRequest } from "./rate-limit";
import { bucketOf, ceilingSentence, overTheCeiling, RELAY_DAY_ALL, relayCeilings, relayScopes, tooSmallToRelay, topUpScopes, type RelayCeilings, type RelayScope } from "./relay-ceiling";
import { countKey, countRelays, forgetRelayCountsBefore, uncountRelays, type CountRow } from "./relay-ceiling-store";
import { RelayerError } from "./relayer";
import { RELAY_CEILING as W } from "./sentences";

/**
 * The door every relayed request goes through before the relayer is asked to pay (D204). A route calls `admitRelay`
 * once it has checked what it was asked, and `assertNotTooSmall` once it knows the amount and everything the person
 * has. A refusal is a typed error with a sentence for the person, and it costs the relayer nothing.
 *
 * **Counted last** (the review of 2 Oct 2026, R-16). A request is counted only once everything that costs nothing has
 * been checked: the gift exists, the account is the one the action belongs to, the signature is theirs over exactly
 * what is sent, its nonce is the gift's and it has not run out (src/relay-free-checks.ts). Before, a withdrawal was
 * counted first: twenty-five free accounts asking twenty times each for a gift that does not exist used up
 * everybody's count for the day and spent nothing, and nobody could open, end or be paid until midnight UTC.
 *
 * **And only what the relayer pays for stays counted against everybody** (`countedIfSent`). Every relay is run for
 * nothing first, and a call the contract refuses there is never sent: it is taken back out of everybody's count. A
 * creation with a signature that pays for nothing, a send the token would refuse: none of these uses up anybody
 * else's day any more.
 *
 * **The one who asked keeps their own count of it** (the delta re-read of 2 Oct 2026). A refusal took back the
 * account's and the connection's counts too, so attempts the contract refuses had no durable ceiling at all: five
 * hundred in an hour from one account left every count at zero, each one a simulation, some reads and, for a creation,
 * a row. They are held against the account and the connection that made them, by the hour and by the day, as any
 * other action is. When it is the relayer that could not send at all, nothing of the request's own doing, every
 * count is given back.
 *
 * And the ways out keep a part of everybody's count to themselves (`admitWayOut`): opening a gift, ending it, taking
 * out what is earned, the funder taking back, and the way out of the account to a bank.
 */

/**
 * A request that was counted, and the way to take that count back when nothing came of it: out of everybody's count
 * alone when the contract refused the request, out of every count when the relayer itself could not send.
 */
export type Admission = Readonly<{ takeBack: (which?: "everybody's" | "every count") => Promise<void> }>;

const TWO_DAYS_MS = 2 * 86_400_000;

async function admit(scopes: readonly RelayScope[], nowMs: number, code: "RELAY_CEILING" | "TOP_UP_TOO_SOON"): Promise<Admission> {
  const rows: CountRow[] = scopes.map((one) => ({ scope: one.scope, bucket: bucketOf(one.window, nowMs) }));
  const counts = await countRelays(rows);
  const counted = scopes.map((one, index) => ({ ...one, count: counts.get(countKey(rows[index])) ?? 0 }));
  const over = overTheCeiling(counted);
  if (over) {
    await uncountRelays(rows);
    throw new GiftApiError(over.window === "ever" ? "TOP_UPS_FOR_GIFT" : code, ceilingSentence(over, nowMs), 429);
  }
  // The first action of an hour for this account sweeps the rows nothing reads any more.
  if (counted[0]?.count === 1) await forgetRelayCountsBefore(new Date(nowMs - TWO_DAYS_MS));
  let taken = false;
  return {
    takeBack: async (which = "everybody's") => {
      if (taken) return;
      taken = true;
      const back = which === "every count" ? rows : rows.filter((row) => row.scope === RELAY_DAY_ALL);
      if (back.length > 0) await uncountRelays(back);
    },
  };
}

/** Whether a failure is the relayer's own, before it looked at the request: not set, on another chain, under its reserve. */
function relayerCouldNotSend(error: unknown): boolean {
  return error instanceof RelayerError && (error.code === "NOT_CONFIGURED" || error.code === "WRONG_CHAIN" || error.code === "RESERVE_TOO_LOW");
}

/** Whether a failure says the relayer was never asked to pay: refused when run for nothing, or it could not send at all. */
export function nothingWasSent(error: unknown): boolean {
  return error instanceof RelayerError && (error.unsent || error.code === "NOT_CONFIGURED" || error.code === "WRONG_CHAIN" || error.code === "RESERVE_TOO_LOW");
}

/**
 * Runs what a request was counted for, and takes it back out of everybody's count when nothing was sent. The account
 * and the connection keep their own count of a request the contract refused; they are given it back when the relayer
 * itself could not send. The failure goes on to the route as it was: this changes what is counted, never what the
 * person is told.
 */
export async function countedIfSent<T>(admission: Admission, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (nothingWasSent(error)) {
      await admission.takeBack(relayerCouldNotSend(error) ? "every count" : "everybody's").catch((failure: unknown) => console.error(`a relay's count could not be taken back: ${failure instanceof Error ? failure.message : String(failure)}`));
    }
    throw error;
  }
}

/** Counts a relayed action for the account and the connection, or refuses it by name: `RELAY_CEILING`, 429. */
export async function admitRelay(request: Request, account: string, nowMs = Date.now(), ceilings: RelayCeilings = relayCeilings()): Promise<Admission> {
  return admit(relayScopes(account, clientIpFromRequest(request), ceilings), nowMs, "RELAY_CEILING");
}

/**
 * The same door for a way out: opening a gift, ending it, taking out what is earned, the funder taking it back, and
 * the way out of the account to a bank (the founder, 2 Oct 2026). Held against the whole of everybody's count, where
 * anything else stops at the part that is not kept for these. A send to another account and a phone top-up are not
 * ways out to a bank: they are counted like making a gift.
 */
export async function admitWayOut(request: Request, account: string, nowMs = Date.now(), ceilings: RelayCeilings = relayCeilings()): Promise<Admission> {
  return admit(relayScopes(account, clientIpFromRequest(request), ceilings, true), nowMs, "RELAY_CEILING");
}

/**
 * Counts a readying top-up of MON: one a minute for the account and for the connection (`TOP_UP_TOO_SOON`), and a few
 * for the gift, for as long as it lives (`TOP_UPS_FOR_GIFT`), both 429.
 */
export async function admitTopUp(request: Request, account: string, giftId: string, nowMs = Date.now(), ceilings: RelayCeilings = relayCeilings()): Promise<void> {
  await admit(topUpScopes(account, clientIpFromRequest(request), ceilings, giftId), nowMs, "TOP_UP_TOO_SOON");
}

/** How many judge codes one connection may try in a day, whatever the account: several judges may share one. */
export const JUDGE_TRIES_PER_CONNECTION = 10;

/**
 * Counts a try at the judge code for the connection, or refuses it: `JUDGE_TOO_MANY_TRIES`, 429 (the audit of 1 Oct
 * 2026). Five wrong codes lock an account, and an account costs nothing to make: without this, guessing had no ceiling.
 */
export async function admitJudgeTry(request: Request, nowMs = Date.now()): Promise<void> {
  const row: CountRow = { scope: `judge:day:ip:${clientIpFromRequest(request)}`, bucket: bucketOf("day", nowMs) };
  const count = (await countRelays([row])).get(countKey(row)) ?? 0;
  if (count > JUDGE_TRIES_PER_CONNECTION) throw new GiftApiError("JUDGE_TOO_MANY_TRIES", W.judgeTries, 429);
}

/** A relayed send or withdrawal below the smallest amount, unless it is everything there is: `TOO_SMALL_TO_RELAY`, 409. */
export function assertNotTooSmall(kind: "send" | "takeOut", amount: bigint, whole: bigint, ceilings: RelayCeilings = relayCeilings()): void {
  if (!tooSmallToRelay(amount, whole, ceilings.minimumUnits)) return;
  const least = formatAusd(ceilings.minimumUnits);
  throw new GiftApiError("TOO_SMALL_TO_RELAY", kind === "send" ? W.tooSmallToSend(least) : W.tooSmallToTakeOut(least), 409);
}
