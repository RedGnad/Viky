import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./database-guard";
import type { SqlExecutor } from "./proof-session-store";
import { type DisplayCurrency, isDisplayCurrency } from "./display-currency";

/**
 * What an account chose for itself, kept on the server so it follows the account from one device to the next.
 *
 * One row per account and one thing in it so far: the display currency (decision 1 of the design pass,
 * 17 Sep 2026). A row exists only once the person changed something on the account page; until then the
 * device proposes and nothing is written, because a proposal is not a choice.
 */

export const PREFERENCES_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_accounts (
  account text PRIMARY KEY,
  display_currency text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE viky_accounts ADD COLUMN IF NOT EXISTS appearance text;
`;

let executor: SqlExecutor | undefined;

export function configurePreferencesStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  const url = databaseUrl();
  return neon(url) as unknown as SqlExecutor;
}

export async function ensurePreferencesSchema(): Promise<void> {
  for (const statement of PREFERENCES_SCHEMA.split(";")) {
    const text = statement.trim();
    if (!text) continue;
    const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
    await sql()(strings);
  }
}

/** Day or night, when somebody chose one; nothing while their device still decides (D159). */
export type Appearance = "light" | "dark";

export const isAppearance = (value: unknown): value is Appearance => value === "light" || value === "dark";

export type Preferences = Readonly<{ displayCurrency: DisplayCurrency | null; appearance: Appearance | null }>;

export async function loadPreferences(account: string): Promise<Preferences> {
  const rows = await sql()`SELECT display_currency, appearance FROM viky_accounts WHERE account = ${account.toLowerCase()}`;
  const stored = rows[0]?.display_currency;
  return { displayCurrency: isDisplayCurrency(stored) ? stored : null, appearance: isAppearance(rows[0]?.appearance) ? rows[0].appearance : null };
}

/**
 * Day or night, kept with the account (D159). The device keeps it too, and answers first, because it answers
 * before anything is painted; this is what carries the choice to the next device, and back after a browser has
 * forgotten. Nothing is stored until somebody presses: a person whose device decides has chosen that.
 */
export async function saveAppearance(account: string, appearance: Appearance): Promise<void> {
  await sql()`
    INSERT INTO viky_accounts (account, appearance, updated_at)
    VALUES (${account.toLowerCase()}, ${appearance}, now())
    ON CONFLICT (account) DO UPDATE SET appearance = EXCLUDED.appearance, updated_at = now()`;
}

export async function saveDisplayCurrency(account: string, currency: DisplayCurrency): Promise<void> {
  await sql()`
    INSERT INTO viky_accounts (account, display_currency, updated_at)
    VALUES (${account.toLowerCase()}, ${currency}, now())
    ON CONFLICT (account) DO UPDATE SET display_currency = EXCLUDED.display_currency, updated_at = now()`;
}
