import { getAddress } from "viem";
import { conditionOfGoal } from "./conditions";
import { connectCookie, connectCookieValue, CONNECT_STATE_TTL_SECONDS, ConnectStateError, newConnectNonce, openConnectState, sealConnectState } from "./connect-state";
import { sealSecret, vaultConfigured } from "./connect-vault";
import { eraseConnection, loadConnection, saveConnection } from "./connection-store";
import { exchangeFitbitCode, fitbitAuthorizeUrl, fitbitConfigured, fitbitCredentials, FitbitError, pkceChallenge, pkceVerifier, revokeFitbitToken } from "./fitbit";
import { openSecret } from "./connect-vault";
import { GiftApiError } from "./gift-api";
import { forgetConnectedAccount, loadGift, markConnectedAccount, type GiftRecord } from "./gift-store";

/**
 * The three gestures of a Fitbit connection, behind the routes of app/api/connect/fitbit (D188): start, which sends
 * the person to Fitbit's own page with a signed state; the callback, which exchanges the code for the keys and seals
 * them; and disconnect, which gives the key back to Fitbit and erases the row. Each is the recipient's own, on their
 * own gift, and nothing else's.
 */

export const FITBIT_CALLBACK_PATH = "/api/connect/fitbit/callback";

/** Where Fitbit sends the person back: the production host, or the one the request came from while there is none. */
export function fitbitRedirectUri(requestUrl: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(requestUrl).origin;
  return `${origin.replace(/\/$/, "")}${FITBIT_CALLBACK_PATH}`;
}

/** The gift a connection is about, which must be the recipient's own and on the Fitbit line. */
export async function fitbitGiftOf(giftId: string, account: string): Promise<GiftRecord> {
  if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "No such gift", 404);
  const gift = await loadGift(giftId);
  if (!gift || !gift.recipient || gift.recipient.toLowerCase() !== account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
  if (conditionOfGoal(gift.goalType)?.id !== "fitbit-daily") throw new GiftApiError("NOT_THIS_CONDITION", "This gift is not on Fitbit.", 400);
  return gift;
}

export function fitbitConnectConfigured(): boolean {
  return fitbitConfigured() && vaultConfigured();
}

/** The URL to send the person to, and the cookie that will recognise them when they come back. */
export function startFitbitConnection(input: { giftId: string; account: string; requestUrl: string; nowSeconds: number }): { url: string; cookie: string } {
  if (!fitbitConnectConfigured()) throw new GiftApiError("NOT_CONFIGURED", "Connecting Fitbit is not switched on yet. Nothing was changed.", 503);
  const verifier = pkceVerifier();
  const nonce = newConnectNonce();
  const state = sealConnectState({ giftId: input.giftId, account: getAddress(input.account).toLowerCase(), source: "fitbit", verifier, nonce, issuedAt: input.nowSeconds });
  const url = fitbitAuthorizeUrl({ clientId: fitbitCredentials().clientId, redirectUri: fitbitRedirectUri(input.requestUrl), challenge: pkceChallenge(verifier), state: nonce });
  return { url, cookie: connectCookie(state, CONNECT_STATE_TTL_SECONDS) };
}

export type CallbackOutcome = Readonly<{ giftId: string; ok: true }> | Readonly<{ giftId: string | null; ok: false; code: string }>;

/** The code Fitbit sent back, turned into a sealed connection on the gift the cookie names. Never throws: the answer is a redirect. */
export async function finishFitbitConnection(input: { code: string | null; state: string | null; cookieHeader: string | null; account: string; requestUrl: string; nowSeconds: number }): Promise<CallbackOutcome> {
  const sealed = connectCookieValue(input.cookieHeader);
  if (!sealed) return { giftId: null, ok: false, code: "NO_STATE" };
  let state;
  try {
    state = openConnectState(sealed, input.nowSeconds);
  } catch (error) {
    return { giftId: null, ok: false, code: error instanceof ConnectStateError ? error.code : "INVALID" };
  }
  if (state.source !== "fitbit" || !input.state || state.nonce !== input.state) return { giftId: state.giftId, ok: false, code: "STATE_MISMATCH" };
  if (state.account !== getAddress(input.account).toLowerCase()) return { giftId: state.giftId, ok: false, code: "OTHER_ACCOUNT" };
  if (!input.code) return { giftId: state.giftId, ok: false, code: "REFUSED_AT_FITBIT" };
  try {
    await fitbitGiftOf(state.giftId, state.account);
  } catch {
    return { giftId: state.giftId, ok: false, code: "NOT_RECIPIENT" };
  }
  try {
    const tokens = await exchangeFitbitCode({ code: input.code, verifier: state.verifier, redirectUri: fitbitRedirectUri(input.requestUrl), nowSeconds: input.nowSeconds });
    await saveConnection({
      giftId: state.giftId,
      source: "fitbit",
      externalId: tokens.userId,
      accessToken: sealSecret(tokens.accessToken),
      refreshToken: sealSecret(tokens.refreshToken),
      expiresAt: new Date(tokens.expiresAt * 1_000),
      scope: tokens.scope,
    });
    await markConnectedAccount(state.giftId, tokens.userId);
    return { giftId: state.giftId, ok: true };
  } catch (error) {
    return { giftId: state.giftId, ok: false, code: error instanceof FitbitError ? error.code : "EXCHANGE_FAILED" };
  }
}

/** The key given back to Fitbit, then the row erased whether or not Fitbit answered (rule 3): nothing of theirs stays. */
export async function disconnectFitbit(giftId: string): Promise<{ erased: boolean; revoked: boolean }> {
  const connection = await loadConnection(giftId);
  if (!connection) return { erased: false, revoked: false };
  let revoked = false;
  try {
    await revokeFitbitToken(openSecret(connection.accessToken));
    revoked = true;
  } catch {
    revoked = false;
  }
  const erased = await eraseConnection(giftId);
  // The source's ids kept on the gift go too: nothing of theirs stays (the founder, 29 Sep 2026).
  await forgetConnectedAccount(giftId);
  return { erased, revoked };
}
