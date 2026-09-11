import { readGift, readNextGiftId } from "./gift-reader";
import { relayDrain, relayFinalise, relayRefund } from "./gift-relay";
import { loadBoundGifts } from "./gift-store";
import { runPublicCheckIn, type PublicCheckInOutcome } from "./duolingo-public-checkin";
import { escrowAddress, relayerClients, relayerPreflight, RelayerError } from "./relayer";

/**
 * The daily pass of the keeper (D27): count every bound gift from its public profile, then drain the
 * days whose catch-up window has closed, finalise ended gifts, and optionally send back what is
 * refundable. Run by `pnpm keeper` and by the daily cron route. Every line of the report is one
 * relayed transaction, a typed refusal, or a skip with its reason; nothing is silent.
 */

export type DailyPassLine = { giftId: string; step: "count" | "drain" | "finalise" | "refund"; result: string; hash?: string };

export async function dailyPass(options: { refund?: boolean; now?: () => number } = {}): Promise<{ relayer: string; balanceWei: string; lines: DailyPassLine[] }> {
  const clients = relayerClients();
  const { balance } = await relayerPreflight(clients);
  const escrow = escrowAddress();
  const lines: DailyPassLine[] = [];

  for (const gift of await loadBoundGifts()) {
    const outcome: PublicCheckInOutcome = await runPublicCheckIn({ giftId: gift.giftId, purpose: "count" });
    lines.push(describe(outcome));
  }

  const next = await readNextGiftId(escrow, clients.publicClient);
  for (let id = 1n; id < next; id += 1n) {
    const giftId = id.toString();
    const gift = await readGift(escrow, giftId, clients.publicClient);
    if (gift.cancelled || gift.finalised || gift.startDay === 0) continue;
    lines.push(await attempt(giftId, "drain", () => relayDrain(giftId)));
    lines.push(await attempt(giftId, "finalise", () => relayFinalise(giftId)));
    if (options.refund) lines.push(await attempt(giftId, "refund", () => relayRefund(giftId)));
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
