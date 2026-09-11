import type { Hex } from "viem";
import { readGift } from "./gift-reader";
import { relayDrain, relayFinalise, relayRefund } from "./gift-relay";
import { loadAllGifts, loadBoundGifts } from "./gift-store";
import { runPublicCheckIn, type PublicCheckInOutcome } from "./duolingo-public-checkin";
import { escrowOf, relayerClients, relayerPreflight, RelayerError } from "./relayer";

/**
 * The daily pass of the keeper (D27): count every bound gift from its public profile, then drain the
 * days whose catch-up window has closed, finalise ended gifts, and optionally send back what is
 * refundable. Every line of the report is one relayed transaction, a typed refusal, or a skip with its
 * reason; nothing is silent.
 *
 * It runs twice a day, and the split matters (D35). The counting pass runs just after midnight UTC, so a
 * reading credits everything earned up to the end of yesterday, as late as a recipient can legitimately
 * be. Settling cannot run then: a day only becomes drainable six hours later (D30), so draining at
 * midnight would leave it open for another whole day, and the next morning's reading could pay for a day
 * whose catch-up had already expired. A second pass after the grace, with `count: false`, settles those
 * days at the moment D13 allows, without making the counting pass less forgiving.
 */

export type DailyPassLine = { giftId: string; step: "count" | "drain" | "finalise" | "refund"; result: string; hash?: string };

export async function dailyPass(
  options: { refund?: boolean; count?: boolean; now?: () => number } = {},
): Promise<{ relayer: string; balanceWei: string; lines: DailyPassLine[] }> {
  const clients = relayerClients();
  const { balance } = await relayerPreflight(clients);
  const lines: DailyPassLine[] = [];

  for (const gift of options.count === false ? [] : await loadBoundGifts()) {
    const outcome: PublicCheckInOutcome = await runPublicCheckIn({ giftId: gift.giftId, purpose: "count" });
    lines.push(describe(outcome));
  }

  for (const record of await loadAllGifts()) {
    const giftId = record.giftId;
    let escrow: Hex;
    try {
      escrow = escrowOf(record);
    } catch (error) {
      // One unreadable record must never stop the pass for every other gift.
      lines.push({ giftId, step: "drain", result: error instanceof Error ? error.message : "no contract recorded" });
      continue;
    }
    const gift = await readGift(escrow, giftId, clients.publicClient);
    if (gift.cancelled || gift.finalised || gift.startDay === 0) continue;
    lines.push(await attempt(giftId, "drain", () => relayDrain(giftId, escrow)));
    lines.push(await attempt(giftId, "finalise", () => relayFinalise(giftId, escrow)));
    if (options.refund) lines.push(await attempt(giftId, "refund", () => relayRefund(giftId, escrow)));
  }
  return { relayer: clients.address, balanceWei: balance.toString(), lines };
}

function describe(outcome: PublicCheckInOutcome): DailyPassLine {
  switch (outcome.kind) {
    case "counted":
      return { giftId: outcome.giftId, step: "count", result: `counted, ${outcome.creditedDays} day(s) credited, ${outcome.totalXp} XP`, hash: outcome.hash };
    case "bound":
      return { giftId: outcome.giftId, step: "count", result: `bound, ${outcome.totalXp} XP`, hash: outcome.hash };
    case "already":
      return { giftId: outcome.giftId, step: "count", result: `skipped: ${outcome.reason}` };
    case "refused":
      return { giftId: outcome.giftId, step: "count", result: `refused: ${outcome.code}${outcome.totalXp !== undefined ? ` (${outcome.totalXp} XP)` : ""}` };
  }
}

async function attempt(giftId: string, step: "drain" | "finalise" | "refund", action: () => Promise<{ hash: string }>): Promise<DailyPassLine> {
  try {
    const result = await action();
    return { giftId, step, result: "sent", hash: result.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") return { giftId, step, result: `refused: ${error.contractError ?? "unknown"}` };
    throw error;
  }
}
