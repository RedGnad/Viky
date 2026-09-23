import { createHash, randomBytes } from "node:crypto";

/**
 * Fitbit, connected by the person (D188): the third nature of a condition. They authorise Viky once, on Fitbit's own
 * page, in their own browser (OAuth 2.0, the authorization code with PKCE, as Fitbit's authorization guide describes
 * it for a server application, read 23 Sep 2026); Fitbit hands Viky a key for the `activity` scope, which sleeps
 * sealed (src/connect-vault.ts) and is opened only for the morning reading. That reading is attested: the reading
 * service fetches Fitbit's Web API through zkFetch with the key as a secret the attestor never sees, and what comes
 * back is the day's activity summary, judged here (the minutes against the target) and dropped. Nothing of the
 * summary is kept: not the minutes, not the steps, not the calories.
 *
 * Fitbit's Platform Terms of Service (effective 6 Jun 2023, read 23 Sep 2026) are the frame: User Data is displayed
 * or distributed to no external source without the informed consent of the User (1(f)), is never made public (1(f)),
 * is removed on the User's request (1(i)), and is reached through Fitbit's API and nothing else (1(g)). What Viky
 * shows the funder is a yes or a no for the day, which the consent screen says in those words before the person
 * connects; what it keeps is nothing; what it erases on request is everything, the key first.
 */

export const FITBIT_AUTHORIZE_URL = "https://www.fitbit.com/oauth2/authorize";
export const FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token";
export const FITBIT_REVOKE_URL = "https://api.fitbit.com/oauth2/revoke";
export const FITBIT_SCOPE = "activity";
export const FITBIT_SOURCE = "Fitbit";
/** The label the pseudonym of a Fitbit account is derived under (src/gift-attestation.ts), never the id itself. */
export const FITBIT_PROVIDER_LABEL = "fitbit";

export class FitbitError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "EXCHANGE_REFUSED" | "REFRESH_REFUSED" | "REVOKE_FAILED" | "BAD_ANSWER",
    message: string,
  ) {
    super(message);
    this.name = "FitbitError";
  }
}

/** The application the founder registers on dev.fitbit.com, by the two variables and nothing else. */
export function fitbitCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; clientSecret: string } {
  const clientId = env.FITBIT_CLIENT_ID?.trim();
  const clientSecret = env.FITBIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new FitbitError("NOT_CONFIGURED", "The Fitbit application is not configured");
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

/** Where the person is sent, in their own browser: Fitbit's own page, with our application, the scope and the state. */
export function fitbitAuthorizeUrl(input: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const url = new URL(FITBIT_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", FITBIT_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type FitbitTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  /** When the access key stops working, in seconds. */
  expiresAt: number;
  /** Fitbit's own id of the user, the identity the gift binds. */
  userId: string;
  scope: string;
}>;

/** Fitbit's encoded user id, a short string of capitals and digits (measured shape: six characters; a few more tolerated). */
export function isFitbitUserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9]{4,12}$/.test(value);
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

function tokensOf(answer: unknown, nowSeconds: number, previous?: Pick<FitbitTokens, "userId" | "refreshToken">): FitbitTokens {
  const body = answer as Record<string, unknown>;
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : (previous?.refreshToken ?? "");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in);
  const userId = isFitbitUserId(body.user_id) ? body.user_id : previous?.userId;
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || !userId) throw new FitbitError("BAD_ANSWER", "Fitbit's answer carried no usable key");
  return { accessToken, refreshToken, expiresAt: nowSeconds + Math.floor(expiresIn), userId, scope: typeof body.scope === "string" ? body.scope : "" };
}

function basic(credentials: { clientId: string; clientSecret: string }): string {
  return `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, "utf8").toString("base64")}`;
}

/** The code Fitbit sent back, exchanged for the keys, with the verifier the round trip kept (PKCE). */
export async function exchangeFitbitCode(input: { code: string; verifier: string; redirectUri: string; nowSeconds: number }, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<FitbitTokens> {
  const credentials = fitbitCredentials(env);
  const body = new URLSearchParams({ client_id: credentials.clientId, code: input.code, code_verifier: input.verifier, grant_type: "authorization_code", redirect_uri: input.redirectUri });
  const response = await fetchLike(FITBIT_TOKEN_URL, { method: "POST", headers: { authorization: basic(credentials), "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (response.status !== 200) throw new FitbitError("EXCHANGE_REFUSED", `Fitbit refused the code (${response.status})`);
  return tokensOf(await response.json(), input.nowSeconds);
}

/** A new access key from the refresh key, which Fitbit rotates with it: both are sealed again by the caller. */
export async function refreshFitbitTokens(previous: FitbitTokens, nowSeconds: number, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<FitbitTokens> {
  const credentials = fitbitCredentials(env);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: previous.refreshToken });
  const response = await fetchLike(FITBIT_TOKEN_URL, { method: "POST", headers: { authorization: basic(credentials), "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (response.status !== 200) throw new FitbitError("REFRESH_REFUSED", `Fitbit refused the refresh (${response.status})`);
  return tokensOf(await response.json(), nowSeconds, previous);
}

/** The key revoked at Fitbit, which is the first thing "disconnect and erase" does (D188, rule 3). */
export async function revokeFitbitToken(token: string, fetchLike: FetchLike = fetch as unknown as FetchLike, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const credentials = fitbitCredentials(env);
  const response = await fetchLike(FITBIT_REVOKE_URL, { method: "POST", headers: { authorization: basic(credentials), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
  if (response.status !== 200) throw new FitbitError("REVOKE_FAILED", `Fitbit did not revoke the key (${response.status})`);
}

/** The day a summary is asked for, as Fitbit's API names it: `yyyy-MM-dd`, the calendar day in the person's own Fitbit time zone. */
export function fitbitDateOfUtcDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function isFitbitDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * The minutes of the day that count as active, as Fitbit's summary reports them: `fairlyActiveMinutes` and
 * `veryActiveMinutes`, added, which is what Fitbit's own daily goal `activeMinutes` is measured against (the
 * reference of "Get Daily Activity Summary", read 23 Sep 2026). Lightly active minutes are not in it.
 */
export function activeMinutesOf(fields: Readonly<Record<string, string>>): number | undefined {
  const fairly = Number(fields.fairlyActiveMinutes);
  const very = Number(fields.veryActiveMinutes);
  if (!Number.isInteger(fairly) || !Number.isInteger(very) || fairly < 0 || very < 0) return undefined;
  return fairly + very;
}

/** The day's verdict, and nothing else leaves the reading: won when the minutes reach the target. */
export function fitbitDayMet(minutes: number, dailyTarget: number): boolean {
  return Number.isInteger(dailyTarget) && dailyTarget > 0 && minutes >= dailyTarget;
}
