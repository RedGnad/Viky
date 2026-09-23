import type { AttestedSource } from "./attested-sources";
import { dailyRollUpBody } from "./fitbit";
import { STRAVA_DAY_ACTIVITIES } from "./strava-source";

/**
 * The connected sources the app knows and the reading service does not run yet.
 *
 * Why it lives here and not in `src/attested-sources.ts`: that file is one of the two the reading fingerprint hashes,
 * and the reading service runs its own copy of it. Adding a source there changes `READING_FINGERPRINT`, and until the
 * founder redeploys the service from that commit every attested read of the app refuses (`WORKER_OUT_OF_DATE`): the
 * Chess.com ratings and the certificate readings included. So this source waits in a file the fingerprint does not
 * cover, known to the app and not to the service; the commit that moves it into the shared list, and the redeploy
 * that goes with it, are the founder's step (docs/OPERATIONS.md, "Fitbit, connected by the person", step 3). Until
 * then the morning reading refuses `NOT_CONFIGURED` before asking the service anything.
 */

/**
 * A source that opens only with the person's key, handed to the fetch as a secret the attestor never sees; and, for a
 * page asked by POST, the method and the body, which are part of what is signed (D197).
 */
export type ConnectedSource = AttestedSource & Readonly<{ auth: "bearer"; method?: "POST"; body?: (account: string) => string }>;

/**
 * The day's active minutes on the person's Google Health account, which reads their Fitbit or Pixel Watch (D197):
 * `users.dataTypes.dataPoints.dailyRollUp`, `POST https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints:dailyRollUp`,
 * scope `googlehealth.activity_and_fitness.readonly` (the API's discovery document, revision 20260922, read 23 Sep
 * 2026). The account a caller names is the day, `yyyy-MM-dd`, and the body asks that civil day and the next, one
 * window, from Google's and Fitbit's own wearables only (`google-wearables`, which excludes minutes logged by hand).
 * What must match is the whole roll-up, since the levels come as a list in no promised order: the app adds the
 * moderate and vigorous minutes and drops the rest. The legacy Fitbit Web API source is gone with that API.
 */
export const GOOGLE_HEALTH_ACTIVE_MINUTES: ConnectedSource = {
  id: "google-health-active-minutes",
  service: "Google Health",
  auth: "bearer",
  method: "POST",
  accepts: (day) => /^\d{4}-\d{2}-\d{2}$/.test(day),
  url: () => "https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints:dailyRollUp",
  body: (day) => dailyRollUpBody(day),
  matches: [{ type: "regex", value: "(?<rollup>\\{[\\s\\S]*\\})" }],
};

const CONNECTED: readonly ConnectedSource[] = [GOOGLE_HEALTH_ACTIVE_MINUTES, STRAVA_DAY_ACTIVITIES];

/** The connected sources the app knows, by id; the shared list of `src/attested-sources.ts` is asked first. */
export function connectedSource(id: string): ConnectedSource | undefined {
  return CONNECTED.find((source) => source.id === id);
}
