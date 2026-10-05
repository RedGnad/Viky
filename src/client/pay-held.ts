import type { Hex } from "viem";
import { USDC } from "../coins";
import { chainCoinToChange } from "../funding-step";
import type { HeldParts } from "../pay-held";
import { usdcRouterAddress } from "../usdc-router";
import { postJson } from "./api";
import { loadMyGifts } from "./gift";
import { readAusdBalance, readCoinBalance, readMonBalance } from "./onchain";

type MyGifts = Awaited<ReturnType<typeof loadMyGifts>>["gifts"];

/**
 * Everything the pay sheet needs to know of an account before it names a way to pay (src/pay-held.ts): the three coins
 * read from the chain, the person's gifts, and the exchange's quote for the chain's own coin when the account holds
 * some worth changing. One reading, which fails whole: a part that could not be read is not counted as nothing.
 *
 * The quote alone may go unanswered without failing the reading. It is an outside service, and whether its coin matters
 * depends on the gift, which the sheet knows and this does not.
 */
export async function readHeldForPaying(address: Hex): Promise<Readonly<{ parts: HeldParts; gifts: MyGifts }>> {
  const [ausd, usdc, mon, mine] = await Promise.all([
    readAusdBalance(address),
    // Counted only where the step that changes it into what a gift holds exists, as the screen that waits reads it.
    usdcRouterAddress() ? readCoinBalance(USDC, address) : Promise.resolve(0n),
    readMonBalance(address),
    loadMyGifts(),
  ]);
  const coin = chainCoinToChange(mon);
  const coinWorth = coin === 0n ? null : await postJson<{ output: string }>("/api/fund/quote", { amount: coin.toString() }).then((quote) => BigInt(quote.output), () => null);
  const inGifts = mine.gifts.reduce((sum, gift) => sum + BigInt(gift.takeable ?? "0"), 0n);
  return { parts: { ausd, usdc, inGifts, coin, coinWorth }, gifts: mine.gifts };
}
