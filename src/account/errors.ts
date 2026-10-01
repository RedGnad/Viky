import { isMeraError } from "@category-labs/mera";
import InAppSpy from "inapp-spy";
import { ApiError } from "../client/api";

export type AccountErrorCode =
  | "PRF_UNAVAILABLE"
  | "PASSKEY_CANCELLED"
  | "NOT_SECURE_CONTEXT"
  | "SESSION_ENDED"
  | "NO_CREDENTIAL"
  | "NOT_IN_BROWSER"
  | "UNSUPPORTED_BROWSER"
  | "TIMED_OUT"
  | "RATE_LIMITED"
  | "OTHER_ACCOUNT"
  | "MADE_ELSEWHERE"
  | "UNKNOWN";

/**
 * Every account failure is typed and carries the sentence the person sees. Refusal case 3 of the
 * spec (a passkey provider without PRF) is `PRF_UNAVAILABLE`: it is a refusal with a way out, never
 * a dead end.
 */
export class AccountError extends Error {
  readonly code: AccountErrorCode;
  readonly guidance: string;

  constructor(code: AccountErrorCode, guidance: string, options?: { cause?: unknown }) {
    super(`${code}: ${guidance}`, options);
    this.name = "AccountError";
    this.code = code;
    this.guidance = guidance;
  }
}

const GUIDANCE: Record<AccountErrorCode, string> = {
  PRF_UNAVAILABLE:
    "This passkey provider cannot protect a Viky account. Save your passkey with iCloud Keychain, Google Password Manager or 1Password, then try again.",
  PASSKEY_CANCELLED: "The passkey prompt was closed before it finished. Try again when you are ready.",
  NOT_SECURE_CONTEXT: "Viky needs a secure connection (https) to create your account.",
  SESSION_ENDED: "You were signed out. Sign in again to continue.",
  NO_CREDENTIAL: "No account is saved on this device yet. Create one, or sign in with a passkey you already have.",
  NOT_IN_BROWSER: "Accounts can only be created in a browser.",
  UNSUPPORTED_BROWSER:
    "This browser cannot create a passkey for Viky. Copy the link and open it in Chrome (Android) or Safari (iPhone), then try again.",
  TIMED_OUT: "Your device did not answer. If this page is open inside another app, open it in Chrome or Safari; otherwise check your connection and try again.",
  // The server's own limit, said as what it is. It used to arrive as UNKNOWN, which told somebody signing back
  // in to their money that something had gone wrong on our side (design pass, screen 3.3).
  RATE_LIMITED: "Too many sign-ins in ten minutes. Wait a few minutes, then sign in again.",
  // The passkey that answered is not the one of the account this browser is signed in to (src/client/consent.ts).
  OTHER_ACCOUNT: "That passkey opens another account. Use the passkey of the account you are signed in to, then try again.",
  // An address that is not Viky's own: no account is made there, since its passkey would open nowhere else.
  MADE_ELSEWHERE: "Accounts are created on viky.cash. An account already made here still signs in.",
  UNKNOWN: "Something went wrong on our side. Nothing was changed. Please try again.",
};

export function isAccountError(error: unknown): error is AccountError {
  return error instanceof AccountError;
}

/** Maps any thrown value to an `AccountError`; Mera error codes keep their meaning. */
export function toAccountError(error: unknown): AccountError {
  if (isAccountError(error)) return error;
  // The server's sign-in routes refuse a burst with a typed 429; nothing else they say is for the person.
  if (error instanceof ApiError && (error.code === "RATE_LIMITED" || error.status === 429)) {
    return new AccountError("RATE_LIMITED", GUIDANCE.RATE_LIMITED, { cause: error });
  }
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return new AccountError("PRF_UNAVAILABLE", GUIDANCE.PRF_UNAVAILABLE, { cause: error });
      case "PASSKEY_OPERATION_FAILED":
        return new AccountError("PASSKEY_CANCELLED", GUIDANCE.PASSKEY_CANCELLED, { cause: error });
      case "CRYPTO_UNAVAILABLE":
        return new AccountError("NOT_SECURE_CONTEXT", GUIDANCE.NOT_SECURE_CONTEXT, { cause: error });
      case "SESSION_ENDED":
        return new AccountError("SESSION_ENDED", GUIDANCE.SESSION_ENDED, { cause: error });
      default:
        return new AccountError("UNKNOWN", GUIDANCE.UNKNOWN, { cause: error });
    }
  }
  return new AccountError("UNKNOWN", GUIDANCE.UNKNOWN, { cause: error });
}

export function accountError(code: AccountErrorCode): AccountError {
  return new AccountError(code, GUIDANCE[code]);
}

/** The phone a page is read on, as far as its own browser's name goes: Safari on one, the phone's own on the other. */
export type Handset = "iphone" | "android" | "other";

export function handsetOf(userAgent: string): Handset {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** The version of iOS an iPhone names, or nothing: for anything else, and for an iPad that says it is a Mac. */
export function iosVersionOf(userAgent: string): number | null {
  const named = /(?:iPhone|iPad|iPod)[^)]*? OS (\d+)_/.exec(userAgent);
  return named ? Number(named[1]) : null;
}

/** Pages our own list knows and the general test below does not name: browsers built on an app's page, mostly. */
const KNOWN_APP_PAGES = /; ?wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|BytedanceWebview|Telegram|GSA\/|DuckDuckGo\/[0-9]+ Mobile/i;

/** The app a page is inside: its key as the test names it ("instagram", "whatsapp"), or "app" when it has no name. */
export type EmbeddedApp = Readonly<{ key: string; name: string | null }>;

/**
 * The app whose own page a link was opened in, when it is one: a messaging or social app showing a link inside itself.
 *
 * By a general test and not by a list of names alone (the founder, 1 Oct 2026): `inapp-spy` knows the apps by name,
 * WhatsApp, LinkedIn, X and the rest, and beside them any page an Android app draws and any iPhone page that is not
 * a browser. That last one is also what Viky's own app answers once it is installed on an iPhone's home screen, which
 * is no other app's page: so it counts only where the page is known not to be the installed app. `standalone` says
 * so, and is null where it cannot be known, on the server, which then leaves that case to the browser.
 */
export function embeddedIn(userAgent: string, standalone: boolean | null = null): EmbeddedApp | null {
  if (!userAgent) return null;
  const spied = InAppSpy({ ua: userAgent });
  if (spied.isInApp && spied.appKey) return { key: spied.appKey, name: spied.appName ?? null };
  if (KNOWN_APP_PAGES.test(userAgent)) return { key: "app", name: null };
  if (!spied.isInApp) return null;
  const onlyByNotBeingSafari = handsetOf(userAgent) === "iphone" && !/WebView/i.test(userAgent);
  return onlyByNotBeingSafari && standalone !== false ? null : { key: "app", name: null };
}

/**
 * Pure check of the browser environment, testable without a DOM. In-app browsers (a messaging or
 * mail app opening a link inside itself) either lack WebAuthn or never answer the passkey prompt,
 * which the person sees as an endless "One moment". Refuse early, with the way out.
 */
export function passkeyEnvironmentProblem(userAgent: string, hasWebAuthn: boolean, standalone: boolean | null = null): AccountErrorCode | undefined {
  if (!hasWebAuthn) return "UNSUPPORTED_BROWSER";
  // OEM browsers outside Mera's authenticator matrix; Mi Browser was observed on 11 Sep 2026 to open
  // no passkey prompt at all (the page waited forever).
  const oemBrowser = /MiuiBrowser|XiaoMi\/|UCBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser/i.test(userAgent);
  return embeddedIn(userAgent, standalone) !== null || oemBrowser ? "UNSUPPORTED_BROWSER" : undefined;
}
