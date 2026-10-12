/**
 * Opens a line offered on request (src/on-request.ts): the operator's one line, with no deployment.
 *
 *   pnpm source:open strava-daily
 *
 * Before it, for Strava: the subscription taken with the account that owns the application, and the application
 * reactivated in Strava's API settings and raised to ten athletes. After it the line is open like the others: "On
 * request" leaves the choice, the public page and the judges page, and a gift that waited offers its person to connect.
 *
 * In production, with the operator's environment: VIKY_ALLOW_PRODUCTION_DATABASE=1 before the command. DRY_RUN=1 says
 * what it would do and writes nothing. PROVEN_BY names the operator's account in the row, when it is set.
 */
import { conditionById } from "../src/conditions";
import { loadAllGifts } from "../src/gift-store";
import { giftOnChain } from "../src/on-request-pass";
import { giftsAsking, linesOnRequest, openOnRequest, readyByInWords, waitingToBeOpened } from "../src/on-request";

async function main(): Promise<void> {
  const conditionId = process.argv[2]?.trim();
  const onRequest = linesOnRequest().map((line) => line.id);
  if (!conditionId || !onRequest.includes(conditionId)) throw new Error(`Usage: pnpm source:open <line>. Lines offered on request: ${onRequest.join(", ") || "none"}.`);
  const condition = conditionById(conditionId)!;
  const waiting = await waitingToBeOpened();
  // The gifts that wait for it, read before it opens: afterwards none waits.
  const asking = waiting.has(conditionId) ? (await giftsAsking({ gifts: loadAllGifts, onChain: giftOnChain })).filter((gift) => gift.conditionId === conditionId) : [];
  if (process.env.DRY_RUN === "1") {
    console.log(`${condition.source} would be opened (${waiting.has(conditionId) ? "it is on request" : "it is open already"}). Nothing was written.`);
  } else {
    const outcome = await openOnRequest(conditionId, process.env.PROVEN_BY?.trim() || null);
    console.log(outcome === "opened" ? `${condition.source} is open: it is offered like the other lines, and its gifts can connect.` : `${condition.source} was open already. Nothing was changed.`);
  }
  for (const gift of asking) console.log(`Gift ${gift.giftId} waited for it: its two people read that it is ready by ${readyByInWords(gift.fundedAt)}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
