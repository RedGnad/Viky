/**
 * What Viky's index says, read from its GraphQL endpoint for the judges page (the audit of 1 Oct 2026, D-14). Server
 * only.
 *
 * The index is a second repository (Viky-index, Envio HyperIndex): the contracts' own events, gift by gift, summed,
 * with who funded each gift and who opened it, and what the anchor of agreements has written down.
 * Nothing that moves money reads it. This is one POST to `ENVIO_GRAPHQL_URL`, cut at four seconds, and it answers
 * nothing at the slightest doubt: no setting, an endpoint that does not answer, an answer of another shape. The page
 * then says the index could not be read, rather than showing a figure it cannot stand behind.
 */

export type IndexedGift = Readonly<{
  contract: string;
  giftId: string;
  kind: "daily" | "milestone";
  /** 1, 2 or 3: which version of its contract holds it (3 is the daily contract alone). */
  version: 1 | 2 | 3;
  status: string;
  /** The account that funded it, and the account that opened it, or nothing while nobody has. */
  funder: string;
  recipient: string | null;
  amount: bigint;
  fundedAmount: bigint;
  /** What the gift has put in its recipient's name so far. */
  amountEarned: bigint;
  amountWithdrawn: bigint;
  amountRefunded: bigint;
  createdInTransaction: string;
  createdAt: string;
}>;

export type IndexTotals = Readonly<{
  giftsCreated: number;
  giftsClaimed: number;
  daysEarned: number;
  daysReturned: number;
  milestonesReached: number;
  amountEarned: bigint;
  amountWithdrawn: bigint;
  amountRefunded: bigint;
  /** The anchor of agreements: accounts that bound their agreement key, and every yes and stop written down. */
  consentKeysBound: number;
  yesAnchored: number;
  stopsAnchored: number;
  eventsIndexed: number;
}>;

export type IndexRead = Readonly<{
  /** The last block the index has processed, and the head it knew of then. */
  block: number;
  sourceBlock: number;
  totals: IndexTotals;
  /** Every gift, oldest first. */
  gifts: readonly IndexedGift[];
}>;

const QUERY = `{
  _meta { chainId progressBlock sourceBlock }
  GlobalStat(where: {id: {_eq: "global"}}) { giftsCreated giftsClaimed daysEarned daysReturned milestonesReached amountEarned amountWithdrawn amountRefunded consentKeysBound yesAnchored stopsAnchored eventsIndexed }
  Gift(order_by: {createdAt: asc}, limit: 500) { contract giftId kind version status funder recipient amount fundedAmount amountEarned amountWithdrawn amountRefunded createdInTransaction createdAt }
}`;

export const INDEX_TIMEOUT_MS = 4_000;

/**
 * Whether the deployment read follows the third daily contract (8 Oct 2026). The index's address changes at every
 * deployment and is a setting, so the page may read one made before that contract. The index does not say which
 * contracts it follows; it does hold every gift of the ones it follows, and the third daily contract has held gift
 * 1000 since 3 Oct 2026. So an index with a gift of the third version follows that contract, and one with none does
 * not. The judges page says which, instead of naming a number of contracts it cannot count.
 */
export function followsThirdDailyContract(index: Pick<IndexRead, "gifts">): boolean {
  return index.gifts.some((gift) => gift.version === 3);
}

/** The endpoint, or nothing while the setting is absent or is not an https address. */
export function envioGraphqlUrl(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = env.ENVIO_GRAPHQL_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

const units = (value: unknown): bigint => {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("not an amount");
  const text = String(value);
  if (!/^\d{1,78}$/.test(text)) throw new Error("not an amount");
  return BigInt(text);
};
const count = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("not a count");
  return number;
};
/**
 * The version the index gives a gift: 1, 2 or 3, as its schema writes it. Anything else refuses the whole reading.
 * Every version that was not 2 used to be read as 1 (the advisor, 4 Oct 2026): the day the index reads the third
 * daily contract, its gifts would have been counted with the first version's.
 */
export const versionOf = (value: unknown): 1 | 2 | 3 => {
  const version = count(value);
  if (version !== 1 && version !== 2 && version !== 3) throw new Error("not a version");
  return version;
};
const text = (value: unknown, pattern: RegExp): string => {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("not what was expected");
  return value;
};

/** The index as it answers now, or nothing. It never throws. */
export async function readIndex(fetchImpl: typeof fetch = fetch, url: string | null = envioGraphqlUrl()): Promise<IndexRead | null> {
  if (!url) return null;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(INDEX_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { _meta?: unknown[]; GlobalStat?: unknown[]; Gift?: unknown[] }; errors?: unknown };
    if (body.errors || !body.data) return null;
    const meta = (body.data._meta ?? []).find((entry) => Number((entry as { chainId?: unknown }).chainId) === 143) as { progressBlock?: unknown; sourceBlock?: unknown } | undefined;
    const global = (body.data.GlobalStat ?? [])[0] as Record<string, unknown> | undefined;
    if (!meta || !global || !Array.isArray(body.data.Gift)) return null;
    return {
      block: count(meta.progressBlock),
      sourceBlock: count(meta.sourceBlock),
      totals: {
        giftsCreated: count(global.giftsCreated),
        giftsClaimed: count(global.giftsClaimed),
        daysEarned: count(global.daysEarned),
        daysReturned: count(global.daysReturned),
        milestonesReached: count(global.milestonesReached),
        amountEarned: units(global.amountEarned),
        amountWithdrawn: units(global.amountWithdrawn),
        amountRefunded: units(global.amountRefunded),
        consentKeysBound: count(global.consentKeysBound),
        yesAnchored: count(global.yesAnchored),
        stopsAnchored: count(global.stopsAnchored),
        eventsIndexed: count(global.eventsIndexed),
      },
      gifts: body.data.Gift.map((entry) => {
        const gift = entry as Record<string, unknown>;
        return {
          contract: text(gift.contract, /^0x[0-9a-fA-F]{40}$/).toLowerCase(),
          giftId: text(String(gift.giftId), /^\d{1,78}$/),
          kind: gift.kind === "milestone" ? "milestone" : "daily",
          version: versionOf(gift.version),
          status: text(gift.status, /^[a-z]{1,20}$/),
          // An account is printed and linked on the page: anything that is not one refuses the whole reading.
          funder: text(gift.funder, /^0x[0-9a-fA-F]{40}$/).toLowerCase(),
          recipient: gift.recipient === null || gift.recipient === undefined ? null : text(gift.recipient, /^0x[0-9a-fA-F]{40}$/).toLowerCase(),
          amount: units(gift.amount),
          fundedAmount: units(gift.fundedAmount),
          amountEarned: units(gift.amountEarned),
          amountWithdrawn: units(gift.amountWithdrawn),
          amountRefunded: units(gift.amountRefunded),
          createdInTransaction: text(gift.createdInTransaction, /^0x[0-9a-fA-F]{64}$/),
          createdAt: text(gift.createdAt, /^\d{4}-\d{2}-\d{2}T/),
        };
      }),
    };
  } catch {
    return null;
  }
}

/**
 * What the index's events say each contract still holds: what was funded, less what was taken out and what was sent
 * back. Set beside the token's own `balanceOf` for that contract, it is the one figure of the index a stranger can
 * check against the chain without reading a single event.
 */
export function heldPerContract(gifts: readonly IndexedGift[]): ReadonlyMap<string, bigint> {
  const held = new Map<string, bigint>();
  for (const gift of gifts) held.set(gift.contract, (held.get(gift.contract) ?? 0n) + gift.fundedAmount - gift.amountWithdrawn - gift.amountRefunded);
  return held;
}
