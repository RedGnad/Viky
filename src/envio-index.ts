/**
 * What Viky's index says, read from its GraphQL endpoint for the judges page (the audit of 1 Oct 2026, D-14). Server
 * only.
 *
 * The index is a second repository (Viky-index, Envio HyperIndex): the contracts' own events, gift by gift, summed.
 * Nothing that moves money reads it. This is one POST to `ENVIO_GRAPHQL_URL`, cut at four seconds, and it answers
 * nothing at the slightest doubt: no setting, an endpoint that does not answer, an answer of another shape. The page
 * then says the index could not be read, rather than showing a figure it cannot stand behind.
 */

export type IndexedGift = Readonly<{
  contract: string;
  giftId: string;
  kind: "daily" | "milestone";
  status: string;
  amount: bigint;
  fundedAmount: bigint;
  amountWithdrawn: bigint;
  amountRefunded: bigint;
  createdInTransaction: string;
  createdAt: string;
}>;

export type IndexTotals = Readonly<{ giftsCreated: number; giftsClaimed: number; daysEarned: number; daysReturned: number; milestonesReached: number; amountEarned: bigint; amountWithdrawn: bigint; amountRefunded: bigint; eventsIndexed: number }>;

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
  GlobalStat(where: {id: {_eq: "global"}}) { giftsCreated giftsClaimed daysEarned daysReturned milestonesReached amountEarned amountWithdrawn amountRefunded eventsIndexed }
  Gift(order_by: {createdAt: asc}, limit: 500) { contract giftId kind status amount fundedAmount amountWithdrawn amountRefunded createdInTransaction createdAt }
}`;

export const INDEX_TIMEOUT_MS = 4_000;

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
        eventsIndexed: count(global.eventsIndexed),
      },
      gifts: body.data.Gift.map((entry) => {
        const gift = entry as Record<string, unknown>;
        return {
          contract: text(gift.contract, /^0x[0-9a-fA-F]{40}$/).toLowerCase(),
          giftId: text(String(gift.giftId), /^\d{1,78}$/),
          kind: gift.kind === "milestone" ? "milestone" : "daily",
          status: text(gift.status, /^[a-z]{1,20}$/),
          amount: units(gift.amount),
          fundedAmount: units(gift.fundedAmount),
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
