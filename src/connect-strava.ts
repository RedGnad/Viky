import { getAddress } from "viem";
import { conditionOfGoal } from "./conditions";
import { connectCookie, connectCookieValue, CONNECT_STATE_TTL_SECONDS, ConnectStateError, newConnectNonce, openConnectState, sealConnectState } from "./connect-state";
import { openSecret, sealSecret, vaultConfigured } from "./connect-vault";
import { eraseConnection, loadConnection, saveConnection } from "./connection-store";
import { GiftApiError } from "./gift-api";
import { forgetConnectedAccount, loadGift, markConnectedAccount, type GiftRecord } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { exchangeStravaCode, revokeStravaToken, stravaAuthorizeUrl, stravaConfigured, stravaCredentials, StravaError, stravaScopeAllows } from "./strava";

/**
 * The three gestures of a Strava connection, behind the routes of app/api/connect/strava (D191), on the model of
 * Fitbit's (src/connect-fitbit.ts): start, which sends the person to Strava's own page with a signed state; the
 * callback, which exchanges the code for the keys and seals them; and disconnect, which gives the key back to
 * Strava and erases the row. Strava takes no PKCE: the state's verifier is empty, and the nonce in the cookie is what
 * ties the way back to the way out. Strava also sends back what the person allowed, and a connection without the
 * activities' scope is refused rather than kept.
 */

export const STRAVA_CALLBACK_PATH = "/api/connect/strava/callback";

/** Where Strava sends the person back: the production host, or the one the request came from while there is none. */
export function stravaRedirectUri(requestUrl: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(requestUrl).origin;
  return `${origin.replace(/\/$/, "")}${STRAVA_CALLBACK_PATH}`;
}

/** The gift a connection is about, which must be the recipient's own and on the Strava line. */
export async function stravaGiftOf(giftId: string, account: string): Promise<GiftRecord> {
  if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "No such gift", 404);
  // A milestone gift counts its goals apart: the same number there is another condition, never a day on Strava.
  if (isMilestoneGiftId(giftId)) throw new GiftApiError("NOT_THIS_CONDITION", "This gift is not on Strava.", 400);
  const gift = await loadGift(giftId);
  if (!gift || !gift.recipient || gift.recipient.toLowerCase() !== account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
  if (conditionOfGoal(gift.goalType)?.id !== "strava-daily") throw new GiftApiError("NOT_THIS_CONDITION", "This gift is not on Strava.", 400);
  return gift;
}

export function stravaConnectConfigured(): boolean {
  return stravaConfigured() && vaultConfigured();
}

/** The URL to send the person to, and the cookie that will recognise them when they come back. */
export function startStravaConnection(input: { giftId: string; account: string; requestUrl: string; nowSeconds: number }): { url: string; cookie: string } {
  if (!stravaConnectConfigured()) throw new GiftApiError("NOT_CONFIGURED", "Connecting Strava is not switched on yet. Nothing was changed.", 503);
  const nonce = newConnectNonce();
  const state = sealConnectState({ giftId: input.giftId, account: getAddress(input.account).toLowerCase(), source: "strava", verifier: "", nonce, issuedAt: input.nowSeconds });
  const url = stravaAuthorizeUrl({ clientId: stravaCredentials().clientId, redirectUri: stravaRedirectUri(input.requestUrl), state: nonce });
  return { url, cookie: connectCookie(state, CONNECT_STATE_TTL_SECONDS) };
}

export type CallbackOutcome = Readonly<{ giftId: string; ok: true }> | Readonly<{ giftId: string | null; ok: false; code: string }>;

/** The code Strava sent back, turned into a sealed connection on the gift the cookie names. Never throws: the answer is a redirect. */
export async function finishStravaConnection(input: { code: string | null; state: string | null; scope: string | null; cookieHeader: string | null; account: string; nowSeconds: number }): Promise<CallbackOutcome> {
  const sealed = connectCookieValue(input.cookieHeader);
  if (!sealed) return { giftId: null, ok: false, code: "NO_STATE" };
  let state;
  try {
    state = openConnectState(sealed, input.nowSeconds);
  } catch (error) {
    return { giftId: null, ok: false, code: error instanceof ConnectStateError ? error.code : "INVALID" };
  }
  if (state.source !== "strava" || !input.state || state.nonce !== input.state) return { giftId: state.giftId, ok: false, code: "STATE_MISMATCH" };
  if (state.account !== getAddress(input.account).toLowerCase()) return { giftId: state.giftId, ok: false, code: "OTHER_ACCOUNT" };
  if (!input.code) return { giftId: state.giftId, ok: false, code: "REFUSED_AT_STRAVA" };
  // What the person allowed comes back beside the code: without the activities, no day could ever be read.
  if (!stravaScopeAllows(input.scope)) return { giftId: state.giftId, ok: false, code: "SCOPE_MISSING" };
  try {
    await stravaGiftOf(state.giftId, state.account);
  } catch {
    return { giftId: state.giftId, ok: false, code: "NOT_RECIPIENT" };
  }
  try {
    const tokens = await exchangeStravaCode({ code: input.code, scope: String(input.scope), nowSeconds: input.nowSeconds });
    await saveConnection({
      giftId: state.giftId,
      source: "strava",
      externalId: tokens.athleteId,
      accessToken: sealSecret(tokens.accessToken),
      refreshToken: sealSecret(tokens.refreshToken),
      expiresAt: new Date(tokens.expiresAt * 1_000),
      scope: tokens.scope,
    });
    await markConnectedAccount(state.giftId, tokens.athleteId);
    return { giftId: state.giftId, ok: true };
  } catch (error) {
    return { giftId: state.giftId, ok: false, code: error instanceof StravaError ? error.code : "EXCHANGE_FAILED" };
  }
}

/** The key given back to Strava, then the row erased whether or not Strava answered (rule 3): nothing of theirs stays. */
export async function disconnectStrava(giftId: string): Promise<{ erased: boolean; revoked: boolean }> {
  const connection = await loadConnection(giftId);
  if (!connection) return { erased: false, revoked: false };
  let revoked = false;
  try {
    // The refresh key: an access key lives a few hours, and revoking the refresh key revokes those made from it (V-10).
    await revokeStravaToken(openSecret(connection.refreshToken));
    revoked = true;
  } catch {
    revoked = false;
  }
  const erased = await eraseConnection(giftId);
  // The source's ids kept on the gift go too: nothing of theirs stays (the founder, 29 Sep 2026).
  await forgetConnectedAccount(giftId);
  return { erased, revoked };
}
