import { GiftApiError } from "./gift-api";
import { clientIpFromRequest } from "./rate-limit";
import { bucketOf } from "./relay-ceiling";
import { countKey, countRelays, uncountRelays, type CountRow } from "./relay-ceiling-store";

/**
 * The attested readings of a paced platform (race result, MikaTiming) one account, or one connection, may ask for in a
 * UTC day (the money path audit of 27 Sep 2026). The reading service keeps four hundred a day for everybody together;
 * without these, one account could spend them all. Counted in the database like the relay ceilings (D204), so every
 * server counts the same readings, and a refused one is taken back out.
 */
export const PACED_READINGS_PER_DAY = Object.freeze({ account: 10, connection: 30 });

export const READING_CEILING_SENTENCE = {
  account: "That is as many results as Viky reads for one account in a day. Try again tomorrow.",
  connection: "That is as many results as Viky reads for one connection in a day. Try again tomorrow.",
} as const;

/** Counts one paced reading for the account and the connection, or refuses it by name: `READING_CEILING`, 429. */
export async function admitPacedReading(request: Request, account: string, nowMs = Date.now()): Promise<void> {
  const bucket = bucketOf("day", nowMs);
  const rows: CountRow[] = [
    { scope: `paced-reading:day:account:${account.toLowerCase()}`, bucket },
    { scope: `paced-reading:day:ip:${clientIpFromRequest(request)}`, bucket },
  ];
  const counts = await countRelays(rows);
  const mine = counts.get(countKey(rows[0])) ?? 0;
  const theirs = counts.get(countKey(rows[1])) ?? 0;
  if (mine <= PACED_READINGS_PER_DAY.account && theirs <= PACED_READINGS_PER_DAY.connection) return;
  await uncountRelays(rows);
  throw new GiftApiError("READING_CEILING", mine > PACED_READINGS_PER_DAY.account ? READING_CEILING_SENTENCE.account : READING_CEILING_SENTENCE.connection, 429);
}
