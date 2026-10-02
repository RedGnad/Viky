/**
 * Figures the judges page states, each one measured, with how and when (the founder, 2 Oct 2026: "only figures read
 * on the chain or at the provider, with their date"). Nothing here is an estimate, and nothing is recomputed as the
 * page is served: a figure is typed in from the output of the command named beside it, and its date is printed with it.
 * To read them again, run the command and replace the figures and the date together.
 */

/** One step of a gift as the relayer sends it: the function called, what it is in words, how many were sent, and what one cost on average. */
export type MeasuredStep = Readonly<{ step: string; says: string; sent: number; averageMon: string }>;

/**
 * What Viky's relayer paid, by step: `pnpm relayer:fees`, which lists the account's transactions, reads each one and
 * its receipt back from the public RPC, and multiplies the limit it declared by the price it paid (Monad charges the
 * limit). All of it on the first version of the contracts: no gift had run on the second when this was read.
 */
export const RELAYER_FEES = {
  readAt: "2 Oct 2026, 12:11 UTC",
  command: "pnpm relayer:fees",
  account: "0x150d3066F615FC012a40E7779dB748D53F7CCFE4",
  transactions: 120,
  totalMon: "2.196190",
  steps: [
    { step: "createGift", says: "a gift made", sent: 9, averageMon: "0.038012" },
    { step: "claim", says: "a gift opened", sent: 8, averageMon: "0.013021" },
    { step: "checkIn", says: "a day credited on a daily gift", sent: 5, averageMon: "0.017544" },
    { step: "prove", says: "a reading sent to a milestone gift", sent: 7, averageMon: "0.017544" },
    { step: "drain", says: "a missed day settled", sent: 19, averageMon: "0.008772" },
    { step: "refundUnearned", says: "what was not earned sent back to its funder", sent: 20, averageMon: "0.018661" },
    { step: "withdrawEarnedWithIntent", says: "what was earned taken out by its recipient", sent: 14, averageMon: "0.018173" },
    { step: "finalise", says: "a daily gift closed", sent: 3, averageMon: "0.010965" },
    { step: "expire", says: "a milestone gift closed at its deadline", sent: 2, averageMon: "0.010965" },
    { step: "transferWithAuthorization", says: "a plain send from one account to another", sent: 4, averageMon: "0.013370" },
  ],
} as const satisfies { readAt: string; command: string; account: string; transactions: number; totalMon: string; steps: readonly MeasuredStep[] };

/** The price of MON in dollars, for saying a network fee in the money a gift is in. */
export const MON_PRICE = {
  usd: 0.03373142,
  source: "CoinGecko",
  where: "api.coingecko.com/api/v3/simple/price?ids=monad",
  readAt: "2 Oct 2026, 12:10 UTC",
} as const;

/** A block's time: the timestamps of two blocks 10,000 apart, read from the public RPC, divided by 10,000. */
export const BLOCK_TIME = { seconds: 0.302, blocks: 10_000, from: 109_877_824, to: 109_887_824, readOn: "2 Oct 2026" } as const;

/** How far the block the node calls final trailed the latest one: `eth_getBlockByNumber` for both tags, 20 readings half a second apart. */
export const FINALITY_GAP = { readings: 20, fewestBlocks: 1, mostBlocks: 2, readOn: "2 Oct 2026" } as const;

/**
 * From a gift's link to the gift opened, for a person with no account: test/browser/arrival-measure.spec.ts, run with
 * VIKY_ARRIVAL_MEASURE=<file> on a production build served on the measuring machine, at 390 by 844. The gestures are
 * the product's own. The seconds are the screens' own with a virtual passkey that answers at once and the gift's
 * answers stood in: no person's time and none of Monad's is in them. Three runs, one after the other on the same
 * server: the first, the slowest, is the one given moment by moment, and `runs` is what each took in all.
 */
export const ARRIVAL = {
  measuredOn: "2 Oct 2026",
  gestures: ["Press Create my account", "Answer the device's passkey prompt, a face or a fingerprint", "Press Open my gift"],
  seconds: { linkShown: 1.1, accountMade: 1.8, giftOpened: 1.9 },
  runs: [1.9, 0.8, 0.8],
} as const;

const MON_UNITS = 1_000_000n;

/** An amount of MON written with six decimals, as the measures are, in millionths. */
function millionths(mon: string): bigint {
  const [whole, part = ""] = mon.split(".");
  return BigInt(whole) * MON_UNITS + BigInt(part.padEnd(6, "0").slice(0, 6));
}

const stepMon = (step: string): bigint => {
  const found = RELAYER_FEES.steps.find((one) => one.step === step);
  if (!found) throw new Error(`no measure for the step ${step}`);
  return millionths(found.averageMon);
};

/** MON, from millionths, with its six decimals. */
export function monWords(units: bigint): string {
  return `${units / MON_UNITS}.${(units % MON_UNITS).toString().padStart(6, "0")} MON`;
}

/** Dollars at the price read, to four decimals: a network fee here is a fraction of a cent, which two decimals would print as nothing. */
export function dollarsOf(units: bigint, price: number = MON_PRICE.usd): string {
  return `$${((Number(units) / Number(MON_UNITS)) * price).toFixed(4)}`;
}

/**
 * What the network costs Viky for one daily gift whose every day is credited, from its making to its closing: made,
 * opened, a check-in for each day, one withdrawal, closed. The sum of the measured averages, nothing else.
 */
export function dailyGiftMon(days: number): bigint {
  return stepMon("createGift") + stepMon("claim") + BigInt(days) * stepMon("checkIn") + stepMon("withdrawEarnedWithIntent") + stepMon("finalise");
}

/** One credited day, and one missed day (settled, then sent back), as the relayer paid them on average. */
export const creditedDayMon = (): bigint => stepMon("checkIn");
export const missedDayMon = (): bigint => stepMon("drain") + stepMon("refundUnearned");
