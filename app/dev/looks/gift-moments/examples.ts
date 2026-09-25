import type { GiftStatus } from "@/src/client/gift";
import type { MilestoneStatus } from "@/src/milestone-view";

/**
 * Every moment of a gift's page, for every reader, as example data (V4, document J, section 3). Nothing here is
 * anybody's gift: the numbers are made up and the page says so in a band above it. What is real is the page itself,
 * `app/components/GiftPage.tsx`, drawn exactly as production draws it from a status of this shape.
 *
 * Production holds six gifts today, all of them connected, so most of the nine moments can only be seen here.
 */

export const SHAPES = ["days", "climb", "stamp", "shown"] as const;
export type Shape = (typeof SHAPES)[number];

export const MOMENTS = ["unopened", "notConnected", "running", "runningBack", "startTooHigh", "won", "over", "cameBack"] as const;
export type ExampleMoment = (typeof MOMENTS)[number];

/** The funder, the person it is for, somebody signed in who is neither, and somebody with no account at all. */
export const READERS = ["recipient", "funder", "outsider", "signedOut"] as const;
export type Reader = (typeof READERS)[number];

export type Example = Readonly<{ id: string; shape: Shape; moment: ExampleMoment; reader: Reader; status: GiftStatus | MilestoneStatus }>;

const DAY = 86_400;
const FUNDER = "Maman";
const RECIPIENT = "Léa";

/** Which moments each shape has: a daily gift has no start too high, and the "went back" day is a daily gift's alone. */
export function momentsOf(shape: Shape): readonly ExampleMoment[] {
  if (shape === "days") return MOMENTS.filter((moment) => moment !== "startTooHigh");
  if (shape === "climb") return MOMENTS.filter((moment) => moment !== "runningBack");
  // A certificate's clock starts when it is funded (MilestoneGift sets its deadline then), so it is never opened and
  // not started: it goes from unopened straight to waiting for its proof.
  return MOMENTS.filter((moment) => moment !== "runningBack" && moment !== "startTooHigh" && moment !== "notConnected");
}

export function exampleId(shape: Shape, moment: ExampleMoment, reader: Reader): string {
  return `${shape}-${moment}-${reader}`;
}

export function allExamples(nowMs: number): readonly Example[] {
  return SHAPES.flatMap((shape) => momentsOf(shape).flatMap((moment) => READERS.map((reader) => example(shape, moment, reader, nowMs))));
}

export function exampleById(id: string, nowMs: number = Date.now()): Example | undefined {
  return allExamples(nowMs).find((one) => one.id === id);
}

function example(shape: Shape, moment: ExampleMoment, reader: Reader, nowMs: number): Example {
  const status = shape === "days" ? daily(moment, reader, nowMs) : milestone(shape, moment, reader, nowMs);
  return { id: exampleId(shape, moment, reader), shape, moment, reader, status };
}

function who(reader: Reader) {
  return { youAreTheRecipient: reader === "recipient", youAreTheFunder: reader === "funder" };
}

/** Names reach the two people and whoever holds the link; the signed-in outsider is given none (D99). */
function names(reader: Reader) {
  return reader === "outsider" ? null : { recipientName: RECIPIENT, funderName: FUNDER };
}

function daily(moment: ExampleMoment, reader: Reader, nowMs: number): GiftStatus {
  const now = Math.floor(nowMs / 1000);
  const today = Math.floor(now / DAY);
  const opened = moment !== "unopened" && moment !== "cameBack";
  const connected = opened && moment !== "notConnected";
  const finished = moment === "won" || moment === "over";
  const start = connected ? (finished ? today - 7 : today - 3) : 0;
  const days: GiftStatus["days"] =
    moment === "running"
      ? [
          { day: start, outcome: "earned" },
          { day: start + 1, outcome: "returned" },
          { day: start + 2, outcome: "earned" },
        ]
      : moment === "runningBack"
        ? [
            { day: start, outcome: "earned" },
            { day: start + 1, outcome: "earned" },
            { day: start + 2, outcome: "returned" },
          ]
        : moment === "won"
          ? Array.from({ length: 7 }, (_, index) => ({ day: start + index, outcome: index === 3 ? ("returned" as const) : ("earned" as const) }))
          : moment === "over"
            ? Array.from({ length: 7 }, (_, index) => ({ day: start + index, outcome: "returned" as const }))
            : [];
  const credited = days.filter((day) => day.outcome === "earned").length;
  const missed = days.length - credited;
  const perDay = 1_000_000;
  const earned = moment === "won" ? credited * perDay : 0;
  const money = (units: number) => `$${(units / 1_000_000).toFixed(2)}`;
  return {
    kind: "daily",
    ...who(reader),
    catchUpSeconds: DAY,
    escrow: "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233",
    goalAccount: { username: connected || moment === "notConnected" ? "lea_learns" : null, source: "funder", bound: connected, code: null, codeExpiresAt: null },
    giftId: "900001",
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: String(7 * perDay),
    amountDisplay: money(7 * perDay),
    perDay: String(perDay),
    perDayDisplay: money(perDay),
    opened,
    connected,
    cancelled: moment === "cameBack",
    finished,
    creditedDays: credited,
    missedDays: missed,
    daysLeft: connected && !finished ? 7 - days.length : 0,
    earned: String(earned),
    earnedDisplay: money(earned),
    alreadyTheirsDisplay: money(credited * perDay),
    returnedDisplay: money(moment === "cameBack" ? 7 * perDay : missed * perDay),
    takenDisplay: money(0),
    days,
    lastReturnAtMs: moment === "cameBack" || missed > 0 ? (now - DAY) * 1000 : null,
    createdAtChain: now - 5 * DAY,
    claimedAtChain: opened ? now - 4 * DAY : 0,
    withdrawNonce: "0",
    todayDayIndex: connected ? today - start : 0,
    startDay: start,
    endDay: connected ? start + 6 : 0,
    recorded: [],
    names: names(reader),
  };
}

function milestone(shape: Exclude<Shape, "days">, moment: ExampleMoment, reader: Reader, nowMs: number): MilestoneStatus {
  const now = Math.floor(nowMs / 1000);
  const climb = shape === "climb";
  const opened = moment !== "unopened" && moment !== "cameBack";
  // A certificate is started from the moment it is funded; a climb from its first reading.
  const connected = climb ? opened && moment !== "notConnected" : moment !== "cameBack";
  const reached = moment === "won";
  const finished = moment === "won" || moment === "over";
  const target = climb ? 1500 : shape === "shown" ? 90 : 1;
  const startReading = climb && connected ? (moment === "startTooHigh" ? 1520 : 1280) : null;
  const todayReading = climb && connected ? (moment === "startTooHigh" ? 1520 : moment === "won" ? 1506 : moment === "over" ? 1390 : 1410) : null;
  const amount = 25_000_000;
  const money = (units: number) => `$${(units / 1_000_000).toFixed(2)}`;
  const phase: MilestoneStatus["phase"] =
    moment === "cameBack"
      ? "cancelled"
      : moment === "unopened"
        ? "unopened"
        : moment === "notConnected"
          ? "opened"
          : moment === "startTooHigh"
            ? "startTooHigh"
            : moment === "won"
              ? "reached"
              : moment === "over"
                ? "returned"
                : "climbing";
  return {
    kind: "milestone",
    shape: climb ? "climb" : "certificate",
    giftId: "1900001",
    conditionId: climb ? "chess-rating" : shape === "shown" ? "toefl-mybest-shown" : "coursera-certificate",
    ...who(reader),
    names: names(reader),
    goalAccount: { username: climb ? "lea_plays" : null, bound: connected, code: null, codeExpiresAt: null, namedByFunder: true },
    amount: String(amount),
    amountDisplay: money(amount),
    startReading,
    target,
    todayReading,
    readAtMs: todayReading === null ? null : (now - 3600) * 1000,
    deadlineMs: connected ? (moment === "over" ? now - DAY : now + 20 * DAY) * 1000 : null,
    durationDays: 30,
    opened,
    connected,
    reached,
    reachedAtMs: reached ? (now - 3600) * 1000 : null,
    finished,
    cancelled: moment === "cameBack",
    earned: String(reached ? amount : 0),
    earnedDisplay: money(reached ? amount : 0),
    takenDisplay: money(0),
    returnedDisplay: money(moment === "over" || moment === "cameBack" ? amount : 0),
    createdAtChain: now - 5 * DAY,
    claimedAtChain: opened ? now - 4 * DAY : 0,
    withdrawNonce: "0",
    escrow: "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e",
    phase,
    cadence: climb ? { id: "rapid", label: "Rapid" } : { id: "certificate", label: "Certificate" },
    accountClosed: false,
    maximumStart: 1300,
    standingAtOffer: climb ? 1280 : null,
    marathon: null,
  };
}
