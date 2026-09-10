import "dotenv/config";
import { readGift, readNextGiftId } from "../src/gift-reader";
import { relayDrain, relayFinalise, relayRefund } from "../src/gift-relay";
import { escrowAddress, relayerClients, relayerPreflight, RelayerError } from "../src/relayer";

/**
 * The self-run keeper (the organisers' own recommendation while Chainlink Automation is not confirmed on
 * Monad): once a day, drains every gift whose catch-up window has elapsed, finalises the ones past their
 * last day, and sends back what is refundable. Every step is a relayed transaction with an explicit gas
 * limit, waited to finality. A contract refusal (nothing to drain yet, too early) is normal and logged.
 *
 * Usage: pnpm keeper [--refund]
 */

async function main() {
  const refund = process.argv.includes("--refund");
  const clients = relayerClients();
  const { balance } = await relayerPreflight(clients);
  const escrow = escrowAddress();
  const next = await readNextGiftId(escrow, clients.publicClient);
  console.log(JSON.stringify({ relayer: clients.address, balanceWei: balance.toString(), gifts: Number(next) - 1 }));

  for (let id = 1n; id < next; id += 1n) {
    const giftId = id.toString();
    const gift = await readGift(escrow, giftId, clients.publicClient);
    if (gift.cancelled || gift.finalised || gift.startDay === 0) {
      console.log(JSON.stringify({ giftId, skipped: gift.cancelled ? "cancelled" : gift.finalised ? "finalised" : "no baseline" }));
      continue;
    }
    await attempt("drain", giftId, () => relayDrain(giftId));
    await attempt("finalise", giftId, () => relayFinalise(giftId));
    if (refund) await attempt("refund", giftId, () => relayRefund(giftId));
  }
}

async function attempt(kind: string, giftId: string, action: () => Promise<{ hash: string }>): Promise<void> {
  try {
    const result = await action();
    console.log(JSON.stringify({ giftId, kind, hash: result.hash }));
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") {
      console.log(JSON.stringify({ giftId, kind, refused: error.contractError ?? "unknown" }));
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("KEEPER_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
