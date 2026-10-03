import { catchUpSecondsOf } from "./catch-up";
import { readAsTheDayGoes } from "./daily-count";
import { countableUntil } from "./days-waiting";
import { giftLimitFor } from "./gift-limit";
import { GiftApiError } from "./gift-api";
import { dailyEnded, dailyEndOffer } from "./gift-ending";
import { checkInDayIndex, formatAusd, readGift, utcDayOf } from "./gift-reader";
import { lastRefundAt, loadGift, loadRelayed, loadSettledDays, reconcileClaim } from "./gift-store";
import { holdsTheLinkOf } from "./v2-opening";
import { isMilestoneGiftId } from "./milestone-protocol";
import { milestoneStatusFor } from "./milestone-routes";
import { escrowOf } from "./relayer";
import type { GiftStatus } from "./client/gift";
import type { MilestoneStatus } from "./milestone-view";

/**
 * The state of a gift, for whoever is reading it, with no HTTP around it.
 *
 * It used to live inside the route, so the only way to a gift's state was a request from the browser: the page came
 * as an empty screen saying "One moment", the browser then asked for the gift, and the screen was built a second
 * time when the answer came. Measured on a phone (D160): the entrance played at 538 ms on the waiting screen and
 * again at 1,337 ms on the real one. The page is a server component and can read this while it renders, so the
 * screen arrives once, with the gift in it.
 */

export type AnyGiftStatus = GiftStatus | MilestoneStatus;

/** Who is reading: the account the session names, if any, and the key the link carries, if it was opened from one. */
export type GiftReader = Readonly<{ account: string | null; linkKey: string | null }>;

export async function giftStatusFor(id: string, reader: GiftReader): Promise<AnyGiftStatus> {
  if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  const [record, relayed, recordedDays, refundedAt] = await Promise.all([loadGift(id), loadRelayed(id), loadSettledDays([id]), lastRefundAt(id)]);
  if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  // A milestone gift has its own contract and its own shape of state (C2): `kind: "milestone"` tells the page.
  if (isMilestoneGiftId(id)) return await milestoneStatusFor(record, reader);

  const escrow = escrowOf(record);
  const gift = await readGift(escrow, id);
  // An opening the contract holds and the database missed is written down as the gift is read.
  await reconcileClaim(record, gift.recipient, relayed.find((entry) => entry.kind === "claim")?.txHash ?? null);
  const now = Math.floor(Date.now() / 1_000);
  const today = utcDayOf(now);
  const missedSoFar = gift.drainedDays;
  const opened = gift.recipient !== null;
  const connected = gift.startDay !== 0;
  const account = reader.account?.toLowerCase() ?? null;
  const viewerIsRecipient = account !== null && gift.recipient !== null && account === gift.recipient.toLowerCase();
  const viewerIsFunder = account !== null && account === gift.funder.toLowerCase();
  const holdsTheLink = holdsTheLinkOf(record, reader.linkKey);
  const names = viewerIsRecipient || viewerIsFunder || holdsTheLink ? { recipientName: record.recipientName, funderName: record.funderName } : null;
  // The account read goes only where the names go: gift numbers follow each other (the founder, 29 Sep 2026).
  const goalAccount = {
    username: names ? (record?.goalUsername ?? null) : null,
    source: record?.usernameSource ?? null,
    bound: record?.boundAt !== null && record?.boundAt !== undefined,
    code: viewerIsRecipient ? (record?.bindingCode ?? null) : null,
    codeExpiresAt: viewerIsRecipient ? (record?.bindingCodeExpiresAt?.toISOString() ?? null) : null,
  };
  return {
    giftId: id,
    // Which side of the gift the person reading this is on. Without it every screen showed the
    // recipient's words and the recipient's buttons to whoever was signed in, and a funder was offered a
    // "take it" the contract then refused.
    youAreTheRecipient: viewerIsRecipient,
    // Before anybody opens the gift the recipient is nobody, so "not the recipient" also describes the funder;
    // the page needs to know which of the two is reading (decision 13 of the drawn flows).
    youAreTheFunder: viewerIsFunder,
    kind: "daily",
    // How long a day stays catchable on the contract that holds this gift. The two live contracts do not
    // agree, which is a defect recorded in D50, so the screen is told rather than left to assume.
    catchUpSeconds: catchUpSecondsOf(escrow),
    // Used by the recipient's browser to sign a withdraw intent for the right contract; never displayed.
    escrow,
    goalAccount,
    names,
    goalType: gift.goalType,
    dailyTarget: gift.dailyTarget,
    durationDays: gift.durationDays,
    amount: gift.amount.toString(),
    amountDisplay: formatAusd(gift.amount),
    perDay: gift.perDay.toString(),
    perDayDisplay: formatAusd(gift.perDay),
    opened,
    connected,
    cancelled: gift.cancelled,
    finished: gift.finalised,
    creditedDays: gift.creditedDays,
    missedDays: missedSoFar,
    daysLeft: connected ? Math.max(0, gift.endDay - Math.max(today - 1, gift.settledThroughDay)) : gift.durationDays,
    earned: gift.earnedBalance.toString(),
    earnedDisplay: formatAusd(gift.earnedBalance),
    alreadyTheirs: (BigInt(gift.creditedDays) * gift.perDay).toString(),
    alreadyTheirsDisplay: formatAusd(BigInt(gift.creditedDays) * gift.perDay),
    returned: gift.refundedToFunder.toString(),
    returnedDisplay: formatAusd(gift.refundedToFunder),
    // What the recipient has already taken out of the gift, as the contract counts it.
    takenDisplay: formatAusd(gift.withdrawnByRecipient),
    // Which settled day was earned and which went back, from the keeper's record (D86); days settled before the
    // record existed are absent and the page falls back to the counts for them.
    days: recordedDays.get(id) ?? [],
    // When missed days were last sent back to the funder: the time of the last refund Viky relayed.
    lastReturnAtMs: refundedAt ? refundedAt.getTime() : null,
    claimedAtChain: gift.claimedAt,
    returnable: gift.refundableBalance.toString(),
    todayDayIndex: checkInDayIndex(gift, now),
    startDay: gift.startDay,
    endDay: gift.endDay,
    withdrawNonce: gift.withdrawNonce.toString(),
    funderIsRecipient: gift.recipient !== null && gift.recipient.toLowerCase() === gift.funder.toLowerCase(),
    recorded: relayed.map((entry) => ({ kind: entry.kind, txHash: entry.txHash, blockNumber: entry.blockNumber?.toString() ?? null })),
    createdAtChain: gift.fundedAt,
    hasRecord: record !== null,
    version: gift.version,
    // Read as the day goes (src/daily-count.ts): the page looks as it opens, and a lesson is paid the day it is done.
    readLive: readAsTheDayGoes(record),
    end: dailyEndOffer(gift, viewerIsRecipient),
    ended: dailyEnded(gift),
    givenBackDays: gift.givenBackDays,
    // The month's limit of readings, when it is reached and this gift is still running (src/gift-limit.ts).
    limit: await giftLimitFor(!gift.finalised && !gift.cancelled, () => countableUntil(gift, now, catchUpSecondsOf(escrow))),
  } as GiftStatus;
}
