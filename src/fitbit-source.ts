import type { AttestedSource } from "./attested-sources";

/**
 * Fitbit's daily activity summary for one day, read with the person's own key (D188): "Get Daily Activity Summary",
 * `GET /1/user/[user-id]/activities/date/[date].json`, scope `activity`, the user `-` being the key's own (Fitbit's
 * Web API reference, read 23 Sep 2026). The account a caller names is the day, `yyyy-MM-dd`; the key is not an
 * account and never travels as one. What must match: the fairly and very active minutes, which the day's verdict is
 * judged on, and the steps, which a later line may be. Nothing of the answer is kept once judged.
 *
 * Why it lives here and not in `src/attested-sources.ts`: that file is one of the two the reading fingerprint hashes,
 * and the reading service runs its own copy of it. Adding a source there changes `READING_FINGERPRINT`, and until the
 * founder redeploys the service from that commit every attested read of the app refuses (`WORKER_OUT_OF_DATE`): the
 * Chess.com ratings and the certificate readings included. So this source waits in a file the fingerprint does not
 * cover, known to the app and not to the service; the commit that moves it into the shared list, and the redeploy
 * that goes with it, are the founder's step (docs/OPERATIONS.md, "Fitbit, connected by the person", step 3). Until
 * then the morning reading refuses `NOT_CONFIGURED` before asking the service anything.
 */

/** A source that opens only with the person's key, handed to the fetch as a secret the attestor never sees. */
export type ConnectedSource = AttestedSource & Readonly<{ auth: "bearer" }>;

export const FITBIT_DAILY_SUMMARY: ConnectedSource = {
  id: "fitbit-daily-summary",
  service: "Fitbit",
  auth: "bearer",
  accepts: (day) => /^\d{4}-\d{2}-\d{2}$/.test(day),
  url: (day) => `https://api.fitbit.com/1/user/-/activities/date/${day}.json`,
  matches: [
    { type: "regex", value: '"fairlyActiveMinutes":(?<fairlyActiveMinutes>\\d+)' },
    { type: "regex", value: '"veryActiveMinutes":(?<veryActiveMinutes>\\d+)' },
    { type: "regex", value: '"steps":(?<steps>\\d+)' },
  ],
};

const CONNECTED: readonly ConnectedSource[] = [FITBIT_DAILY_SUMMARY];

/** The connected sources the app knows, by id; the shared list of `src/attested-sources.ts` is asked first. */
export function connectedSource(id: string): ConnectedSource | undefined {
  return CONNECTED.find((source) => source.id === id);
}
