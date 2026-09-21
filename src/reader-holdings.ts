import { erc20Abi, type Hex } from "viem";
import { COINS, isNative } from "./coins";
import { giftPublicClient } from "./gift-reader";

/**
 * What an account holds, read on the server while a page renders (D160).
 *
 * Home used to print three dots where the money goes and read the balance from the browser, which on a phone is a
 * request that leaves after the page has been downloaded, parsed and hydrated. The server already knows who is
 * signed in, and it is nearer the chain than the phone is: it reads the three coins while it draws the page, and
 * the amount is in the first byte.
 *
 * Amounts leave here as strings. A number with more digits than a double can hold does not cross from a server
 * component to a browser one, and a balance is exactly that kind of number.
 */

export type HeldAmounts = Readonly<Record<string, string>>;

export async function heldBy(account: string): Promise<HeldAmounts | null> {
  const client = giftPublicClient();
  const address = account as Hex;
  try {
    const read = await Promise.all(
      COINS.map((coin) =>
        isNative(coin) ? client.getBalance({ address }) : client.readContract({ address: coin.address, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      ),
    );
    return Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index].toString()]));
  } catch {
    // A chain that cannot be reached is a screen that reads the balance from the browser instead, as it always did.
    return null;
  }
}
