import { readAccountAuthSession } from "./account-auth-server";
import { payerCountry } from "./card-rail";
import { loadPreferences } from "./preferences-store";
import { countryCode } from "./rail-country";

/** The country the signed-in account keeps (D274), or nothing for a visitor, an account that has none, or a failed read. */
export async function countryOfAccount(request: Request): Promise<string | null> {
  try {
    const { account } = readAccountAuthSession(request);
    return (await loadPreferences(account)).country;
  } catch {
    return null;
  }
}

/**
 * The country a request is taken to come from: the account's own when it keeps one, otherwise the one the platform reads
 * from the connection (`x-vercel-ip-country`), otherwise nothing. Lowercase, as the account keeps it.
 */
export async function countryOfRequest(request: Request): Promise<string | null> {
  return payerCountry({ account: await countryOfAccount(request), connection: countryCode(request.headers.get("x-vercel-ip-country")) });
}
