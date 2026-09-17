import { CHESS_USER_AGENT, chessProfileUrl, chessRatingPattern, chessStatsUrl, chessStatusPattern, isValidChessUsername, type ChessMode } from "./chess-com";

/**
 * The public pages Viky is allowed to read, and nothing else. Browser safe, and shared by the app and the
 * attested-fetch worker so both agree on exactly one list.
 *
 * The worker never takes a URL from its caller. It takes the name of a source from this list and an account
 * name, and builds the URL itself. A worker that fetched whatever it was told would be an open relay
 * signed by an attestor, which is a far worse thing than the reading it was built for.
 */

export type ResponseMatch = { type: "regex"; value: string };

export type AttestedSource = Readonly<{
  id: string;
  /** What a person would call it. */
  service: string;
  /** True only for an account name this source could actually have. */
  accepts: (account: string) => boolean;
  /** The page to read, built here and never supplied by a caller. */
  url: (account: string) => string;
  /** What the answer must contain for the proof to be worth anything. */
  matches: readonly ResponseMatch[];
  /** The user agent the page is read with, when the site asks for one of its own. */
  userAgent?: string;
}>;

/** Duolingo's public profile: the identity, the display name, and the experience total (D27). */
export const DUOLINGO_PROFILE: AttestedSource = {
  id: "duolingo-profile",
  service: "Duolingo",
  accepts: (account) => /^[A-Za-z0-9._-]{2,30}$/.test(account),
  url: (account) => `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(account)}`,
  matches: [
    { type: "regex", value: '"id":(?<id>\\d+)' },
    { type: "regex", value: '"totalXp":(?<totalXp>\\d+)' },
    { type: "regex", value: '"username":"(?<username>[^"]+)"' },
    { type: "regex", value: '"name":"(?<name>[^"]*)"' },
    { type: "regex", value: '"streak":(?<streak>\\d+)' },
  ],
};

/**
 * Chess.com's public profile, for the binding: `player_id` is the identity that survives a change of username, and
 * `name` is the field a person can edit, which is where a binding code goes, exactly as on Duolingo. Chess.com leaves
 * `name` out of the answer entirely when the person never filled it in (measured on 17 Sep 2026 on foo, bar and
 * test123), so this reading refuses a profile without one, which is the right answer for a binding: no name, no code.
 *
 * `status` is read with them, on this reading and on every later one (U1): it is where Chess.com publishes that it has
 * closed an account, and a closed account can neither be bound nor reach a target here.
 */
export const CHESS_PROFILE: AttestedSource = {
  id: "chess-profile",
  service: "Chess.com",
  accepts: isValidChessUsername,
  url: chessProfileUrl,
  userAgent: CHESS_USER_AGENT,
  matches: [
    { type: "regex", value: '"player_id":(?<playerId>\\d+)' },
    { type: "regex", value: '"username":"(?<username>[^"]+)"' },
    { type: "regex", value: '"name":"(?<name>[^"]*)"' },
    { type: "regex", value: chessStatusPattern() },
  ],
};

/**
 * The same page for every later reading, without the name: who this username is today, what Chess.com says of the
 * account, whether or not they ever filled in a name. Read beside each rating, because the ratings page carries no
 * identity of its own.
 */
export const CHESS_PLAYER: AttestedSource = {
  id: "chess-player",
  service: "Chess.com",
  accepts: isValidChessUsername,
  url: chessProfileUrl,
  userAgent: CHESS_USER_AGENT,
  matches: [
    { type: "regex", value: '"player_id":(?<playerId>\\d+)' },
    { type: "regex", value: '"username":"(?<username>[^"]+)"' },
    { type: "regex", value: chessStatusPattern() },
  ],
};

/**
 * Chess.com's public ratings, one reading per cadence. The page lists its cadences in no fixed order, so a single
 * pattern for "any cadence" returned whichever came first: `daily` for hikaru, `rapid` for magnuscarlsen, measured on
 * 17 Sep 2026. Each cadence is therefore its own source with its own pattern, and the goal type of a gift names one.
 */
function chessRatings(mode: ChessMode): AttestedSource {
  return {
    id: `chess-ratings-${mode}`,
    service: "Chess.com",
    accepts: isValidChessUsername,
    url: chessStatsUrl,
    userAgent: CHESS_USER_AGENT,
    matches: [{ type: "regex", value: chessRatingPattern(mode) }],
  };
}

export const CHESS_RATINGS: Readonly<Record<ChessMode, AttestedSource>> = {
  rapid: chessRatings("rapid"),
  blitz: chessRatings("blitz"),
  bullet: chessRatings("bullet"),
  daily: chessRatings("daily"),
};

/**
 * A Coursera certificate, read from its public verification page. No account is needed and the page carries,
 * in one answer, who it was granted to, which course, the code itself, and the day it was granted.
 *
 * Verified on 13 Sep 2026 against six certificates granted between May 2014 and July 2023, all sharing the
 * same shape. The most recent one reachable was 2023: the codes that are public are the ones people put in
 * a profile years ago. Nine years of stability is a better sign than a single fresh page, but it is not the
 * same as one, and a change of shape would break a test here rather than a gift.
 *
 * `/verify/<code>` redirects, so the page after the redirect is what is read.
 */
export const COURSERA_CERTIFICATE: AttestedSource = {
  id: "coursera-certificate",
  service: "Coursera",
  accepts: (account) => /^[A-Z0-9]{8,20}$/.test(account),
  url: (account) => `https://www.coursera.org/account/accomplishments/verify/${encodeURIComponent(account.toUpperCase())}`,
  matches: [
    { type: "regex", value: '"firstName":"(?<firstName>[^"]*)"' },
    { type: "regex", value: '"lastName":"(?<lastName>[^"]*)"' },
    { type: "regex", value: '"courseId":"(?<courseId>[^"]+)"' },
    { type: "regex", value: '"certificateCode":"(?<certificateCode>[A-Z0-9]+)"' },
    // Milliseconds, not seconds: 1594224731127 on every page read. Pinned to thirteen digits so a pattern
    // that also matched seconds cannot quietly hand a thousand-fold wrong date to the contract.
    { type: "regex", value: '"grantedAt":(?<grantedAt>\\d{13})' },
  ],
};

const ALL: readonly AttestedSource[] = [DUOLINGO_PROFILE, CHESS_PROFILE, CHESS_PLAYER, ...Object.values(CHESS_RATINGS), COURSERA_CERTIFICATE];

/** The source with that name, or nothing. An unknown name is refused rather than guessed at. */
export function attestedSource(id: string): AttestedSource | undefined {
  return ALL.find((source) => source.id === id);
}

export function attestedSourceIds(): readonly string[] {
  return ALL.map((source) => source.id);
}
