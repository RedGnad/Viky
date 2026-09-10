import { createPublicClient, http, type Abi, type Hex, type PublicClient } from "viem";
import { giftEscrowAbi } from "./gift-escrow-abi";
import { monadChain, monadRpcUrl } from "./monad/chain";

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
}>;

const ZERO = "0x0000000000000000000000000000000000000000";

let cachedClient: PublicClient | undefined;

export function giftPublicClient(): PublicClient {
  if (!cachedClient) cachedClient = createPublicClient({ chain: monadChain, transport: http(monadRpcUrl()) });
  return cachedClient;
}

export async function readGift(escrow: Hex, giftId: string, client: PublicClient = giftPublicClient()): Promise<GiftState> {
  const abi = giftEscrowAbi as unknown as Abi;
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
    recipientContactHash: gift.recipientContactHash as Hex,
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
  };
}

export async function readNextGiftId(escrow: Hex, client: PublicClient = giftPublicClient()): Promise<bigint> {
  return client.readContract({ address: escrow, abi: giftEscrowAbi as unknown as Abi, functionName: "nextGiftId" }) as Promise<bigint>;
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
