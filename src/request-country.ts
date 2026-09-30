import { readAccountAuthSession } from "./account-auth-server";
import { loadPreferences } from "./preferences-store";

/** The country the signed-in account keeps (D274), or nothing for a visitor, an account that has none, or a failed read. */
export async function countryOfAccount(request: Request): Promise<string | null> {
  try {
    const { account } = readAccountAuthSession(request);
    return (await loadPreferences(account)).country;
  } catch {
    return null;
  }
}
