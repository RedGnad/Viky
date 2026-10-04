/**
 * The mobile money way out, in words and rules the browser and the server share (the founder, 2 Oct 2026). Browser safe:
 * no fetch, no key.
 *
 * It is off until a real payout has reached a real number in one of the countries Switch covers: the switch is the
 * server setting `MOBILE_MONEY_OUT=on`, unset at the merge, and nothing about the way is offered while it is off.
 */

/**
 * How much mobile money can carry for now (the founder, 3 Oct 2026), the same rule as the phone and gift card way out:
 * a ceiling per payout and one per account and per day, in dollars from the balance, checked when the payout is priced
 * and again when it is sent, since a price moves nothing and counts for nothing.
 */
export const MOBILE_CEILINGS = Object.freeze({ usdPerPayout: 200, usdPerAccountPerDay: 500 });

const DOLLAR = 1_000_000n;
const dollars = (units: bigint) => `$${(units / DOLLAR).toString()}.${((units % DOLLAR) / 10_000n).toString().padStart(2, "0")}`;

export const MOBILE_REFUSALS = {
  overPayout: () => `One payout can be ${dollars(BigInt(MOBILE_CEILINGS.usdPerPayout) * DOLLAR)} at most for now. Nothing was taken.`,
  overDay: (used: bigint) => `Up to ${dollars(BigInt(MOBILE_CEILINGS.usdPerAccountPerDay) * DOLLAR)} a day can go to mobile money for now, and ${dollars(used)} already went today. Nothing was taken.`,
  /**
   * What a field is missing, said under it after a press (the founder, 4 Oct 2026: the button was only grey, and said
   * nothing). The route refuses with the same sentences, so the screen and the server never say two things.
   */
  chooseOperator: "Choose your operator from the list.",
  /** Nothing typed yet: the field is asked for, where the sentences below would speak of a number nobody wrote. */
  enterNumber: "Enter your number.",
  enterName: "Enter the name on the account.",
  numberNotTaken: "That number is not one this operator takes. Digits only, as your operator gives it.",
  writeTheName: "Write the name on the account, as your operator has it.",
  /** Said in place of the form once the day's ceiling leaves less than the smallest payout. */
  dayReached: () => `You have sent ${dollars(BigInt(MOBILE_CEILINGS.usdPerAccountPerDay) * DOLLAR)} to mobile money today, the most for a day. It opens again tomorrow.`,
} as const;

/** Dollars of six decimals in a country's money at a rate: cut down, or, for a bound that must be reached, raised. */
export function localOfUnits(units: bigint, rate: number, round: "down" | "up"): number {
  const value = (Number(units) / 1e6) * rate;
  return round === "up" ? Math.ceil(value) : Math.floor(value);
}

/** What one more payout of this many dollars may be, given what the account already sent today; a refusal names the ceiling met. */
export function ceilingProblem(units: bigint, usedToday: bigint): string | null {
  if (units > BigInt(MOBILE_CEILINGS.usdPerPayout) * DOLLAR) return MOBILE_REFUSALS.overPayout();
  if (usedToday + units > BigInt(MOBILE_CEILINGS.usdPerAccountPerDay) * DOLLAR) return MOBILE_REFUSALS.overDay(usedToday);
  return null;
}

/** The most one payout may be now: the ceiling per payout, or what the day leaves, whichever is less. */
export function mostNow(usedToday: bigint): bigint {
  const leftToday = BigInt(MOBILE_CEILINGS.usdPerAccountPerDay) * DOLLAR - usedToday;
  const perPayout = BigInt(MOBILE_CEILINGS.usdPerPayout) * DOLLAR;
  return leftToday < 0n ? 0n : leftToday < perPayout ? leftToday : perPayout;
}

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
