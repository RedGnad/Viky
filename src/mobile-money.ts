/**
 * The mobile money way out, in words and rules the browser and the server share (the founder, 2 Oct 2026). Browser safe:
 * no fetch, no key.
 *
 * It is off until a real payout has reached a real number in one of the countries Switch covers: the switch is the
 * server setting `MOBILE_MONEY_OUT=on`, unset at the merge, and nothing about the way is offered while it is off.
 */

/** Whether the way is switched on here: the setting, and the key without which nothing could be asked. */
export function mobileMoneyOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.MOBILE_MONEY_OUT?.trim() === "on" && Boolean(env.SWITCH_SERVICE_KEY?.trim());
}

/**
 * An operator as a person reads it, from the name Switch gives it (ORANGE, WAVE, MTN, MOOV, AIRTEL, MPESA): a name of
 * three letters or fewer stays as it is, being an acronym, and a longer one takes a capital and lower case after it.
 * Nothing is added to it: "Orange", never "Orange Money", since that is not what Switch names.
 */
export function operatorInWords(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

/** "Orange", "Orange or Wave", "Orange, MTN or Moov": the operators of a country in the order Switch lists them. */
export function operatorsInWords(names: readonly string[]): string {
  const words = names.map(operatorInWords);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** The two currencies whose sign a person in their countries writes as F: the West and the Central African CFA francs. */
const CFA = new Set(["XOF", "XAF"]);

/**
 * A local amount as it is said where it is paid: "6 540 F" for a CFA franc, cut down to the franc, never rounded up,
 * grouped by thousands with a space; any other currency with its code after it and its two decimals cut down.
 */
export function localInWords(amount: number, currency: string): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  if (CFA.has(currency.toUpperCase())) {
    const whole = Math.floor(amount);
    return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
  }
  const cents = Math.floor(amount * 100) / 100;
  return `${cents.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency.toUpperCase()}`;
}

/**
 * Switch's published time as a sentence says it: "5-10 minutes" becomes "5 to 10 minutes", which reads aloud and never
 * breaks at the hyphen on a narrow screen. Anything else is kept as Switch wrote it.
 */
export function delayInWords(settlement: string): string {
  return settlement.replace(/(\d+)\s*-\s*(\d+)/, "$1 to $2");
}

/** The last four digits of a number, which is all the screen shows of it once it is sent. */
export function numberEnd(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.slice(-4);
}

/**
 * Where a payout stands, in the four states a person can be told: on its way, arrived, failed (and the money comes
 * back), and a payment window that closed before anything was sent. Switch's own states map onto them as it documents
 * them (docs.onswitch.xyz/webhook, read 2 Oct 2026); a state it may add later is "on its way", never "arrived".
 */
export type PayoutPhase = "waiting" | "arrived" | "failed" | "expired";

export function phaseOf(status: string, input: { depositSent: boolean; expired: boolean }): PayoutPhase {
  switch (status) {
    case "COMPLETED":
      return "arrived";
    case "FAILED":
    case "REVERSED":
    case "BLOCKED":
      return "failed";
    case "AWAITING_DEPOSIT":
      // Nothing was sent, and the window for it closed: the dollars never left the account.
      return !input.depositSent && input.expired ? "expired" : "waiting";
    default:
      return "waiting";
  }
}

/** Whether Switch has nothing more to say of a payout: arrived, failed or expired. */
export function settled(phase: PayoutPhase): boolean {
  return phase !== "waiting";
}
