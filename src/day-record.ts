import { parseEventLogs, type Abi, type Log } from "viem";
import { giftEscrowAbi } from "./gift-escrow-abi";

/**
 * Which day of a gift was earned and which went back, from the contract's own events (decision 3 of the drawn flows,
 * D83 point 4). Browser safe.
 *
 * The contract settles days in order and publishes two counts, so the counts alone cannot say which day was which
 * (src/day-states.ts). Its events can: `CheckInAccepted` names the first and last day it credited, `DaysDrained` the
 * first and last day it marked missed, whether by `drain` or by `finalise`. The keeper reads them from the receipt of
 * every transaction it relays and writes one row per day, so the record is exactly what the contract settled, never a
 * guess about it.
 */

export type DayOutcome = "earned" | "returned";
export type SettledDay = Readonly<{ day: number; outcome: DayOutcome }>;

const abi = giftEscrowAbi as unknown as Abi;

/** Every day a receipt settled for one gift, in day order. A receipt that settled nothing gives nothing. */
export function settledDaysFromLogs(giftId: string, logs: readonly Log[]): SettledDay[] {
  const days: SettledDay[] = [];
  const events = parseEventLogs({ abi, logs: logs as Log[], eventName: ["CheckInAccepted", "DaysDrained"], strict: false });
  for (const event of events) {
    const args = (event as unknown as { eventName: string; args: Record<string, unknown> }).args;
    const name = (event as unknown as { eventName: string }).eventName;
    if (String(args.giftId) !== giftId) continue;
    const from = Number(args.fromDay);
    const to = Number(args.toDay);
    // The first reading binds the account and credits nothing: its event names the start day with zero credited.
    if (name === "CheckInAccepted" && Number(args.creditedDays) === 0) continue;
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || to - from > 366) continue;
    const outcome: DayOutcome = name === "CheckInAccepted" ? "earned" : "returned";
    for (let day = from; day <= to; day += 1) days.push({ day, outcome });
  }
  return days.sort((a, b) => a.day - b.day);
}
