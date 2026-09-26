import {
  CHESS_TACTICS,
  CHESS_USER_AGENT,
  chessProfileUrl,
  chessRatingPattern,
  chessStatsUrl,
  chessStatusPattern,
  chessTacticsPattern,
  isValidChessUsername,
  type ChessClimb,
  type ChessMode,
} from "./chess-com";
import { credlyAssertionUrl, credlyPublicUrl, isValidCredlyBadgeId } from "./credly-badge";
import { detDataUrl, isValidDetAlias } from "./duolingo-english-test";
import { duolingoCourseXpPattern, duolingoProfileUrl, isDuolingoCourseId } from "./duolingo-public-terms";

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
  /**
   * What the reading asks for, when the page is not the JSON every other source answers with. Credly's badge page
   * varies on `Accept` and answers 500 to `application/json` (measured 20 Sep 2026), so a reading that did not say
   * this could never be taken at all.
   */
  accept?: string;
  /**
   * A source the person connected (D188): the page opens only with their key, which the caller hands to the fetch as a
   * secret the attestor never sees, never in the URL and never in the proof. Absent on every public page.
   */
  auth?: "bearer";
  /** A page asked by POST (D197): the method and the body are part of what the attestor signs, and both are checked. */
  method?: "POST";
  body?: (account: string) => string;
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

/** How a course source names itself, and the one shape `attestedSource` will build one from. */
export const DUOLINGO_COURSE_PREFIX = "duolingo-course-";

/**
 * The same public profile, read for one course rather than for the experience total (U1). One source per course, as
 * Chess.com has one per cadence: the pattern is anchored on the course id, so experience won in another course is not
 * in the reading at all, and a course the profile does not carry makes the reading fail rather than return zero.
 *
 * These are built on demand rather than listed, because the list would be Duolingo's whole catalogue. The course id is
 * checked against `isDuolingoCourseId` before anything is built, here and in the worker, so nothing a caller writes
 * ever reaches a pattern or a URL.
 */
export function duolingoCourseSource(courseId: string): AttestedSource | undefined {
  if (!isDuolingoCourseId(courseId)) return undefined;
  return {
    id: `${DUOLINGO_COURSE_PREFIX}${courseId}`,
    service: "Duolingo",
    accepts: DUOLINGO_PROFILE.accepts,
    url: duolingoProfileUrl,
    matches: [
      { type: "regex", value: '"id":(?<id>\\d+)' },
      { type: "regex", value: '"username":"(?<username>[^"]+)"' },
      { type: "regex", value: '"name":"(?<name>[^"]*)"' },
      { type: "regex", value: duolingoCourseXpPattern(courseId) },
    ],
  };
}

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
 * The same page read for the puzzle record, which is not a cadence: one block, one number, and no RD beside it
 * (measured 20 Sep 2026, src/chess-com.ts). It is a source of its own for the same reason each cadence is: the
 * pattern names the block it reads, so nothing else on that page can settle a gift made on this one.
 */
export const CHESS_TACTICS_RATING: AttestedSource = {
  id: "chess-tactics",
  service: "Chess.com",
  accepts: isValidChessUsername,
  url: chessStatsUrl,
  userAgent: CHESS_USER_AGENT,
  matches: [{ type: "regex", value: chessTacticsPattern() }],
};

/** The source one climb is read from, whichever kind it is. */
export function chessClimbSource(climb: ChessClimb): AttestedSource {
  return climb === CHESS_TACTICS ? CHESS_TACTICS_RATING : CHESS_RATINGS[climb];
}

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
    // Anchored on the objects the page puts them in, read on a live certificate on 19 Sep 2026. The names sit in a
    // `SignatureTrackProfile`, the course in a `Course_Course`, the certificate in an `AccomplishmentsVCMembership`.
    // Unanchored, `"slug"` alone matches three places on that page and `"name"` matches dozens, so a pattern without
    // its object could hand another course's word to the contract.
    { type: "regex", value: '"AccomplishmentsSignatureTrackProfile","firstName":"(?<firstName>[^"]*)","lastName":"(?<lastName>[^"]*)"' },
    { type: "regex", value: '"Course_Course","id":"(?<courseId>[^"]+)","slug":"(?<slug>[a-z0-9-]+)","name":"(?<courseName>[^"]+)"' },
    { type: "regex", value: '"AccomplishmentsVCMembership","certificateCode":"(?<certificateCode>[A-Z0-9]+)"' },
    // Milliseconds, not seconds: 1728878220063 on the certificate measured. Pinned to thirteen digits so a pattern
    // that also matched seconds cannot quietly hand a thousand-fold wrong date to the contract.
    { type: "regex", value: '"grantedAt":(?<grantedAt>\\d{13})' },
  ],
};

/**
 * A certification on Credly, the assertion half: the Open Badges record of one badge. It says the day and which
 * certification it is, and it is read as JSON.
 *
 * Three patterns and no fourth. The same answer carries the holder as a hashed email, and nothing here matches it,
 * so nothing carries it out of the attestor. The `badge` URL is taken whole, because the issuer's id and the badge
 * class's id together are what this condition is judged by, and half of that pair would let another course of the
 * same issuer settle the gift. Measured on three live badges on 20 Sep 2026.
 */
export const CREDLY_ASSERTION: AttestedSource = {
  id: "credly-assertion",
  service: "Credly",
  accepts: isValidCredlyBadgeId,
  url: credlyAssertionUrl,
  matches: [
    { type: "regex", value: '"badge":"(?<badge>https://www\\.credly\\.com/api/v1/obi/v2/issuers/[0-9a-f-]{36}/badge_classes/[0-9a-f-]{36})"' },
    { type: "regex", value: '"id":"(?<assertion>https://www\\.credly\\.com/api/v1/obi/v2/badge_assertions/[0-9a-f-]{36})"' },
    { type: "regex", value: '"issuedOn":"(?<issuedOn>\\d{4}-\\d{2}-\\d{2})T\\d{2}:\\d{2}:\\d{2}' },
  ],
};

/**
 * The same badge's public page, the only place Credly publishes the holder's name: one `og:title` of a fixed shape,
 * "<title> was issued by <issuer> to <holder>.". Its `og:url` is read with it, so a page about another badge cannot
 * pass for this one. The page varies on `Accept` and answers 500 when asked for JSON, so it is read as HTML.
 */
export const CREDLY_BADGE_PAGE: AttestedSource = {
  id: "credly-badge-page",
  service: "Credly",
  accepts: isValidCredlyBadgeId,
  url: credlyPublicUrl,
  userAgent: CHESS_USER_AGENT,
  accept: "text/html",
  matches: [
    { type: "regex", value: '<meta property="og:title" content="(?<ogTitle>[^"]+)"' },
    { type: "regex", value: '<meta property="og:url" content="(?<ogUrl>https://www\\.credly\\.com/badges/[0-9a-f-]{36})"' },
  ],
};

/**
 * A Duolingo English Test result, read from the answer behind the page its taker chose to make public (U3).
 *
 * Three patterns and no more, on purpose. The answer also carries the taker's date of birth and a link to their
 * photograph: nothing here matches them, so nothing carries them out of the attestor, and the privacy page says that
 * the attestor sees the whole answer while Viky is given three fields of it.
 *
 * Measured on 18 Sep 2026 on two live certificates: the score is a bare number, the day of the test is a plain
 * `YYYY-MM-DD`, and the name is printed surname first with a comma inside the string, which is why the name pattern
 * takes everything up to the closing quote.
 */
export const DET_CERTIFICATE: AttestedSource = {
  id: "det-certificate",
  service: "Duolingo English Test",
  accepts: isValidDetAlias,
  url: detDataUrl,
  userAgent: CHESS_USER_AGENT,
  matches: [
    { type: "regex", value: '"overall_score":(?<overallScore>\\d{1,3})' },
    { type: "regex", value: '"test_date":"(?<testDate>\\d{4}-\\d{2}-\\d{2})"' },
    { type: "regex", value: '"full_name":"(?<fullName>[^"]+)"' },
  ],
};

/**
 * The day's active minutes on the person's Google Health account, which reads their Fitbit or Pixel Watch (D197):
 * `POST https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints:dailyRollUp`, scope
 * `googlehealth.activity_and_fitness.readonly`. The account a caller names is the day, `yyyy-MM-dd`; the body asks that
 * civil day and the next, one window, Google's and Fitbit's own wearables only. The whole roll-up must match, since its
 * levels come in no promised order; the app adds the moderate and vigorous minutes and drops the rest. The body is
 * built here, not imported: what is fetched must live in the fingerprinted files.
 */
export const GOOGLE_HEALTH_ACTIVE_MINUTES: AttestedSource = {
  id: "google-health-active-minutes",
  service: "Google Health",
  auth: "bearer",
  method: "POST",
  accepts: (day) => /^\d{4}-\d{2}-\d{2}$/.test(day),
  url: () => "https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints:dailyRollUp",
  body: (day) => {
    const start = new Date(`${day}T00:00:00Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const date = (at: Date) => ({ year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() });
    return JSON.stringify({ range: { start: { date: date(start) }, end: { date: date(end) } }, windowSizeDays: 1, dataSourceFamily: "users/me/dataSourceFamilies/google-wearables" });
  },
  matches: [{ type: "regex", value: "(?<rollup>\\{[\\s\\S]*\\})" }],
};

/**
 * Strava's activities of one day, read with the person's own key (D191): "List Athlete Activities", scope
 * `activity:read`. The account a caller names is the day, `yyyy-MM-dd`. The whole list must match, since a day is the
 * sum of its activities: the app reads the distances out of it and drops it, with the routes and the times.
 */
export const STRAVA_DAY_ACTIVITIES: AttestedSource = {
  id: "strava-day-activities",
  service: "Strava",
  auth: "bearer",
  accept: "application/json",
  accepts: (day) => /^\d{4}-\d{2}-\d{2}$/.test(day),
  // The day's UTC bounds, computed here rather than imported, for the same reason as the body above.
  url: (day) => {
    const start = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1_000);
    return `https://www.strava.com/api/v3/athlete/activities?after=${start - 1}&before=${start + 86_400}&per_page=30`;
  },
  matches: [{ type: "regex", value: "(?<activities>\\[[\\s\\S]*\\])" }],
};

/**
 * An edX certificate's public page (D212): server-rendered HTML, measured on a live certificate on 24 Sep 2026. Six
 * patterns, each on the class or the words the page gives the value: the organisation and the course number in the
 * title, the track in the rendering's class, the holder, the course's printed name, the day of issue, and the
 * certificate's own id in its own link, so a redirect to another certificate is caught.
 */
export const EDX_CERTIFICATE: AttestedSource = {
  id: "edx-certificate",
  service: "edX",
  accept: "text/html",
  accepts: (account) => /^[0-9a-f]{32}$/.test(account),
  url: (account) => `https://courses.edx.org/certificates/${account}`,
  matches: [
    { type: "regex", value: "<title>(?<org>[A-Za-z0-9._-]+) (?<courseNumber>[A-Za-z0-9._-]+) Certificate \\| edX</title>" },
    { type: "regex", value: '<div class="wrapper-accomplishment-title (?<track>[a-z-]+)">' },
    { type: "regex", value: '<strong class="accomplishment-recipient">(?<name>[^<]+)</strong>' },
    { type: "regex", value: '<span class="accomplishment-course-name">(?<courseName>[^<]+)</span>' },
    { type: "regex", value: "Issued (?<issued>[A-Z][a-z]+ \\d{1,2}, \\d{4})</span>" },
    { type: "regex", value: '<a href="https://courses\\.edx\\.org/certificates/(?<certificateId>[0-9a-f]{32})">' },
  ],
};

/**
 * A certificate's public page on MITx Online (D222): server-rendered HTML, measured on two live program certificates
 * on 24 Sep 2026, the course certificate served by the same template. Four patterns, each on the words or the class the
 * page gives the value: the course or program in the title, the holder, the day of issue, and the certificate's own id
 * in its own link, so a page about another certificate is caught.
 */
export const MITX_ONLINE_CERTIFICATE: AttestedSource = {
  id: "mitx-online-certificate",
  service: "MITx Online",
  accept: "text/html",
  accepts: (account) => /^(program\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(account),
  url: (account) => `https://mitxonline.mit.edu/certificate/${account}/`,
  matches: [
    { type: "regex", value: "<title>MITx Online \\| Certificate for: (?<title>[^<]+)</title>" },
    { type: "regex", value: '<span class="certify-name">(?<name>[^<]+)</span>' },
    { type: "regex", value: "Issued: (?<issued>[A-Z][a-z]+\\.? \\d{1,2}, \\d{4})" },
    { type: "regex", value: '<a href="https?://mitxonline\\.mit\\.edu/certificate/(?:program/)?(?<certificateId>[0-9a-f-]{36})/?" target="_blank">' },
  ],
};

/**
 * A runner's own page on Breizh Chrono's results site (D273), server-rendered, measured on the Marathon de Dakar 2023
 * on 26 Sep 2026 (bibs 347, 1, 184 and 141). The account is the race's reference, its heat and the bib, in one string.
 * Three patterns: the runner and the bib in the page's title ("FALL Mor (N°347)", the degree sign matched as any
 * character so the encoding never decides), and the official time in its own cell. A runner who did not finish has
 * "00:00:00" there; a bib nobody wore answers an empty page, which no pattern matches.
 */
export const BREIZH_CHRONO_RUNNER: AttestedSource = {
  id: "breizh-chrono-runner",
  service: "Breizh Chrono",
  accept: "text/html",
  accepts: (account) => /^\d{10,16}-\d{1,6}\|[a-z0-9-]{1,40}\|\d{1,6}$/.test(account),
  url: (account) => {
    const [ref, heat, bib] = account.split("|");
    return `https://resultats.breizhchrono.com/bc/resultats/coureur.jsp?ref=${ref}&heat=${heat}&dossard=${bib}`;
  },
  matches: [
    { type: "regex", value: '<h1 class="title[^"]*"\\s*>(?<runner>[^<(]+?)\\s*\\(N[^\\d<]{0,3}(?<bib>\\d{1,6})\\)</h1>' },
    { type: "regex", value: '<span class="timeTitle">Temps Officiel</span>\\s*<span class="timeValue">(?<official>\\d{1,2}:\\d{2}:\\d{2})</span>' },
  ],
};

/**
 * A runner's own page on a results site MikaTiming runs (the founder, 27 Sep 2026: a second timing company), measured
 * on Frankfurt 2025, Chicago 2025, Berlin 2025 and Boston 2026 on 26 Sep 2026. The account names the site and the
 * year, the runner's id on it (found by src/mika-timing.ts from the search by bib, which is not attested) and the bib
 * the gift binds: `frankfurt.r.mikatiming.de/2025|HCH3BKLB662C9A|3166`. Four patterns: the name, the bib as the page
 * prints it (which the reading compares with the account's), the net finish time (the one every site prints; Chicago
 * prints no gun time), and the page's own `og:url`, which carries the year and the id, so a site that answers another
 * year's page (Frankfurt 2026 answered 2025's on 26 Sep 2026) is caught. The sites answer 403 to a bare user agent
 * ("Mozilla/5.0 (Viky)", "curl", measured 26 Sep 2026) and 200 to one that names its author and its site in the
 * form every crawler uses, which is the one sent: Viky says who it is, never pretends to be a browser.
 */
export const MIKA_TIMING_RUNNER: AttestedSource = {
  id: "mika-timing-runner",
  service: "MikaTiming",
  accept: "text/html",
  userAgent: "Mozilla/5.0 (compatible; Viky/1.0; +https://viky.cash)",
  accepts: (account) => /^(?:results\.chicagomarathon\.com|frankfurt\.r\.mikatiming\.de|boston\.r\.mikatiming\.com|berlin\.r\.mikatiming\.com)\/20\d\d\|[A-Z0-9]{8,24}\|[A-Z]{0,2}\d{1,6}$/.test(account),
  url: (account) => {
    const [site, idp] = account.split("|");
    return `https://${site}/?content=detail&idp=${idp}`;
  },
  matches: [
    { type: "regex", value: '<td class="f-__fullname last">(?<runner>[^<]+)</td>' },
    { type: "regex", value: '<td class="f-start_no(?:_text)? last">(?<bib>[A-Z]{0,2}\\d{1,6})</td>' },
    { type: "regex", value: '<td class="f-time_finish_netto last">(?<official>\\d{1,2}:\\d{2}:\\d{2})</td>' },
    { type: "regex", value: 'property="og:url" content="https://[a-z0-9.-]+/(?<year>20\\d\\d)/\\?content=detail&amp;event=[A-Za-z0-9_]+&amp;(?:event_main_group=\\d+&amp;)?idp=(?<idp>[A-Z0-9]+)' },
  ],
};

/**
 * A credential's public record on Accredible (D213), the JSON its page is drawn from, measured on a live credential on
 * 24 Sep 2026. Seven patterns, each anchored on its own key or object: the uuid and the title together, the day of
 * issue, expired, revoked, private, the recipient's name inside the recipient object (its masked email matched and
 * never captured), and the issuer's website inside the issuer object.
 */
export const ACCREDIBLE_CREDENTIAL: AttestedSource = {
  id: "accredible-credential",
  service: "Accredible",
  accepts: (account) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(account),
  url: (account) => `https://api.accredible.com/v1/credential-net/credentials/${account}`,
  matches: [
    { type: "regex", value: '"uuid":"(?<uuid>[0-9a-f-]{36})","name":"(?<title>[^"]*)"' },
    { type: "regex", value: '"issued_on":"(?<issuedOn>\\d{4}-\\d{2}-\\d{2})"' },
    { type: "regex", value: '"expired":(?<expired>true|false)' },
    { type: "regex", value: '"revoked_at":(?<revokedAt>null|"[^"]*")' },
    { type: "regex", value: '"private":(?<private>true|false)' },
    { type: "regex", value: '"recipient":\\{"email":"[^"]*","name":"(?<name>[^"]*)"' },
    { type: "regex", value: '"issuer":\\{"id":(?<issuerId>\\d+),"name":"[^"]*","url":"(?<issuerUrl>[^"]*)"' },
  ],
};

const ALL: readonly AttestedSource[] = [DUOLINGO_PROFILE, CHESS_PROFILE, CHESS_PLAYER, ...Object.values(CHESS_RATINGS), CHESS_TACTICS_RATING, COURSERA_CERTIFICATE, CREDLY_ASSERTION, CREDLY_BADGE_PAGE, DET_CERTIFICATE, EDX_CERTIFICATE, ACCREDIBLE_CREDENTIAL, MITX_ONLINE_CERTIFICATE, BREIZH_CHRONO_RUNNER, MIKA_TIMING_RUNNER, GOOGLE_HEALTH_ACTIVE_MINUTES, STRAVA_DAY_ACTIVITIES];

/**
 * The headers a source is read with, which is part of what is fetched and therefore lives with the sources: it is
 * covered by the reading fingerprint, where it used to sit beside the verification and be invisible to it.
 *
 * Chess.com answers a request without a user agent with a challenge page, and Credly's badge page varies on
 * `Accept` and answers 500 to `application/json` (measured 20 Sep 2026), so both are the source's to say.
 */
export function headersFor(source: AttestedSource): Record<string, string> {
  return { accept: source.accept ?? "application/json", "user-agent": source.userAgent ?? "Mozilla/5.0 (Viky)" };
}

/** The source with that name, or nothing. An unknown name is refused rather than guessed at. */
export function attestedSource(id: string): AttestedSource | undefined {
  const listed = ALL.find((source) => source.id === id);
  if (listed) return listed;
  // One Duolingo course, built from its id alone and only when that id is one Duolingo could have (U1).
  return id.startsWith(DUOLINGO_COURSE_PREFIX) ? duolingoCourseSource(id.slice(DUOLINGO_COURSE_PREFIX.length)) : undefined;
}

export function attestedSourceIds(): readonly string[] {
  return ALL.map((source) => source.id);
}
