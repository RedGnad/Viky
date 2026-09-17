import type { CharacterState } from "@/app/kit/Character";
import type { GiftSummary } from "@/src/client/gift";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";

/**
 * The example data every look is drawn with, the same for all three so that only the look changes between boards.
 * Nobody's gift and no real amount: a person called Sam holds $10.00, gave Ama a gift, received one from Maman, and is
 * offering one to Noé. The figures agree with each other across the six screens.
 */

export const SCREENS = [
  { id: "welcome", name: "Without an account", characters: true },
  { id: "home", name: "Home, with two gifts", characters: true },
  { id: "gift", name: "A gift's page", characters: true },
  { id: "amount", name: "Offering a gift: how much", characters: false },
  { id: "review", name: "Check this over", characters: false },
  { id: "made", name: "The gift is made", characters: true },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];

export const screenById = (id: string) => SCREENS.find((screen) => screen.id === id);

export const labHref = (look: string, screen: ScreenId | "motion" | "preview" | "icon") => `/dev/looks/${look}/${screen}`;

/** The account: $10.00, shown in euros, which it was €6.54 the last time Home was opened. */
export const ACCOUNT = { dollars: "$10.00", euros: 9.54, eurosBefore: 6.54, symbol: "€", rateDate: "17 Sep" } as const;

const base: GiftSummary = {
  giftId: "0",
  role: "funder",
  goalType: GOAL_TYPE_DUOLINGO_XP,
  goalUsername: null,
  usernameSource: "funder",
  recipientName: null,
  funderName: null,
  catchUpSeconds: 86_400,
  days: [],
  fundedAt: 0,
  startDay: 1,
  endDay: 1,
  amountDisplay: "$0.00",
  perDayDisplay: "$0.00",
  durationDays: 0,
  creditedDays: 0,
  missedDays: 0,
  opened: true,
  counting: true,
  finished: false,
  cancelled: false,
  earnedDisplay: "$0.00",
  theirsDisplay: "$0.00",
  returnedDisplay: "$0.00",
};

/** Given to Ama: $28.00 over 14 days, on its third day, two earned. */
export const TO_AMA: { gift: GiftSummary; days: CharacterState[] } = {
  gift: {
    ...base,
    giftId: "41",
    role: "funder",
    recipientName: "Ama",
    funderName: "Sam",
    goalUsername: "ama_learns",
    amountDisplay: "$28.00",
    perDayDisplay: "$2.00",
    durationDays: 14,
    creditedDays: 2,
    theirsDisplay: "$4.00",
  },
  days: ["earned", "earned", "today", ...Array<CharacterState>(11).fill("toCome")],
};

/** Received from Maman: $14.00 over 7 days, on its fifth day, two earned, one gone back, yesterday still catchable. */
export const FROM_MAMAN: { gift: GiftSummary; days: CharacterState[]; dates: string[] } = {
  gift: {
    ...base,
    giftId: "37",
    role: "recipient",
    recipientName: "Sam",
    funderName: "Maman",
    goalUsername: "sam_learns",
    amountDisplay: "$14.00",
    perDayDisplay: "$2.00",
    durationDays: 7,
    creditedDays: 2,
    missedDays: 1,
    earnedDisplay: "$4.00",
    theirsDisplay: "$4.00",
    returnedDisplay: "$2.00",
  },
  days: ["earned", "returned", "earned", "catchable", "today", "toCome", "toCome"],
  dates: ["13", "14", "15", "16", "17", "18", "19"],
};

/**
 * What the last visit saw, for a device that keeps no record of one: one settled day of each gift. So arriving on Home
 * plays Maman's day gone back and her newest day earned, and Ama's second day earned, then the amount counts from what
 * the account held then; arriving on Maman's gift plays its two days, then what is yours counts from $2.00.
 */
export const LAST_VISIT = { settledDays: 1, homeEuros: 6.54, yoursDollars: 2, yoursNow: 4 } as const;

/** The link a gift is sent by, as a messaging app shows it (brief, section 7 bis). */
export const PREVIEW_EXAMPLE = { funder: "Maman", amount: "$25.00" } as const;

export const MAMAN_RANGE = "13 Sep to 19 Sep";

/** The gift being offered to Noé: $7.00 over 7 days, $1.00 a day, from the $10.00 the account holds. */
export const TO_NOE = {
  recipient: "Noé",
  funder: "Sam",
  username: "noe_learns",
  amount: "$7.00",
  perDay: "$1.00",
  days: 7,
  target: 10,
  held: "$10.00",
  settlingTime: "07:00",
  made: "17 Sep at 16:20",
  giftId: "42",
  link: "https://viky.cash/g/42?t=example",
} as const;
