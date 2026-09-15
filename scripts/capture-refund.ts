import "../src/load-env";
import { erc20Abi, formatUnits, getAddress, type Hex } from "viem";
import { readGift } from "../src/gift-reader";
import { loadAllGifts, loadRelayed } from "../src/gift-store";
import { AUSD_ADDRESS } from "../src/monad/chain";
import { escrowOf, relayerClients } from "../src/relayer";

/**
 * Writes down what happened when a missed day came back on its own.
 *
 * This is the one leg of the product nobody performs: no screen is tapped, no signature is asked for, a
 * keeper wakes at seven and a day that was not earned returns to the person who paid for it. There is
 * nothing to watch while it happens, so the evidence has to be collected afterwards, from the chain and from
 * our own record of what the keeper sent. Run it after a settling pass.
 *
 * It states what it found and nothing more. A gift with nothing drained says so, rather than being dressed
 * up as a refund that has not happened.
 */

const DAY = 86_400;

function dayName(day: number): string {
  return new Date(day * DAY * 1_000).toISOString().slice(0, 10);
}

async function main() {
  const clients = relayerClients();
  const gifts = await loadAllGifts();
  if (gifts.length === 0) {
    console.log("no gift recorded");
    return;
  }

  for (const record of gifts) {
    const escrow = escrowOf(record);
    const gift = await readGift(escrow, record.giftId, clients.publicClient);
    const relayed = await loadRelayed(record.giftId);
    const settling = relayed.filter((r) => r.kind === "drain" || r.kind === "refund" || r.kind === "finalise");

    console.log(`\n=== gift ${record.giftId} =============================================`);
    console.log(`  worth          $${formatUnits(gift.amount, 6)} over ${gift.durationDays} days, $${formatUnits(gift.perDay, 6)} a day`);
    console.log(`  window         ${dayName(gift.startDay)} to ${dayName(gift.endDay)}`);
    console.log(`  earned         ${gift.creditedDays} day(s)`);
    console.log(`  missed         ${gift.drainedDays} day(s)`);
    console.log(`  sent back      $${formatUnits(gift.refundedToFunder, 6)}`);
    // `refundable` is a running total of everything that has ever become refundable, not what is left to
    // send: the contract sends `refundable - refundedToFunder`, which it exposes as `refundableBalance`.
    // Printing the total under "waiting to go" said a refund was still owed the moment after it was paid.
    console.log(`  waiting to go  $${formatUnits(gift.refundableBalance, 6)}`);

    if (gift.drainedDays === 0) {
      console.log("  nothing has been settled as missed yet, so there is nothing to show");
    }
    if (settling.length === 0) {
      console.log("  no settling transaction recorded");
    }
    for (const line of settling) {
      console.log(`  ${line.kind.padEnd(9)} ${line.txHash}${line.blockNumber !== null ? ` block ${line.blockNumber}` : ""}`);
    }

    const funder = getAddress(gift.refundTo);
    const held = (await clients.publicClient.readContract({
      address: AUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [funder as Hex],
    })) as bigint;
    console.log(`  the person who paid now holds $${formatUnits(held, 6)}`);
  }
}

main().catch((error) => {
  console.error("CAPTURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
