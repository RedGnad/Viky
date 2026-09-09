import { isMeraError } from "@category-labs/mera";

export type AccountErrorCode =
  | "PRF_UNAVAILABLE"
  | "PASSKEY_CANCELLED"
  | "NOT_SECURE_CONTEXT"
  | "SESSION_ENDED"
  | "NO_CREDENTIAL"
  | "NOT_IN_BROWSER"
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
  UNKNOWN: "Something went wrong on our side. Nothing was changed. Please try again.",
};

export function isAccountError(error: unknown): error is AccountError {
  return error instanceof AccountError;
}

/** Maps any thrown value to an `AccountError`; Mera error codes keep their meaning. */
export function toAccountError(error: unknown): AccountError {
  if (isAccountError(error)) return error;
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
