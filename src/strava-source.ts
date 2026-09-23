import type { ConnectedSource } from "./fitbit-source";
import { stravaDayBounds } from "./strava";

/**
 * Strava's activities of one day, read with the person's own key (D191): "List Athlete Activities",
 * `GET /api/v3/athlete/activities?after=&before=&per_page=`, scope `activity:read` (Strava's API reference, read
 * 23 Sep 2026). The account a caller names is the day, `yyyy-MM-dd`; the key is not an account and never travels as
 * one. What must match is the whole list, since a day is the sum of its activities and a pattern captures one value:
 * the app reads the distances out of it and drops it. Nothing of the answer is kept once judged: not the route, not
 * the times, not the distance.
 *
 * Why it lives here and not in `src/attested-sources.ts`: the same reason as the Fitbit source (src/fitbit-source.ts),
 * the reading fingerprint, and the founder's redeploy that moves both at once.
 */
export const STRAVA_DAY_ACTIVITIES: ConnectedSource = {
  id: "strava-day-activities",
  service: "Strava",
  auth: "bearer",
  accept: "application/json",
  accepts: (day) => /^\d{4}-\d{2}-\d{2}$/.test(day),
  url: (day) => {
    const { start, end } = stravaDayBounds(day);
    return `https://www.strava.com/api/v3/athlete/activities?after=${start - 1}&before=${end}&per_page=30`;
  },
  matches: [{ type: "regex", value: "(?<activities>\\[[\\s\\S]*\\])" }],
};
