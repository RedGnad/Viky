import { RATE_SOURCE } from "./rails";

/**
 * The one exchange rate Viky reads, and the two currencies it gives.
 *
 * The source is the ECB's daily reference-rate file, which carries every currency against the euro and is dated
 * by its own `time` attribute. The dollar is in it; the CFA franc is not, and does not need to be, because its
 * parity with the euro is fixed (src/rails.ts, `RATE_SOURCE`). So one read of one line gives euros per dollar
 * and CFA francs per dollar, both dated by the ECB.
 *
 * Nothing here rounds a rate, invents one, or keeps one longer than the source allows: after `staleAfterDays`
 * without a successful read, `currentRates` answers nothing and the screens show the dollar alone.
 */

export type Rates = Readonly<{
  /** The ECB's own date for the figures, as written in the file: "2026-09-16". */
  date: string;
  /** Dollars per euro, exactly as the ECB publishes it. */
  usdPerEur: number;
  /** Derived: euros per dollar. */
  eurPerUsd: number;
  /** Derived: CFA francs per dollar, through the fixed parity. */
  xofPerUsd: number;
  /** When the source answered, as an epoch millisecond. */
  readAtMs: number;
}>;

/**
 * Reads the two things the file has to say: its date and the dollar line. A file without either is refused
 * rather than guessed at, because a rate is a sentence about somebody's money.
 */
export function parseEcbRates(xml: string, readAtMs: number): Rates {
  const date = /<Cube[^>]*\stime=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const usd = /<Cube[^>]*\scurrency=['"]USD['"][^>]*\srate=['"]([0-9.]+)['"]/.exec(xml)?.[1];
  if (!date || !usd) throw new Error("the rate file has no dated USD line");
  const usdPerEur = Number(usd);
  if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) throw new Error("the USD rate is not a number");
  const eurPerUsd = 1 / usdPerEur;
  return { date, usdPerEur, eurPerUsd, xofPerUsd: eurPerUsd * RATE_SOURCE.cfaFrancsPerEuro, readAtMs };
}

/** Whether a read is still allowed to be shown: within the days the source note allows. */
export function ratesUsable(rates: Rates | undefined, nowMs: number): rates is Rates {
  if (!rates) return false;
  return nowMs - rates.readAtMs <= RATE_SOURCE.staleAfterDays * 86_400_000;
}

/** How often the source is asked again while an answer is held. The ECB publishes once a working day. */
const REFRESH_MS = 60 * 60 * 1000;

let held: Rates | undefined;
let lastAttemptMs = 0;

/**
 * The rates to show now, or nothing. A failed read keeps the last good one for as long as `ratesUsable`
 * allows and no longer; a read is attempted at most once an hour so a busy screen never hammers the source.
 */
export async function currentRates(
  fetchFile: () => Promise<string> = defaultFetch,
  nowMs: number = Date.now(),
): Promise<Rates | undefined> {
  const due = nowMs - lastAttemptMs >= REFRESH_MS;
  if (due || !held) {
    lastAttemptMs = nowMs;
    try {
      held = parseEcbRates(await fetchFile(), nowMs);
    } catch (error) {
      console.error(`the rate source did not answer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return ratesUsable(held, nowMs) ? held : undefined;
}

/** For tests: forget what was read. */
export function forgetRates(): void {
  held = undefined;
  lastAttemptMs = 0;
}

async function defaultFetch(): Promise<string> {
  const response = await fetch(RATE_SOURCE.url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Viky (viky.cash)" } });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.text();
}
