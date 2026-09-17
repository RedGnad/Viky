import { neon } from "@neondatabase/serverless";
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
`;

let executor: SqlExecutor | undefined;

export function configurePreferencesStore(custom: SqlExecutor | undefined): void {
  executor = custom;
}

function sql(): SqlExecutor {
  if (executor) return executor;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured");
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

export type Preferences = Readonly<{ displayCurrency: DisplayCurrency | null }>;

export async function loadPreferences(account: string): Promise<Preferences> {
  const rows = await sql()`SELECT display_currency FROM viky_accounts WHERE account = ${account.toLowerCase()}`;
  const stored = rows[0]?.display_currency;
  return { displayCurrency: isDisplayCurrency(stored) ? stored : null };
}

export async function saveDisplayCurrency(account: string, currency: DisplayCurrency): Promise<void> {
  await sql()`
    INSERT INTO viky_accounts (account, display_currency, updated_at)
    VALUES (${account.toLowerCase()}, ${currency}, now())
    ON CONFLICT (account) DO UPDATE SET display_currency = EXCLUDED.display_currency, updated_at = now()`;
}
