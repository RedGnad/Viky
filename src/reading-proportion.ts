import type { Hex } from "viem";
import type { GiftState } from "./gift-reader";
import { sendAlert, type AlertOutcome } from "./provider-alert";
import { dailyVersionOf, opensByItsLink } from "./v2";

/**
 * A reading far out of proportion with a gift's daily target is not attested (the review of 2 Oct 2026, R-15, second
 * scenario, and its delta re-read). Server only.
 *
 * On the daily contract a reading that pays for every open day sets the gift's baseline to the figure it carries, and
 * the surplus is discarded. So one reading with an absurd figure ends the gift for good: every real reading after it
 * is below the baseline and is refused (`MetricDecreased`), and no owner and no new signer can put it right. Somebody
 * holding the evidence key can do that on purpose, and nothing here stops them: they sign for themselves. What this
 * stops is the accident: a source that answers a figure that cannot be true, attested in good faith by this server.
 *
 * The rule: since the last reading the contract took, a gift's figure may have risen by `READING_JUMP_FACTOR` times
 * its daily target for each day that passed, and no more. Ten thousand: for a target of ten points a day that is a
 * hundred thousand points in one day, for a kilometre a day ten thousand kilometres. Nobody does that, so a real
 * reading is never refused by it, and a figure that is only a few times too high is not caught by it either: that one
 * is told after the fact, by the alert below.
 *
 * It holds for gifts of the second version of the contracts and of the third daily contract, each off until its
 * address is set (src/v2.ts): nothing changes for a gift of the first version.
 */
export const READING_JUMP_FACTOR = 10_000;

const DAY = 86_400;

export type Proportion = Readonly<{ jump: bigint; most: bigint; days: number }>;

type Baselined = Pick<GiftState, "startDay" | "baselineValue" | "lastCheckInAt" | "dailyTarget">;
type Read = Readonly<{ giftId: bigint; metricValue: bigint; observedAt: bigint }>;

/**
 * How far a reading is out of proportion, or nothing. A first reading is never judged: it has nothing to be compared
 * with. Neither is a figure at or below the baseline: that is the contract's own refusal to give.
 */
export function outOfProportion(gift: Baselined, reading: Pick<Read, "metricValue" | "observedAt">): Proportion | null {
  if (gift.startDay === 0 || reading.metricValue <= gift.baselineValue) return null;
  const days = Math.max(1, Math.ceil((Number(reading.observedAt) - gift.lastCheckInAt) / DAY));
  const most = BigInt(READING_JUMP_FACTOR) * BigInt(gift.dailyTarget) * BigInt(days);
  const jump = reading.metricValue - gift.baselineValue;
  return jump > most ? { jump, most, days } : null;
}

/** What the person reads. It names no figure: the figure is the thing that is not believed. */
export const OUT_OF_PROPORTION = { code: "READING_OUT_OF_PROPORTION", message: "Viky read a figure that cannot be right and did not count it. Nothing was changed." } as const;

export class ReadingOutOfProportion extends Error {
  readonly code = OUT_OF_PROPORTION.code;
  constructor(
    readonly giftId: string,
    readonly proportion: Proportion,
  ) {
    super(OUT_OF_PROPORTION.message);
    this.name = "ReadingOutOfProportion";
  }
}

export type OperatorAlert = (alert: Readonly<{ subject: string; text: string }>) => Promise<AlertOutcome>;

export function outOfProportionAlert(giftId: string, gift: Baselined, reading: Pick<Read, "metricValue">, found: Proportion): { subject: string; text: string } {
  return {
    subject: `Gift ${giftId}: a reading out of all proportion was not attested`,
    text: [
      `The source answered ${reading.metricValue} for gift ${giftId}. The contract's baseline is ${gift.baselineValue}, and its daily target is ${gift.dailyTarget}.`,
      `That is a rise of ${found.jump} in ${found.days} day(s), and the most this server attests is ${found.most} (${READING_JUMP_FACTOR} times the target a day).`,
      "Nothing was signed and nothing was sent: a reading this high would have set the gift's baseline to that figure, and no real reading would ever have counted again.",
      "The day stays open for its catch-up window. Read the source by hand: if the figure is real, the gift is counted by hand before the window closes.",
    ].join("\n"),
  };
}

/**
 * Refuses to go on to the signature when a reading is out of proportion for a gift of the second version, and tells
 * the operator. Called with the gift as the contract holds it, right before every `signCheckIn`.
 */
export async function assertReadingInProportion(escrow: Hex, gift: Baselined, reading: Read, alert: OperatorAlert = sendAlert): Promise<void> {
  if (!opensByItsLink(dailyVersionOf(escrow))) return;
  const found = outOfProportion(gift, reading);
  if (!found) return;
  const giftId = reading.giftId.toString();
  await alert(outOfProportionAlert(giftId, gift, reading, found)).catch(() => undefined);
  throw new ReadingOutOfProportion(giftId, found);
}

export function brokenBaselineAlert(giftId: string, baseline: bigint, read: bigint): { subject: string; text: string } {
  return {
    subject: `Gift ${giftId}: a reading was refused for being below the gift's baseline`,
    text: [
      `The contract refused a reading of ${read} for gift ${giftId}: its baseline is ${baseline} (MetricDecreased).`,
      "Either the source's figure went down, which a person can cause (an activity removed), and the gift counts again once the figure passes the baseline.",
      "Or an earlier reading set the baseline far too high. Whoever holds the evidence key can do that with one reading, and a source can do it by answering a figure that is not true. Then no reading will ever count again: nothing in the contract resets a baseline, and a new signer does not either.",
      "Look at the gift's readings on the judges page. If the baseline is wrong: the person the gift is for can end it and keep what was counted, and the rest goes back to the funder at once.",
    ].join("\n"),
  };
}

/**
 * Tells the operator that a real reading was refused as below the baseline, on a gift of the second version. That
 * refusal is the one trace a baseline set too high leaves. Said every time it happens, and never thrown.
 */
export async function tellOfARefusedBaseline(escrow: Hex, giftId: string, baseline: bigint, read: bigint, alert: OperatorAlert = sendAlert): Promise<void> {
  if (!opensByItsLink(dailyVersionOf(escrow))) return;
  await alert(brokenBaselineAlert(giftId, baseline, read)).catch(() => undefined);
}
