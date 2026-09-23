import { keccak256, stringToHex, type Hex } from "viem";

/**
 * A GitHub contribution each day, read by Viky itself from GitHub's own API (D166).
 *
 * What is read is what GitHub itself counts on the person's profile: the contribution calendar, whose rule is
 * GitHub's and not ours (read on 23 Sep 2026 on docs.github.com, "Contributions on your profile"): a commit on the
 * default branch or the `gh-pages` branch of a repository that is not a fork, with an email the account owns; an
 * issue, a pull request or a discussion opened; a review. Private work counts only if the person chose to show it,
 * and then only as a number. A commit is dated by the time zone in its own timestamp, an issue or a pull request
 * opened on the web by the browser's ("Timezone-aware contribution graphs", GitHub's blog); the calendar's days are
 * GitHub's, and Viky reads the total from the day the account was connected, which the daily contract credits from
 * exactly as it credits Duolingo's experience.
 *
 * The API and not the site. GitHub's Acceptable Use Policies ("Information Usage Restrictions", read the same day)
 * allow scraping the site to researchers and archivists and to nobody else, and require that personal information
 * gathered through the API be used only for what the person authorised; the Terms of Service (section H) allow the
 * API within its rate limits. So Viky asks the GraphQL API with its own token, never the profile page, and reads one
 * person's calendar because that person connected their account to a gift. Unauthenticated, the API answers sixty
 * requests an hour for a whole address, which a shared deployment cannot count on: the token is what makes the
 * reading possible at all, and `githubConfigured()` says whether it is where this runs.
 *
 * Not attested. The reading service reads a public page by GET with no secret, and the calendar needs a POST carrying
 * the token, so tonight this reading is signed by the evidence signer on Viky's own word and by no attestor. The
 * register's help sentence says so, and the day the service takes a secret header the reading moves there.
 */

export const GITHUB_SOURCE = "GitHub";
export const GITHUB_PROVIDER_LABEL = "github";
/** The goal's provider id on the daily contract, goal 2: what every check-in for this condition must carry. */
export const GITHUB_PROVIDER_ID: Hex = keccak256(stringToHex("viky:provider:github-contributions:v1"));
export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/** GitHub's own rule for a login: letters, digits and single hyphens, neither first nor last, thirty-nine at most. */
export function isValidGithubLogin(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value);
}

export type GithubReadCode = "INVALID_USERNAME" | "NO_SUCH_USER" | "SOURCE_UNAVAILABLE" | "NOT_CONFIGURED";

export class GithubReadError extends Error {
  constructor(
    readonly code: GithubReadCode,
    message: string,
  ) {
    super(message);
    this.name = "GithubReadError";
  }
}

export type GithubUser = Readonly<{
  login: string;
  /** GitHub's numeric id of the account, which survives a change of login: the identity a gift is bound to. */
  databaseId: string;
  /** The profile's name and bio, where the person puts the code that proves the account is theirs. */
  name: string;
  bio: string;
  createdAt: string;
}>;

export type GithubContributions = Readonly<{
  /** The span read, as GitHub was asked it, ISO with the offset. */
  from: string;
  to: string;
  /** The calendar's total over the span: what the check-in carries. */
  total: number;
  days: readonly Readonly<{ date: string; count: number }>[];
}>;

const NUMERIC_ID = /^[1-9]\d{0,18}$/;

/** The first moment of the UTC day a time falls in, as GitHub's `from` takes it: the calendar's own day boundary. */
export function dayStartIso(atMs: number): string {
  return `${new Date(atMs).toISOString().slice(0, 10)}T00:00:00Z`;
}

/** The `user` object of GitHub's GraphQL answer, or a typed refusal when it is not one. */
export function parseGithubUser(value: unknown): GithubUser {
  const user = value as { login?: unknown; databaseId?: unknown; name?: unknown; bio?: unknown; createdAt?: unknown } | null;
  if (!user || typeof user !== "object") throw new GithubReadError("NO_SUCH_USER", "No GitHub account goes by that name");
  const login = typeof user.login === "string" ? user.login : "";
  const databaseId = typeof user.databaseId === "number" && Number.isSafeInteger(user.databaseId) ? String(user.databaseId) : "";
  if (!isValidGithubLogin(login) || !NUMERIC_ID.test(databaseId)) throw new GithubReadError("SOURCE_UNAVAILABLE", "GitHub answered without the account");
  return {
    login,
    databaseId,
    name: typeof user.name === "string" ? user.name : "",
    bio: typeof user.bio === "string" ? user.bio : "",
    createdAt: typeof user.createdAt === "string" ? user.createdAt : "",
  };
}

/** The `contributionsCollection` object of the answer: the calendar's total, and each day it holds. */
export function parseContributions(value: unknown, span: { from: string; to: string }): GithubContributions {
  const calendar = (value as { contributionCalendar?: { totalContributions?: unknown; weeks?: unknown } } | null)?.contributionCalendar;
  if (!calendar || typeof calendar.totalContributions !== "number" || !Number.isSafeInteger(calendar.totalContributions) || calendar.totalContributions < 0) {
    throw new GithubReadError("SOURCE_UNAVAILABLE", "GitHub answered without the calendar");
  }
  const days: { date: string; count: number }[] = [];
  for (const week of Array.isArray(calendar.weeks) ? calendar.weeks : []) {
    for (const day of Array.isArray((week as { contributionDays?: unknown })?.contributionDays) ? (week as { contributionDays: unknown[] }).contributionDays : []) {
      const { date, contributionCount } = (day ?? {}) as { date?: unknown; contributionCount?: unknown };
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (typeof contributionCount !== "number" || !Number.isSafeInteger(contributionCount) || contributionCount < 0) continue;
      days.push({ date, count: contributionCount });
    }
  }
  const summed = days.reduce((sum, day) => sum + day.count, 0);
  if (summed !== calendar.totalContributions) throw new GithubReadError("SOURCE_UNAVAILABLE", "GitHub's calendar does not add up to its own total");
  return { from: span.from, to: span.to, total: calendar.totalContributions, days };
}

/** The one question Viky asks GitHub, about one account and one span; nothing else about the person is requested. */
export const GITHUB_QUERY =
  "query($login:String!,$from:DateTime!,$to:DateTime!){ user(login:$login){ login databaseId name bio createdAt contributionsCollection(from:$from,to:$to){ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }";

export function githubToken(): string | undefined {
  const value = process.env.GITHUB_API_TOKEN?.trim();
  return value || undefined;
}

/** Whether the reading is possible where this runs: a boolean for the operator, never the value nor its shape. */
export function githubConfigured(): boolean {
  return Boolean(githubToken());
}

export type GithubReadDeps = Readonly<{
  fetch: typeof fetch;
  token: () => string | undefined;
}>;

export const liveGithubDeps: GithubReadDeps = { fetch: (input, init) => fetch(input, init), token: githubToken };

export type GithubReading = Readonly<{ user: GithubUser; contributions: GithubContributions }>;

/**
 * One account and its calendar over one span, from GitHub's GraphQL API. Every failure is typed: a name that is not
 * a login, an account that does not exist, GitHub not answering or refusing, and the token missing where this runs.
 */
export async function readGithub(login: string, span: { from: string; to: string }, deps: GithubReadDeps = liveGithubDeps): Promise<GithubReading> {
  if (!isValidGithubLogin(login)) throw new GithubReadError("INVALID_USERNAME", "That does not look like a GitHub name");
  const token = deps.token();
  if (!token) throw new GithubReadError("NOT_CONFIGURED", "The GitHub reading is not switched on where this runs");
  let response: Response;
  try {
    response = await deps.fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json", "user-agent": "Viky (viky.cash)" },
      body: JSON.stringify({ query: GITHUB_QUERY, variables: { login, from: span.from, to: span.to } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GithubReadError("SOURCE_UNAVAILABLE", "GitHub is not answering");
  }
  if (response.status !== 200) throw new GithubReadError("SOURCE_UNAVAILABLE", `GitHub answered ${response.status}`);
  const answer = (await response.json().catch(() => null)) as { data?: { user?: unknown }; errors?: { type?: unknown }[] } | null;
  if (!answer || typeof answer !== "object") throw new GithubReadError("SOURCE_UNAVAILABLE", "GitHub answered something that is not an answer");
  if (Array.isArray(answer.errors) && answer.errors.some((error) => error?.type === "NOT_FOUND")) throw new GithubReadError("NO_SUCH_USER", "No GitHub account goes by that name");
  if (!answer.data?.user) throw new GithubReadError(Array.isArray(answer.errors) && answer.errors.length > 0 ? "SOURCE_UNAVAILABLE" : "NO_SUCH_USER", "No GitHub account goes by that name");
  const user = parseGithubUser(answer.data.user);
  const contributions = parseContributions((answer.data.user as { contributionsCollection?: unknown }).contributionsCollection, span);
  return { user, contributions };
}
