import { GiftApiError } from "./gift-api";
import { formatAusd } from "./gift-reader";
import { clientIpFromRequest } from "./rate-limit";
import { bucketOf, ceilingSentence, overTheCeiling, relayCeilings, relayScopes, tooSmallToRelay, topUpScopes, type RelayCeilings, type RelayScope } from "./relay-ceiling";
import { countKey, countRelays, forgetRelayCountsBefore, uncountRelays, type CountRow } from "./relay-ceiling-store";
import { RELAY_CEILING as W } from "./sentences";

/**
 * The door every relayed request goes through before the relayer is asked to pay (D204). A route calls `admitRelay`
 * once it has checked what it was asked, and `assertNotTooSmall` once it knows the amount and everything the person
 * has. A refusal is a typed error with a sentence for the person, and it costs the relayer nothing.
 */

const TWO_DAYS_MS = 2 * 86_400_000;

async function admit(scopes: readonly RelayScope[], nowMs: number, code: "RELAY_CEILING" | "TOP_UP_TOO_SOON"): Promise<void> {
  const rows: CountRow[] = scopes.map((one) => ({ scope: one.scope, bucket: bucketOf(one.window, nowMs) }));
  const counts = await countRelays(rows);
  const counted = scopes.map((one, index) => ({ ...one, count: counts.get(countKey(rows[index])) ?? 0 }));
  const over = overTheCeiling(counted);
  if (over) {
    await uncountRelays(rows);
    throw new GiftApiError(code, ceilingSentence(over, nowMs), 429);
  }
  // The first action of an hour for this account sweeps the rows nothing reads any more.
  if (counted[0]?.count === 1) await forgetRelayCountsBefore(new Date(nowMs - TWO_DAYS_MS));
}

/** Counts a relayed action for the account and the connection, or refuses it by name: `RELAY_CEILING`, 429. */
export async function admitRelay(request: Request, account: string, nowMs = Date.now(), ceilings: RelayCeilings = relayCeilings()): Promise<void> {
  await admit(relayScopes(account, clientIpFromRequest(request), ceilings), nowMs, "RELAY_CEILING");
}

/** Counts a readying top-up of MON, one a minute for the account and for the connection: `TOP_UP_TOO_SOON`, 429. */
export async function admitTopUp(request: Request, account: string, nowMs = Date.now(), ceilings: RelayCeilings = relayCeilings()): Promise<void> {
  await admit(topUpScopes(account, clientIpFromRequest(request), ceilings), nowMs, "TOP_UP_TOO_SOON");
}

/** A relayed send or withdrawal below the smallest amount, unless it is everything there is: `TOO_SMALL_TO_RELAY`, 409. */
export function assertNotTooSmall(kind: "send" | "takeOut", amount: bigint, whole: bigint, ceilings: RelayCeilings = relayCeilings()): void {
  if (!tooSmallToRelay(amount, whole, ceilings.minimumUnits)) return;
  const least = formatAusd(ceilings.minimumUnits);
  throw new GiftApiError("TOO_SMALL_TO_RELAY", kind === "send" ? W.tooSmallToSend(least) : W.tooSmallToTakeOut(least), 409);
}
