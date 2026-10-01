import { createPublicClient, type Hex, type PublicClient } from "viem";
import { NO_CONTACT_HASH } from "./contact-hash";
import { monadChain, monadTransport } from "./monad/chain";
import { dailyAbiOf, dailyVersionOf, type ContractVersion } from "./v2";

/** Read-only view of a gift as the contract holds it. Numbers stay raw here; screens format them. */
export type GiftState = Readonly<{
  giftId: string;
  funder: Hex;
  refundTo: Hex;
  recipient: Hex | null;
  recipientContactHash: Hex;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  startDay: number;
  endDay: number;
  creditedDays: number;
  drainedDays: number;
  settledThroughDay: number;
  amount: bigint;
  perDay: bigint;
  withdrawnByRecipient: bigint;
  refundedToFunder: bigint;
  refundable: bigint;
  identityHash: Hex;
  baselineValue: bigint;
  lastCheckInAt: number;
  fundedAt: number;
  claimedAt: number;
  cancelled: boolean;
  finalised: boolean;
  earnedBalance: bigint;
  refundableBalance: bigint;
  withdrawNonce: bigint;
  /** Which version of the daily contract holds the gift (src/v2.ts). What follows exists on the second only. */
  version: ContractVersion;
  /** The address of the key that opens the gift, made from its link's secret. Nothing on the first version. */
  openingKey: Hex | null;
  /** When the person it is for ended it, or zero: on the first version nobody can. */
  endedAt: number;
  /** The days neither counted nor missed when it was ended: given back. */
  givenBackDays: number;
}>;

const ZERO = "0x0000000000000000000000000000000000000000";

let cachedClient: PublicClient | undefined;

export function giftPublicClient(): PublicClient {
  if (!cachedClient) cachedClient = createPublicClient({ chain: monadChain, transport: monadTransport() });
  return cachedClient;
}

export async function readGift(escrow: Hex, giftId: string, client: PublicClient = giftPublicClient()): Promise<GiftState> {
  // The first version and the second answer `getGift` with two different shapes: each is read with its own ABI.
  const abi = dailyAbiOf(escrow);
  const version = dailyVersionOf(escrow);
  const id = BigInt(giftId);
  const [gift, earnedBalance, refundableBalance, withdrawNonce] = await Promise.all([
    client.readContract({ address: escrow, abi, functionName: "getGift", args: [id] }) as Promise<Record<string, unknown>>,
    client.readContract({ address: escrow, abi, functionName: "earnedBalance", args: [id] }) as Promise<bigint>,
    client.readContract({ address: escrow, abi, functionName: "refundableBalance", args: [id] }) as Promise<bigint>,
    client.readContract({ address: escrow, abi, functionName: "withdrawNonces", args: [id] }) as Promise<bigint>,
  ]);
  const recipient = String(gift.recipient) as Hex;
  return {
    giftId,
    funder: gift.funder as Hex,
    refundTo: gift.refundTo as Hex,
    recipient: recipient.toLowerCase() === ZERO ? null : recipient,
    // The second version carries an opening key where the first carried a contact hash that named nobody (D72).
    recipientContactHash: version === 2 ? NO_CONTACT_HASH : (gift.recipientContactHash as Hex),
    goalType: Number(gift.goalType),
    dailyTarget: Number(gift.dailyTarget),
    durationDays: Number(gift.durationDays),
    startDay: Number(gift.startDay),
    endDay: Number(gift.endDay),
    creditedDays: Number(gift.creditedDays),
    drainedDays: Number(gift.drainedDays),
    settledThroughDay: Number(gift.settledThroughDay),
    amount: gift.amount as bigint,
    perDay: gift.perDay as bigint,
    withdrawnByRecipient: gift.withdrawnByRecipient as bigint,
    refundedToFunder: gift.refundedToFunder as bigint,
    refundable: gift.refundable as bigint,
    identityHash: gift.identityHash as Hex,
    baselineValue: gift.baselineValue as bigint,
    lastCheckInAt: Number(gift.lastCheckInAt),
    fundedAt: Number(gift.fundedAt),
    claimedAt: Number(gift.claimedAt),
    cancelled: Boolean(gift.cancelled),
    finalised: Boolean(gift.finalised),
    earnedBalance,
    refundableBalance,
    withdrawNonce,
    version,
    openingKey: version === 2 ? (gift.openingKey as Hex) : null,
    endedAt: version === 2 ? Number(gift.endedAt) : 0,
    givenBackDays: version === 2 ? Number(gift.givenBackDays) : 0,
  };
}

/**
 * What the recipient has earned in total, whether or not they have taken it. Never use `earnedBalance` for
 * this: that is what is left to take, and it drops to zero the moment they take it, which would tell a
 * funder their gift had earned nothing.
 */
export function theirsSoFar(gift: Pick<GiftState, "creditedDays" | "perDay">): bigint {
  return BigInt(gift.creditedDays) * gift.perDay;
}

/** UTC day number of a timestamp, as the contract computes it. */
export function utcDayOf(timestampSeconds: number): number {
  return Math.floor(timestampSeconds / 86_400);
}

/** The day index of a check-in observed now inside the gift window: 0 before the window opens. */
export function checkInDayIndex(gift: Pick<GiftState, "startDay">, nowSeconds = Math.floor(Date.now() / 1_000)): number {
  if (gift.startDay === 0) return 0;
  const today = utcDayOf(nowSeconds);
  return Math.max(0, today - gift.startDay + 1);
}

/** Money the screens show: dollars with two decimals, never raw units. */
export function formatAusd(units: bigint): string {
  const whole = units / 1_000_000n;
  const cents = (units % 1_000_000n) / 10_000n;
  return `$${whole.toString()}.${cents.toString().padStart(2, "0")}`;
}

/**
 * An amount to the last of the six decimals the coin has, for the one place a person must read exactly what leaves:
 * sending all of their money, where the balance shows two decimals and the signature moves six (D72). Zeros past the
 * cents are dropped, so a round amount still reads as one.
 */
export function formatAusdExact(units: bigint): string {
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0{1,4}$/, "");
  return `$${whole.toString()}.${fraction}`;
}
