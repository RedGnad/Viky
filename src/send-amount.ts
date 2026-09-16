import { AUSD, exactly, type Coin } from "./coins";

/**
 * What a person types when they send money of their own, read to the last decimal the coin has (D75).
 *
 * Why it is not the gift's parser: a gift is typed in dollars and cents, and `dollarsToUnits` refuses anything
 * finer on purpose, because a screen that shows two decimals must not take three. Sending is the opposite case. A
 * payout service is ordered for an exact quantity and expects exactly that quantity to arrive; more or less can
 * fail the order and send it back, less what the network took. Viky used to send the whole balance, six decimals
 * and all, so no order could ever match it.
 *
 * It is read from the text rather than through a number, for the reason the gift's parser gives: a number rounds,
 * and it reads a stray keystroke like 1e3 as a thousand.
 *
 * The coin is a parameter since D77, because the two payout services take different ones and the chain's own has
 * eighteen decimals rather than six. A parser fixed at six would have quietly truncated somebody's money by
 * twelve digits, which is the kind of wrong that looks like a rounding error and is not.
 */

export type SendAmount = Readonly<{ units: bigint; refusal?: undefined } | { units?: undefined; refusal: string }>;

/** The same amount as a field holds it: written in full, with nothing in front and no symbol after. */
export function exactAmountText(units: bigint, coin: Coin = AUSD): string {
  const written = exactly(units, coin);
  const withoutSign = written.startsWith("$") ? written.slice(1) : written;
  return withoutSign.replace(` ${coin.symbol}`, "");
}

/**
 * Spelled rather than printed as a digit, because this lands in a sentence a person reads, and because the
 * sentence for the coins a gift is made of has been on screen and recorded as a claim since D75: interpolating
 * the number would silently change it to "6 decimals at most" and make the record wrong.
 */
const IN_WORDS: Record<number, string> = { 6: "six", 18: "eighteen" };

export function amountToSend(text: string, holding: bigint, coin: Coin = AUSD): SendAmount {
  const exact = new RegExp(`^(\\d{1,9})(?:[.,](\\d{1,${coin.decimals}}))?$`);
  const match = exact.exec(String(text).trim());
  if (!match) {
    return {
      refusal: `Type an amount like 28.56 or 28.564213, with ${IN_WORDS[coin.decimals] ?? coin.decimals} decimals at most.`,
    };
  }
  const units = BigInt(match[1]) * 10n ** BigInt(coin.decimals) + BigInt((match[2] ?? "").padEnd(coin.decimals, "0"));
  if (units === 0n) return { refusal: "Type an amount above zero." };
  if (units > holding) return { refusal: `You have ${exactly(holding, coin)}. Send that or less.` };
  return { units };
}
