import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

/**
 * Ported from Lock-in's wallet-auth-server. A five-minute HMAC challenge is signed by the Mera
 * account (a plain EIP-191 message, no passkey prompt since the session key signs), and a
 * twelve-hour `__Host-` cookie then binds the browser to that account and origin. Every server
 * route reads the account from this cookie: the browser never chooses the account, the phase or
 * the profile. Lock-in's canary allowlist is not ported; the claim link is Viky's access control.
 */

export const ACCOUNT_AUTH_CHAIN_ID = 143;
export const ACCOUNT_AUTH_CHALLENGE_TTL_MS = 5 * 60_000;
export const ACCOUNT_AUTH_SESSION_TTL_MS = 12 * 60 * 60_000;
export const ACCOUNT_AUTH_COOKIE_NAME = "__Host-viky-session";

type AccountAuthEnvironment = {
  [name: string]: string | undefined;
  SESSION_SIGNING_SECRET?: string;
};

type AccountAuthChallengePayload = {
  v: 1;
  kind: "challenge";
  account: Address;
  origin: string;
  chainId: typeof ACCOUNT_AUTH_CHAIN_ID;
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type AccountAuthSession = {
  v: 1;
  kind: "session";
  account: Address;
  origin: string;
  chainId: typeof ACCOUNT_AUTH_CHAIN_ID;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type AccountAuthChallenge = {
  challenge: string;
  message: string;
  account: Address;
  expiresAt: string;
};

export type IssuedAccountAuthSession = {
  token: string;
  account: Address;
  expiresAt: string;
};

type TokenPurpose = "challenge" | "session";

export class AccountAuthError extends Error {
  readonly status: 400 | 401 | 403 | 503;

  constructor(message: string, status: 400 | 401 | 403 | 503 = 401) {
    super(message);
    this.name = "AccountAuthError";
    this.status = status;
  }
}

function environmentSecret(environment: AccountAuthEnvironment): string {
  const value = environment.SESSION_SIGNING_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new AccountAuthError("Account authentication is unavailable", 503);
  }
  return value;
}

function normalizedOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    return parsed.origin;
  } catch {
    throw new AccountAuthError("Invalid authentication origin", 400);
  }
}

export function accountAuthOriginFromRequest(request: Request): string {
  return normalizedOrigin(new URL(request.url).origin);
}

export function normalizedAccount(value: string): Address {
  if (!isAddress(value)) throw new AccountAuthError("Invalid account", 400);
  return getAddress(value);
}

function signatureFor(encoded: string, purpose: TokenPurpose, environment: AccountAuthEnvironment): string {
  return createHmac("sha256", environmentSecret(environment))
    .update(`viky-account-auth:${purpose}:schema-1:${encoded}`)
    .digest("base64url");
}

function issueToken(payload: AccountAuthChallengePayload | AccountAuthSession, environment: AccountAuthEnvironment): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signatureFor(encoded, payload.kind, environment)}`;
}

function decodeToken(token: string, purpose: TokenPurpose, environment: AccountAuthEnvironment): unknown {
  if (typeof token !== "string" || token.length < 16 || token.length > 8 * 1_024) {
    throw new AccountAuthError(`Invalid account ${purpose}`, 401);
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new AccountAuthError(`Invalid account ${purpose}`, 401);
  const [encoded, supplied] = parts;
  const expected = signatureFor(encoded, purpose, environment);
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new AccountAuthError(`Invalid account ${purpose}`, 401);
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new AccountAuthError(`Invalid account ${purpose}`, 401);
  }
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseChallengePayload(
  challenge: string,
  environment: AccountAuthEnvironment,
  nowMs: number,
): AccountAuthChallengePayload {
  const value = decodeToken(challenge, "challenge", environment) as Partial<AccountAuthChallengePayload>;
  if (
    value.v !== 1 || value.kind !== "challenge" || value.chainId !== ACCOUNT_AUTH_CHAIN_ID
      || typeof value.account !== "string" || !isAddress(value.account)
      || typeof value.origin !== "string" || normalizedOrigin(value.origin) !== value.origin
      || typeof value.nonce !== "string" || !/^[0-9a-f]{32}$/i.test(value.nonce)
      || !validTimestamp(value.issuedAtMs) || !validTimestamp(value.expiresAtMs)
      || Number(value.expiresAtMs) - Number(value.issuedAtMs) !== ACCOUNT_AUTH_CHALLENGE_TTL_MS
      || Number(value.issuedAtMs) > nowMs + 60_000
      || nowMs >= Number(value.expiresAtMs)
  ) {
    throw new AccountAuthError("Invalid or expired account challenge", 401);
  }
  return { ...value, account: getAddress(value.account) } as AccountAuthChallengePayload;
}

function parseSessionPayload(token: string, environment: AccountAuthEnvironment, nowMs: number): AccountAuthSession {
  const value = decodeToken(token, "session", environment) as Partial<AccountAuthSession>;
  if (
    value.v !== 1 || value.kind !== "session" || value.chainId !== ACCOUNT_AUTH_CHAIN_ID
      || typeof value.account !== "string" || !isAddress(value.account)
      || typeof value.origin !== "string" || normalizedOrigin(value.origin) !== value.origin
      || !validTimestamp(value.issuedAtMs) || !validTimestamp(value.expiresAtMs)
      || Number(value.expiresAtMs) - Number(value.issuedAtMs) !== ACCOUNT_AUTH_SESSION_TTL_MS
      || Number(value.issuedAtMs) > nowMs + 60_000
      || nowMs >= Number(value.expiresAtMs)
  ) {
    throw new AccountAuthError("Account session is missing or expired", 401);
  }
  return { ...value, account: getAddress(value.account) } as AccountAuthSession;
}

function challengeMessage(payload: AccountAuthChallengePayload): string {
  const domain = new URL(payload.origin).host;
  return [
    "Viky account authentication",
    "",
    "Sign this message to let this browser use your Viky account for 12 hours.",
    "This does not move any money.",
    "",
    `Domain: ${domain}`,
    `Origin: ${payload.origin}`,
    `Account: ${payload.account}`,
    `Chain ID: ${payload.chainId}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${new Date(payload.issuedAtMs).toISOString()}`,
    `Expiration Time: ${new Date(payload.expiresAtMs).toISOString()}`,
  ].join("\n");
}

export function createAccountAuthChallenge(input: {
  account: string;
  origin: string;
  nowMs?: number;
  nonce?: string;
  environment?: AccountAuthEnvironment;
}): AccountAuthChallenge {
  const environment = input.environment || process.env;
  const account = normalizedAccount(input.account);
  const origin = normalizedOrigin(input.origin);
  const nowMs = input.nowMs ?? Date.now();
  const nonce = input.nonce || randomBytes(16).toString("hex");
  if (!/^[0-9a-f]{32}$/i.test(nonce)) throw new AccountAuthError("Invalid authentication nonce", 400);
  const payload: AccountAuthChallengePayload = {
    v: 1,
    kind: "challenge",
    account,
    origin,
    chainId: ACCOUNT_AUTH_CHAIN_ID,
    nonce: nonce.toLowerCase(),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + ACCOUNT_AUTH_CHALLENGE_TTL_MS,
  };
  return {
    challenge: issueToken(payload, environment),
    message: challengeMessage(payload),
    account,
    expiresAt: new Date(payload.expiresAtMs).toISOString(),
  };
}

export function verifyAccountAuthChallenge(input: {
  challenge: string;
  origin: string;
  nowMs?: number;
  environment?: AccountAuthEnvironment;
}): AccountAuthChallengePayload {
  const environment = input.environment || process.env;
  const payload = parseChallengePayload(input.challenge, environment, input.nowMs ?? Date.now());
  if (payload.origin !== normalizedOrigin(input.origin)) throw new AccountAuthError("Account challenge origin changed", 401);
  return payload;
}

export async function issueAccountAuthSession(input: {
  challenge: string;
  signature: string;
  origin: string;
  nowMs?: number;
  environment?: AccountAuthEnvironment;
}): Promise<IssuedAccountAuthSession> {
  const environment = input.environment || process.env;
  const nowMs = input.nowMs ?? Date.now();
  const payload = verifyAccountAuthChallenge({
    challenge: input.challenge,
    origin: input.origin,
    nowMs,
    environment,
  });
  if (!/^0x(?:[0-9a-f]{128}|[0-9a-f]{130})$/i.test(input.signature)) {
    throw new AccountAuthError("Invalid account signature", 401);
  }
  let valid = false;
  try {
    valid = await verifyMessage({
      address: payload.account,
      message: challengeMessage(payload),
      signature: input.signature as Hex,
    });
  } catch {
    valid = false;
  }
  if (!valid) throw new AccountAuthError("Signature does not match the requested account", 401);
  const session: AccountAuthSession = {
    v: 1,
    kind: "session",
    account: payload.account,
    origin: payload.origin,
    chainId: ACCOUNT_AUTH_CHAIN_ID,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + ACCOUNT_AUTH_SESSION_TTL_MS,
  };
  return {
    token: issueToken(session, environment),
    account: session.account,
    expiresAt: new Date(session.expiresAtMs).toISOString(),
  };
}

export function verifyAccountAuthSessionToken(input: {
  token: string;
  account: string;
  origin: string;
  nowMs?: number;
  environment?: AccountAuthEnvironment;
}): AccountAuthSession {
  const environment = input.environment || process.env;
  const session = parseSessionPayload(input.token, environment, input.nowMs ?? Date.now());
  const expectedAccount = normalizedAccount(input.account);
  if (session.account.toLowerCase() !== expectedAccount.toLowerCase()) {
    throw new AccountAuthError("Account session belongs to another account", 401);
  }
  if (session.origin !== normalizedOrigin(input.origin)) throw new AccountAuthError("Account session origin changed", 401);
  return session;
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    return entry.slice(separator + 1).trim() || null;
  }
  return null;
}

/** Reads the session cookie and checks it belongs to `account` and to this origin. */
export function requireAccountAuthSession(
  request: Request,
  account: string,
  environment: AccountAuthEnvironment = process.env,
  nowMs = Date.now(),
): AccountAuthSession {
  const token = cookieValue(request, ACCOUNT_AUTH_COOKIE_NAME);
  if (!token) throw new AccountAuthError("Account authentication is required", 401);
  return verifyAccountAuthSessionToken({
    token,
    account,
    origin: accountAuthOriginFromRequest(request),
    nowMs,
    environment,
  });
}

/** Reads the session cookie and returns whichever account it carries, so routes never take the account from the body. */
export function readAccountAuthSession(
  request: Request,
  environment: AccountAuthEnvironment = process.env,
  nowMs = Date.now(),
): AccountAuthSession {
  const token = cookieValue(request, ACCOUNT_AUTH_COOKIE_NAME);
  if (!token) throw new AccountAuthError("Account authentication is required", 401);
  const session = parseSessionPayload(token, environment, nowMs);
  if (session.origin !== accountAuthOriginFromRequest(request)) {
    throw new AccountAuthError("Account session origin changed", 401);
  }
  return session;
}

export function accountAuthErrorStatus(error: unknown): number | null {
  return error instanceof AccountAuthError ? error.status : null;
}

export function accountAuthPublicMessage(error: unknown): string {
  if (!(error instanceof AccountAuthError)) return "Account authentication failed";
  if (error.status === 503) return "Account authentication is temporarily unavailable";
  return error.message;
}
