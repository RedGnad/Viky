import { createHash, randomBytes } from "node:crypto";

/**
 * Fitbit, connected by the person, read through the Google Health API (D197; the line itself is D188). The legacy
 * Fitbit Web API closes in September 2026 (its developer site's banner, read 23 Sep 2026: "We will be deprecating the
 * legacy Fitbit Web API in September 2026"; the founder read registrations closed and the date 30 Sep), and its
 * successor is the Google Health API, "the next generation of the Fitbit Web API" (developers.google.com/health, read
 * the same day), which reads Fitbit trackers and Pixel Watches alike.
 *
 * The person authorises Viky once, on Google's own page, in their own browser (OAuth 2.0 for a web server
 * application, the authorization code with PKCE and the client secret on the exchange, `access_type=offline` so a
 * refresh key comes back), for one scope, `googlehealth.activity_and_fitness.readonly`, the one the daily roll-up of
 * active minutes needs (the API's discovery document, revision 20260922). The keys sleep sealed (src/connect-vault.ts)
 * and are opened only for the morning reading, which is attested: the reading service asks the API's
 * `dailyRollUp` for yesterday through zkFetch with the key as a secret the attestor never sees, and what comes back
 * is judged here (the moderate and vigorous minutes against the target) and dropped.
 *
 * The frame is Google's: the Google Health API Developer Terms (effective 24 Mar 2026) and its Developer and User
 * Data Policy (last updated 24 Mar 2026), read 23 Sep 2026: use limited to the feature the person asked for; a
 * transfer to a third party only to provide it, with the person's consent; the disclosure shown immediately before the
 * consent, which an affirmative action gives; deletion honoured on request; no human reading the data; no use for
 * credit or lending. What the funder learns is a yes or a no for the day, said on the consent screen before the
 * gesture; what Viky keeps is nothing; what it erases on request is everything, the key revoked first.
 */
export const FITBIT_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const FITBIT_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FITBIT_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_HEALTH_IDENTITY_URL = "https://health.googleapis.com/v4/users/me/identity";
export const FITBIT_SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
export const FITBIT_SOURCE = "Fitbit";
/** The label the pseudonym of the account is derived under (src/gift-attestation.ts), never the id itself. */
export const FITBIT_PROVIDER_LABEL = "fitbit";

export class FitbitError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "EXCHANGE_REFUSED" | "REFRESH_REFUSED" | "REVOKE_FAILED" | "BAD_ANSWER" | "SCOPE_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "FitbitError";
  }
}

/** The OAuth client the founder created in Google Cloud Console (type web application), by its two variables. */
export function fitbitCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; clientSecret: string } {
  const clientId = env.GOOGLE_HEALTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_HEALTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new FitbitError("NOT_CONFIGURED", "The Google Health client is not configured");
  return { clientId, clientSecret };
}

export function fitbitConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    fitbitCredentials(env);
    return true;
  } catch {
    return false;
  }
}

/** A PKCE verifier: 64 random bytes in base64url, 86 characters, inside the 43 to 128 the standard allows. */
export function pkceVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Where the person is sent, in their own browser: Google's own page, with our client, the one scope and the state.
 * `access_type=offline` and `prompt=consent` so a refresh key comes back each time the person connects.
 */
export function fitbitAuthorizeUrl(input: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const url = new URL(FITBIT_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FITBIT_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type FitbitTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  /** When the access key stops working, in seconds. */
  expiresAt: number;
  /** The Google Health API's `healthUserId`, the identity the gift binds. */
  userId: string;
  scope: string;
}>;

/** A `healthUserId`: "strings of 1-63 characters" (the API's Identity schema); letters, digits, dash and underscore. */
export function isFitbitUserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,63}$/.test(value);
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

function tokensOf(answer: unknown, nowSeconds: number, userId: string | undefined, previous?: Pick<FitbitTokens, "refreshToken" | "scope">): Omit<FitbitTokens, "userId"> & { userId?: string } {
  const body = answer as Record<string, unknown>;
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  // Google sends a refresh key on the first exchange only, and keeps the same one across refreshes.
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : (previous?.refreshToken ?? "");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in);
  const scope = typeof body.scope === "string" ? body.scope : (previous?.scope ?? "");
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) throw new FitbitError("BAD_ANSWER", "Google's answer carried no usable key");
  return { accessToken, refreshToken, expiresAt: nowSeconds + Math.floor(expiresIn), userId, scope };
}

/** Whether the person left the activity scope ticked on Google's page: without it no day could be read. */
export function fitbitScopeAllows(scope: string | null | undefined): boolean {
  return String(scope ?? "").split(/\s+/).includes(FITBIT_SCOPE);
}

/** The account's own id, asked of the API with the new key: `GET /v4/users/me/identity`, `healthUserId`. */
async function healthUserIdOf(accessToken: string, fetchLike: FetchLike): Promise<string> {
  const response = await fetchLike(GOOGLE_HEALTH_IDENTITY_URL, { method: "GET", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (response.status !== 200) throw new FitbitError("BAD_ANSWER", `Google Health did not say whose account this is (${response.status})`);
  const identity = (await response.json()) as Record<string, unknown>;
  if (!isFitbitUserId(identity.healthUserId)) throw new FitbitError("BAD_ANSWER", "Google Health's identity carried no user id");
  return identity.healthUserId;
}

/** The code Google sent back, exchanged for the keys with the verifier the round trip kept, then whose account it is. */
export async function exchangeFitbitCode(input: { code: string; verifier: string; redirectUri: string; nowSeconds: number }, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<FitbitTokens> {
  const credentials = fitbitCredentials(env);
  const body = new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, code: input.code, code_verifier: input.verifier, grant_type: "authorization_code", redirect_uri: input.redirectUri });
  const response = await fetchLike(FITBIT_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (response.status !== 200) throw new FitbitError("EXCHANGE_REFUSED", `Google refused the code (${response.status})`);
  const tokens = tokensOf(await response.json(), input.nowSeconds, undefined);
  if (!fitbitScopeAllows(tokens.scope)) throw new FitbitError("SCOPE_MISSING", "The activity data was not allowed on Google's page");
  return { ...tokens, userId: await healthUserIdOf(tokens.accessToken, fetchLike) };
}

/** A new access key from the refresh key; the account is the one bound, and does not change. */
export async function refreshFitbitTokens(previous: FitbitTokens, nowSeconds: number, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<FitbitTokens> {
  const credentials = fitbitCredentials(env);
  const body = new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, grant_type: "refresh_token", refresh_token: previous.refreshToken });
  const response = await fetchLike(FITBIT_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (response.status !== 200) throw new FitbitError("REFRESH_REFUSED", `Google refused the refresh (${response.status})`);
  return { ...tokensOf(await response.json(), nowSeconds, previous.userId, previous), userId: previous.userId };
}

/** The key revoked at Google, which is the first thing "disconnect and erase" does (rule 3). */
export async function revokeFitbitToken(token: string, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  fitbitCredentials(env);
  const response = await fetchLike(FITBIT_REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
  if (response.status !== 200) throw new FitbitError("REVOKE_FAILED", `Google did not revoke the key (${response.status})`);
}

/** The day asked for, `yyyy-MM-dd`: the calendar day, which the API reads in the person's own civil time. */
export function fitbitDateOfUtcDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function isFitbitDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The body of the daily roll-up for one civil day: from that day to the next, one window, wearables only. */
export function dailyRollUpBody(day: string): string {
  if (!isFitbitDate(day)) throw new FitbitError("BAD_ANSWER", "Not a day");
  const start = new Date(`${day}T00:00:00Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const date = (at: Date) => ({ year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() });
  return JSON.stringify({ range: { start: { date: date(start) }, end: { date: date(end) } }, windowSizeDays: 1, dataSourceFamily: "users/me/dataSourceFamilies/google-wearables" });
}

/**
 * The minutes of the day that count as active: the roll-up's `MODERATE` and `VIGOROUS` levels, added, the Google
 * Health API's counterpart of the legacy "fairly" and "very" active minutes; `LIGHT` is not in it. The answer is the
 * whole roll-up, as captured; an answer with no data point for the day is a day of zero, and one that is not a
 * roll-up at all is nothing.
 */
export function activeMinutesOf(fields: Readonly<Record<string, string>>): number | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fields.rollup ?? "");
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const points = (parsed as { rollupDataPoints?: unknown }).rollupDataPoints;
  if (points === undefined) return 0;
  if (!Array.isArray(points)) return undefined;
  let minutes = 0;
  for (const point of points) {
    const levels = (point as { activeMinutes?: { activeMinutesRollupByActivityLevel?: unknown } })?.activeMinutes?.activeMinutesRollupByActivityLevel;
    if (levels === undefined) continue;
    if (!Array.isArray(levels)) return undefined;
    for (const level of levels as Array<{ activityLevel?: unknown; activeMinutesSum?: unknown }>) {
      if (level.activityLevel !== "MODERATE" && level.activityLevel !== "VIGOROUS") continue;
      const sum = Number(level.activeMinutesSum);
      if (!Number.isInteger(sum) || sum < 0) return undefined;
      minutes += sum;
    }
  }
  return minutes;
}

/** The day's verdict, and nothing else leaves the reading: won when the minutes reach the target. */
export function fitbitDayMet(minutes: number, dailyTarget: number): boolean {
  return Number.isInteger(dailyTarget) && dailyTarget > 0 && minutes >= dailyTarget;
}
