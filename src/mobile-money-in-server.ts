import { operatorInWords } from "./mobile-money";
import { mobileMoneyInOn } from "./mobile-money-in";
import { mobileMoneyInCoverage, mobileMoneyOperators, payInFields, payInRates, type Corridor, type Operator } from "./switch";

/**
 * The mobile money way in on the server (the founder, 8 Oct 2026): where it is offered, and with what. Read from Switch
 * while the person looks, kept a few minutes per country in this process so a screen does not ask twice in one sitting
 * (Switch answered 429 to a quick run of reads on 2 Oct 2026), and never copied into this code (the rule of src/rails.ts).
 *
 * Reads only. Nothing here opens a collection.
 */

const KEPT_MS = 10 * 60_000;
let coverage: { at: number; rows: readonly Corridor[]; rates: ReadonlyMap<string, number> } | undefined;
const operators = new Map<string, { at: number; operators: readonly Operator[] }>();
const fields = new Map<string, { at: number; fields: readonly string[] | null }>();

export type PayInReader = Readonly<{
  coverage: () => Promise<readonly Corridor[]>;
  rates: () => Promise<ReadonlyMap<string, number>>;
  operators: (country: string) => Promise<readonly Operator[]>;
  /** The fields an opening asks for there, or nothing when Switch publishes none: then no collection can be opened. */
  fields: (country: string) => Promise<readonly string[] | null>;
}>;

export const liveSwitchIn: PayInReader = {
  coverage: () => mobileMoneyInCoverage(),
  rates: () => payInRates(),
  operators: (country) => mobileMoneyOperators(country),
  fields: (country) => payInFields(country),
};

/** Tests only: forget what was kept. */
export function forgetKeptPayInCoverage(): void {
  coverage = undefined;
  operators.clear();
  fields.clear();
}

type Deps = { reader?: PayInReader; env?: Readonly<Record<string, string | undefined>>; now?: () => number };

async function corridors(reader: PayInReader, now: number): Promise<{ rows: readonly Corridor[]; rates: ReadonlyMap<string, number> }> {
  if (coverage && now - coverage.at < KEPT_MS) return coverage;
  const [rows, rates] = await Promise.all([reader.coverage(), reader.rates()]);
  coverage = { at: now, rows, rates };
  return coverage;
}

async function operatorsOf(reader: PayInReader, country: string, now: number): Promise<readonly Operator[]> {
  const kept = operators.get(country);
  if (kept && now - kept.at < KEPT_MS) return kept.operators;
  const read = await reader.operators(country);
  operators.set(country, { at: now, operators: read });
  return read;
}

async function fieldsOf(reader: PayInReader, country: string, now: number): Promise<readonly string[] | null> {
  const kept = fields.get(country);
  if (kept && now - kept.at < KEPT_MS) return kept.fields;
  const read = await reader.fields(country);
  fields.set(country, { at: now, fields: read });
  return read;
}

export type PayInOffer =
  | Readonly<{
      offered: true;
      country: string;
      currency: string;
      /** Switch's own words for the time a collection takes, as published: "5-10 minutes". */
      settlement: string;
      minimumUnits: string;
      maximumUnits: string;
      /** The operators a payer may pay from there, by Switch's code and as a person reads them. */
      operators: ReadonlyArray<{ code: string; name: string }>;
      /** Switch's published rate for the way in, the country's money to a dollar: what bounds are said in, never a price. */
      rate: number;
    }>
  | Readonly<{ offered: false }>;

/**
 * What the way in is in a country, or that it is not offered there: closed, not covered, no rate published, no
 * requirements published (Switch then refuses to open a collection there, whatever its coverage lists), no operator
 * named, or Switch not answering. A screen told "not offered" shows nothing of it.
 */
export async function payInOfferIn(country: string | null, deps: Deps = {}): Promise<PayInOffer> {
  if (!mobileMoneyInOn(deps.env) || !country || !/^[A-Za-z]{2}$/.test(country)) return { offered: false };
  const reader = deps.reader ?? liveSwitchIn;
  const now = (deps.now ?? Date.now)();
  try {
    const read = await corridors(reader, now);
    const corridor = read.rows.find((row) => row.country === country.toUpperCase());
    const rate = corridor ? read.rates.get(corridor.currency) : undefined;
    if (!corridor || !rate) return { offered: false };
    // Asked before anything else of the country: without them an opening is refused, and nothing is offered.
    if (!(await fieldsOf(reader, corridor.country, now))) return { offered: false };
    const named = await operatorsOf(reader, corridor.country, now);
    if (named.length === 0) return { offered: false };
    return {
      offered: true,
      country: corridor.country,
      currency: corridor.currency,
      settlement: corridor.settlement,
      minimumUnits: corridor.minimumUnits.toString(),
      maximumUnits: corridor.maximumUnits.toString(),
      operators: named.map((operator) => ({ code: operator.code, name: operatorInWords(operator.name) })),
      rate,
    };
  } catch {
    return { offered: false };
  }
}
