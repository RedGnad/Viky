import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * What crosses the OAuth round trip on the person's own browser (D188): the gift, the account, the source, the
 * PKCE verifier and a nonce, signed by the server and kept in a cookie for ten minutes. The nonce goes to the source
 * as `state` and comes back with the code; the cookie says which gift and which verifier that code is for, and a
 * callback whose cookie does not match its `state` is refused before anything is exchanged.
 */

export const CONNECT_COOKIE_NAME = "__Host-viky-connect";
export const CONNECT_STATE_TTL_SECONDS = 10 * 60;

export type ConnectSource = "fitbit" | "strava";

export type ConnectState = Readonly<{
  giftId: string;
  account: string;
  source: ConnectSource;
  /** The PKCE verifier, when the source takes one; empty otherwise. */
  verifier: string;
  /** The `state` the source will send back. */
  nonce: string;
  issuedAt: number;
}>;

export class ConnectStateError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "INVALID" | "EXPIRED",
    message: string,
    /** The gift a state of ours named, when the state is only too old: where the person is sent back to, to read why. */
    readonly giftId: string | null = null,
  ) {
    super(message);
    this.name = "ConnectStateError";
  }
}

function secretOf(env: NodeJS.ProcessEnv): Buffer {
  const raw = env.SESSION_SIGNING_SECRET?.trim();
  if (!raw || raw.length < 32) throw new ConnectStateError("NOT_CONFIGURED", "SESSION_SIGNING_SECRET is not set");
  return Buffer.from(raw, "utf8");
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function newConnectNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function sealConnectState(state: ConnectState, env: NodeJS.ProcessEnv = process.env): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secretOf(env))}`;
}

export function openConnectState(value: string, nowSeconds: number, env: NodeJS.ProcessEnv = process.env): ConnectState {
  const parts = value.split(".");
  if (parts.length !== 2) throw new ConnectStateError("INVALID", "Not a connect state");
  const expected = Buffer.from(sign(parts[0], secretOf(env)), "utf8");
  const given = Buffer.from(parts[1], "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new ConnectStateError("INVALID", "The connect state is not ours");
  let state: ConnectState;
  try {
    state = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as ConnectState;
  } catch {
    throw new ConnectStateError("INVALID", "The connect state is malformed");
  }
  if (typeof state.giftId !== "string" || typeof state.account !== "string" || typeof state.nonce !== "string" || typeof state.issuedAt !== "number") {
    throw new ConnectStateError("INVALID", "The connect state is malformed");
  }
  if (state.source !== "fitbit" && state.source !== "strava") throw new ConnectStateError("INVALID", "The connect state names no source");
  if (nowSeconds - state.issuedAt > CONNECT_STATE_TTL_SECONDS || state.issuedAt > nowSeconds + 60) throw new ConnectStateError("EXPIRED", "The connection took too long. Start again.", /^\d{1,78}$/.test(state.giftId) ? state.giftId : null);
  return state;
}

/** The cookie that carries it: host-only, secure, never readable by a script, gone with the round trip. */
export function connectCookie(value: string, maxAgeSeconds: number = CONNECT_STATE_TTL_SECONDS): string {
  return `${CONNECT_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function connectCookieValue(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONNECT_COOKIE_NAME) return rest.join("=");
  }
  return null;
}
