import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { GITHUB_DAILY } from "../src/conditions";
import { GITHUB_CALENDAR, plainReadingIds } from "../src/plain-readings";
import { GOAL_TYPE_GITHUB_CONTRIBUTIONS } from "../src/gift-terms";
import {
  dayStartIso,
  GITHUB_GRAPHQL_URL,
  GITHUB_PROVIDER_ID,
  GITHUB_QUERY,
  GithubReadError,
  githubConfigured,
  isValidGithubLogin,
  parseContributions,
  parseGithubUser,
  readGithub,
  type GithubReadDeps,
} from "../src/github-contributions";

/**
 * A GitHub contribution each day (D166): what is asked of GitHub, what its answer must be, and what a wrong answer is
 * called. The answer below is GitHub's own, captured on 23 Sep 2026 from the GraphQL API for a public account over
 * four days, so a change of shape breaks a test rather than a gift.
 */

const ANSWER = {
  data: {
    user: {
      login: "torvalds",
      databaseId: 1024025,
      name: "Linus Torvalds",
      bio: null,
      createdAt: "2011-09-03T15:26:22Z",
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 41,
          weeks: [
            { contributionDays: [{ date: "2026-09-19", contributionCount: 22 }] },
            {
              contributionDays: [
                { date: "2026-09-20", contributionCount: 14 },
                { date: "2026-09-21", contributionCount: 1 },
                { date: "2026-09-22", contributionCount: 4 },
              ],
            },
          ],
        },
      },
    },
  },
};

const SPAN = { from: "2026-09-19T00:00:00Z", to: "2026-09-22T23:59:59Z" };

function answering(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): GithubReadDeps {
  return {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
    token: () => "ghp_test",
  };
}

test("the goal is number 2 on the daily contract, its provider id pinned by name, and the register says so", () => {
  assert.equal(GITHUB_PROVIDER_ID, keccak256(stringToHex("viky:provider:github-contributions:v1")));
  assert.equal(GITHUB_PROVIDER_ID, "0xda1048bc067600c20909ee6e262729bc5087ae37f5478c3beb4d6f21d9922050", "the id written in OPERATIONS for the owner to sign");
  assert.equal(GITHUB_DAILY.goalType, GOAL_TYPE_GITHUB_CONTRIBUTIONS);
  assert.equal(GOAL_TYPE_GITHUB_CONTRIBUTIONS, 2);
  assert.equal(GITHUB_DAILY.live, false, "not live until goal 2 is registered, the token is in place and a real gift has run");
  assert.equal(GITHUB_DAILY.reading, GITHUB_CALENDAR.id, "a reading on Viky's own word, listed as such");
  assert.deepEqual(plainReadingIds(), ["github-calendar", "lichess-user"], "the two readings made on Viky's own word, and no other");
  assert.equal(GITHUB_CALENDAR.url, GITHUB_GRAPHQL_URL);
  assert.match(GITHUB_DAILY.help, /by Viky itself/, "the help sentence says no attestor stands behind the reading");
  assert.ok(GITHUB_DAILY.name.length <= 30);
});

test("a login is GitHub's own shape: letters, digits and single hyphens, neither first nor last, thirty-nine at most", () => {
  for (const good of ["octocat", "ama-codes", "a", "x1", "a".repeat(39)]) assert.ok(isValidGithubLogin(good), good);
  for (const bad of ["", "-octocat", "octocat-", "octo--cat", "octo cat", "octo_cat", "octo.cat", "a".repeat(40), "torvalds/linux"]) assert.equal(isValidGithubLogin(bad), false, bad);
});

test("the day a span starts on is the first moment of that UTC day, which is GitHub's own calendar boundary", () => {
  assert.equal(dayStartIso(Date.UTC(2026, 8, 23, 3, 40, 12)), "2026-09-23T00:00:00Z");
  assert.equal(dayStartIso(Date.UTC(2026, 8, 22, 23, 59, 59)), "2026-09-22T00:00:00Z");
});

test("GitHub's own answer is read whole: the account by its numeric id, and the calendar day by day, adding up to its total", () => {
  const user = parseGithubUser(ANSWER.data.user);
  assert.deepEqual(user, { login: "torvalds", databaseId: "1024025", name: "Linus Torvalds", bio: "", createdAt: "2011-09-03T15:26:22Z" });
  const calendar = parseContributions(ANSWER.data.user.contributionsCollection, SPAN);
  assert.equal(calendar.total, 41);
  assert.deepEqual(
    calendar.days.map((day) => [day.date, day.count]),
    [
      ["2026-09-19", 22],
      ["2026-09-20", 14],
      ["2026-09-21", 1],
      ["2026-09-22", 4],
    ],
  );
  assert.throws(() => parseGithubUser({ login: "torvalds" }), /without the account/, "no numeric id, no identity to bind");
  assert.throws(() => parseGithubUser(null), /No GitHub account/);
  const lying = { contributionCalendar: { totalContributions: 40, weeks: ANSWER.data.user.contributionsCollection.contributionCalendar.weeks } };
  assert.throws(() => parseContributions(lying, SPAN), /does not add up/, "a calendar whose days do not sum to its total is not read");
  assert.throws(() => parseContributions({}, SPAN), /without the calendar/);
});

test("one question is asked, of the API and never the site, with the token and about one login and one span", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const reading = await readGithub("torvalds", SPAN, answering(200, ANSWER, seen));
  assert.equal(seen.url, GITHUB_GRAPHQL_URL);
  assert.equal(seen.init?.method, "POST");
  const headers = seen.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer ghp_test");
  const body = JSON.parse(String(seen.init?.body)) as { query: string; variables: Record<string, string> };
  assert.equal(body.query, GITHUB_QUERY);
  assert.deepEqual(body.variables, { login: "torvalds", from: SPAN.from, to: SPAN.to });
  assert.doesNotMatch(GITHUB_QUERY, /email|repositories|followers|organizations/, "nothing about the person is asked beyond the account and its calendar");
  assert.equal(reading.user.databaseId, "1024025");
  assert.equal(reading.contributions.total, 41);
});

test("every failure is typed: a name that is not a login, an account that does not exist, GitHub not answering, no token", async () => {
  const code = async (login: string, deps: GithubReadDeps) => readGithub(login, SPAN, deps).then(() => "ok", (error: unknown) => (error instanceof GithubReadError ? error.code : String(error)));
  assert.equal(await code("octo cat", answering(200, ANSWER)), "INVALID_USERNAME");
  assert.equal(await code("nobody-here", answering(200, { data: { user: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve to a User" }] })), "NO_SUCH_USER");
  assert.equal(await code("torvalds", answering(502, "bad gateway")), "SOURCE_UNAVAILABLE");
  assert.equal(await code("torvalds", answering(200, { data: null, errors: [{ type: "RATE_LIMITED" }] })), "SOURCE_UNAVAILABLE");
  assert.equal(await code("torvalds", answering(200, "not json")), "SOURCE_UNAVAILABLE");
  assert.equal(await code("torvalds", { ...answering(200, ANSWER), token: () => undefined }), "NOT_CONFIGURED");
  const failing: GithubReadDeps = { fetch: (async () => { throw new Error("offline"); }) as typeof fetch, token: () => "ghp_test" };
  assert.equal(await code("torvalds", failing), "SOURCE_UNAVAILABLE");
});

test("whether the reading is switched on is a boolean of the environment, and says nothing of the token", () => {
  const before = process.env.GITHUB_API_TOKEN;
  try {
    delete process.env.GITHUB_API_TOKEN;
    assert.equal(githubConfigured(), false);
    process.env.GITHUB_API_TOKEN = "  ";
    assert.equal(githubConfigured(), false, "blank is not configured");
    process.env.GITHUB_API_TOKEN = "ghp_x";
    assert.equal(githubConfigured(), true);
  } finally {
    if (before === undefined) delete process.env.GITHUB_API_TOKEN;
    else process.env.GITHUB_API_TOKEN = before;
  }
});
