import { eraseConnection, loadConnection, type Connection } from "./connection-store";
import { openSecret } from "./connect-vault";
import { connectedLineOf } from "./connected-checkin";
import { revokeFitbitToken } from "./fitbit";
import { forgetConnectedAccount, loadGift } from "./gift-store";
import { deleteConnectedReadings } from "./proof-session-store";
import { revokeStravaToken } from "./strava";

/**
 * What is erased when a gift on a connected source is over (the founder, 2 Oct 2026): finished, cancelled, or ended
 * by the person it is for. Server only.
 *
 * Until now the only erasing was the person's own "Disconnect and erase": a gift that simply ran to its end left the
 * source's keys sealed in the database for good, with the source's id of the person and one row per morning. Nothing
 * reads any of it once the gift is over, so it goes:
 *
 *   - the access: the key is given back to the source, then the row is deleted whether or not the source answered;
 *   - the account's name and the source's id of it, on the gift's own row;
 *   - the rows of the morning readings, each a day, a yes or a no, and the message signed for the contract.
 *
 * What stays, on purpose: the journal of the days (which day was earned, which went back, and the transaction that
 * settled it: it is the public record of the money), the person's signed yes and stop, and everything on the chain,
 * which nobody can erase.
 *
 * The key given back is the refresh key (the audit of 1 Oct 2026, V-10): an access key lives a few hours, and a gift
 * ends hours after its last reading, so giving back an access key gave back nothing. Both sources take either key at
 * their revocation address, and revoking the refresh key revokes the access keys made from it (Strava's
 * authentication documentation and Google's OAuth documentation, read 2 Oct 2026).
 *
 * It can be asked any number of times: with nothing left to erase it erases nothing. The settling pass asks it again
 * each morning for every connected gift that is over, so an erasing that failed one day is done the next.
 */

export type EndErasure = Readonly<{
  giftId: string;
  /** "revoked": the source confirmed. "unconfirmed": the row is gone, the source did not answer. "none": there was no access left. */
  access: "revoked" | "unconfirmed" | "none";
  /** Whether the account's name or id were on the gift and were cleared. */
  accountForgotten: boolean;
  /** How many rows of morning readings were deleted. */
  readingsDeleted: number;
}>;

export type EndErasureDeps = Readonly<{
  /** The gift's goal and what it still holds of the account, or nothing when no such gift is recorded. */
  gift(giftId: string): Promise<Readonly<{ goalType: number; goalUsername: string | null; goalProfileId: string | null }> | null>;
  connection(giftId: string): Promise<Connection | null>;
  /** Gives the connection's key back to its source; throws when the source does not confirm. */
  revoke(connection: Connection): Promise<void>;
  eraseConnection(giftId: string): Promise<boolean>;
  forgetAccount(giftId: string): Promise<boolean>;
  deleteReadings(giftId: string): Promise<number>;
}>;

export function liveEndErasureDeps(): EndErasureDeps {
  return {
    gift: loadGift,
    connection: loadConnection,
    revoke: async (connection) => {
      const key = openSecret(connection.refreshToken);
      if (connection.source === "strava") await revokeStravaToken(key);
      else await revokeFitbitToken(key);
    },
    eraseConnection,
    forgetAccount: forgetConnectedAccount,
    deleteReadings: deleteConnectedReadings,
  };
}

/** Whether anything was there to erase: what the pass reports, and what it stays silent about. */
export function erasedSomething(erasure: EndErasure): boolean {
  return erasure.access !== "none" || erasure.accountForgotten || erasure.readingsDeleted > 0;
}

/**
 * Erases what a connected gift kept, once it is over. Nothing when the gift is not on a connected source: a gift on a
 * public page keeps the name its funder gave, which is the gift's own term and not an access.
 *
 * The caller answers for the gift being over: this function is told so, it does not read the chain.
 */
export async function eraseAtGiftEnd(giftId: string, deps: EndErasureDeps = liveEndErasureDeps()): Promise<EndErasure | null> {
  const gift = await deps.gift(giftId);
  if (!gift || !connectedLineOf(gift.goalType)) return null;
  let access: EndErasure["access"] = "none";
  const connection = await deps.connection(giftId);
  if (connection) {
    try {
      await deps.revoke(connection);
      access = "revoked";
    } catch {
      // The source did not confirm, or the key could not be opened: the row goes all the same, so nothing of theirs
      // stays here, and the report says the source did not answer.
      access = "unconfirmed";
    }
    await deps.eraseConnection(giftId);
  }
  const accountForgotten = gift.goalUsername !== null || gift.goalProfileId !== null ? await deps.forgetAccount(giftId) : false;
  const readingsDeleted = await deps.deleteReadings(giftId);
  return { giftId, access, accountForgotten, readingsDeleted };
}

/** One line for a pass's report, or nothing when there was nothing to erase. Never throws: an erasing that fails is said and tried again the next morning. */
export async function erasureLine(giftId: string, deps: EndErasureDeps = liveEndErasureDeps()): Promise<string | null> {
  try {
    const erasure = await eraseAtGiftEnd(giftId, deps);
    if (!erasure || !erasedSomething(erasure)) return null;
    const access = erasure.access === "revoked" ? "the access given back and erased" : erasure.access === "unconfirmed" ? "the access erased, its source did not confirm" : "no access left";
    return `${access}; ${erasure.accountForgotten ? "the account's name and id cleared" : "no name or id left"}; ${erasure.readingsDeleted} morning ${erasure.readingsDeleted === 1 ? "reading" : "readings"} deleted`;
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : "the erasing did not run"}`;
  }
}
