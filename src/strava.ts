/**
 * Strava, connected by the person (D191): the second source of the third nature, beside Fitbit (D188). They authorise
 * Viky once, on Strava's own page, in their own browser (OAuth 2.0, the authorization code; Strava's authentication
 * guide, read 23 Sep 2026, takes the application's secret on the exchange and no PKCE); Strava hands Viky a key for
 * the `activity:read` scope, which sleeps sealed (src/connect-vault.ts) and is opened only for the morning reading.
 * That reading is attested: the reading service fetches Strava's API through zkFetch with the key as a secret the
 * attestor never sees, and what comes back is the day's activities, judged here (the distance against the target)
 * and dropped. Nothing of them is kept: not the route, not the times, not the distance.
 *
 * Strava's API Agreement (read 23 Sep 2026) is the frame: Strava Data is used only to serve the person who
 * authorised it, never aggregated across people or shown to others, deleted when they ask; the key is revoked at
 * Strava first when they disconnect. What Viky shows the funder is a yes or a no for the day, which the consent
 * screen says in those words before the person connects.
 */
export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
/** The endpoint Strava recommends since 1 Jun 2026 (`/oauth/deauthorize` is the deprecated one), read 23 Sep 2026. */
export const STRAVA_REVOKE_URL = "https://www.strava.com/oauth/revoke";
export const STRAVA_SCOPE = "activity:read";
export const STRAVA_SOURCE = "Strava";
/** The label the pseudonym of a Strava account is derived under (src/gift-attestation.ts), never the id itself. */
export const STRAVA_PROVIDER_LABEL = "strava";

export class StravaError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "EXCHANGE_REFUSED" | "REFRESH_REFUSED" | "REFRESH_UNAVAILABLE" | "REVOKE_FAILED" | "BAD_ANSWER",
    message: string,
  ) {
    super(message);
    this.name = "StravaError";
  }
}

/** The application the founder registers on strava.com/settings/api, by the two variables and nothing else. */
export function stravaCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; clientSecret: string } {
  const clientId = env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new StravaError("NOT_CONFIGURED", "The Strava application is not configured");
  return { clientId, clientSecret };
}

export function stravaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    stravaCredentials(env);
    return true;
  } catch {
    return false;
  }
}

/** Where the person is sent, in their own browser: Strava's own page, with our application, the scope and the state. */
export function stravaAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPE);
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** Whether what the person allowed on Strava's page lets a day be read: the scope comes back in the redirect. */
export function stravaScopeAllows(scope: string | null | undefined): boolean {
  const granted = String(scope ?? "").split(/[,\s]+/);
  return granted.includes("activity:read") || granted.includes("activity:read_all");
}

export type StravaTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  /** When the access key stops working, in seconds: six hours after it is made, Strava says. */
  expiresAt: number;
  /** Strava's own id of the athlete, the identity the gift binds. */
  athleteId: string;
  scope: string;
}>;

export function isStravaAthleteId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,15}$/.test(value);
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

function tokensOf(answer: unknown, nowSeconds: number, scope: string, previous?: Pick<StravaTokens, "athleteId" | "refreshToken">): StravaTokens {
  const body = answer as Record<string, unknown>;
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : (previous?.refreshToken ?? "");
  const expiresAt = typeof body.expires_at === "number" ? body.expires_at : typeof body.expires_in === "number" ? nowSeconds + Math.floor(body.expires_in) : Number.NaN;
  const athlete = body.athlete as Record<string, unknown> | undefined;
  const athleteId = athlete && (typeof athlete.id === "number" || typeof athlete.id === "string") && isStravaAthleteId(String(athlete.id)) ? String(athlete.id) : previous?.athleteId;
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || !athleteId) throw new StravaError("BAD_ANSWER", "Strava's answer carried no usable key");
  return { accessToken, refreshToken, expiresAt, athleteId, scope };
}

function basic(credentials: { clientId: string; clientSecret: string }): string {
  return `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, "utf8").toString("base64")}`;
}

/** The code Strava sent back, exchanged for the keys, with the application's secret (Strava takes no PKCE). */
export async function exchangeStravaCode(input: { code: string; scope: string; nowSeconds: number }, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<StravaTokens> {
  const credentials = stravaCredentials(env);
  const body = new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, code: input.code, grant_type: "authorization_code" });
  const response = await fetchLike(STRAVA_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (response.status !== 200) throw new StravaError("EXCHANGE_REFUSED", `Strava refused the code (${response.status})`);
  return tokensOf(await response.json(), input.nowSeconds, input.scope);
}

/** A new access key from the refresh key, which Strava may rotate with it: both are sealed again by the caller. */
export async function refreshStravaTokens(previous: StravaTokens, nowSeconds: number, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<StravaTokens> {
  const credentials = stravaCredentials(env);
  const body = new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, grant_type: "refresh_token", refresh_token: previous.refreshToken });
  const response = await fetchLike(STRAVA_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  // Only 400 and 401 say the key is no longer honoured. Anything else, a 429 or a 5xx, is Strava not answering just
  // now: until 1 Oct 2026 it was read as a refusal too, and an hour's outage erased every person's connection.
  if (response.status === 400 || response.status === 401) throw new StravaError("REFRESH_REFUSED", `Strava refused the refresh (${response.status})`);
  if (response.status !== 200) throw new StravaError("REFRESH_UNAVAILABLE", `Strava did not answer the refresh (${response.status})`);
  return tokensOf(await response.json(), nowSeconds, previous.scope, previous);
}

/** The key revoked at Strava, which is the first thing "disconnect and erase" does (rule 3). */
export async function revokeStravaToken(token: string, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const credentials = stravaCredentials(env);
  const response = await fetchLike(STRAVA_REVOKE_URL, { method: "POST", headers: { authorization: basic(credentials), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
  if (response.status !== 200) throw new StravaError("REVOKE_FAILED", `Strava did not revoke the key (${response.status})`);
}

/** The day's bounds, in seconds, for Strava's `after` and `before`: the calendar day in UTC (a default, to confirm). */
export function stravaDayBounds(day: string): { start: number; end: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new StravaError("BAD_ANSWER", "Not a day");
  const start = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1_000);
  if (!Number.isFinite(start)) throw new StravaError("BAD_ANSWER", "Not a day");
  return { start, end: start + 86_400 };
}

/**
 * The metres covered on the day, summed over the activities Strava listed whose start falls in it, or undefined when
 * the answer is not a list of activities. Strava's `distance` is in metres (SummaryActivity, read 23 Sep 2026).
 */
export function distanceOfDay(activities: string | undefined, day: string): number | undefined {
  if (typeof activities !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(activities);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const { start, end } = stravaDayBounds(day);
  let metres = 0;
  for (const item of parsed) {
    if (!item || typeof item !== "object") return undefined;
    const activity = item as Record<string, unknown>;
    const at = typeof activity.start_date === "string" ? Math.floor(Date.parse(activity.start_date) / 1_000) : Number.NaN;
    const distance = typeof activity.distance === "number" ? activity.distance : Number(activity.distance);
    if (!Number.isFinite(at) || !Number.isFinite(distance) || distance < 0) return undefined;
    if (at >= start && at < end) metres += distance;
  }
  return Math.floor(metres);
}

/** The day's verdict, and nothing else leaves the reading: won when the metres reach the kilometres the funder set. */
export function stravaDayMet(metres: number, dailyTargetKm: number): boolean {
  return Number.isInteger(dailyTargetKm) && dailyTargetKm > 0 && metres >= dailyTargetKm * 1_000;
}
