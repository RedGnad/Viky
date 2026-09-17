// Ported from Lock-in unchanged. The public endpoint answers only this exact request shape: adding a
// `fields` query parameter makes it return an empty object (checked 9 Sep 2026, DECISIONS.md D9).

const USERNAME = /^[A-Za-z0-9._-]{1,64}$/;
const PROFILE_ID = /^[1-9]\d{0,19}$/;
const MAX_RESPONSE_BYTES = 512 * 1_024;

/**
 * Why a public profile could not be read, by name, so a screen can tell "no such name" (the person's to fix) from
 * "Duolingo did not answer" (nobody's fault, try again). The messages stay those the routes already print.
 */
export type DuolingoProfileProblem = "INVALID_USERNAME" | "NO_SUCH_PROFILE" | "SOURCE_UNAVAILABLE";

export class DuolingoProfileError extends Error {
  constructor(
    readonly code: DuolingoProfileProblem,
    message: string,
  ) {
    super(message);
    this.name = "DuolingoProfileError";
  }
}

export type PublicDuolingoProfile = Readonly<{
  id: string;
  username: string;
}>;

export function parsePublicDuolingoProfile(value: unknown, requestedUsername: string): PublicDuolingoProfile {
  if (!USERNAME.test(requestedUsername)) throw new DuolingoProfileError("INVALID_USERNAME", "Enter a valid Duolingo username");
  if (!value || typeof value !== "object" || !Array.isArray((value as { users?: unknown }).users)) {
    throw new DuolingoProfileError("SOURCE_UNAVAILABLE", "Duolingo profile could not be resolved");
  }
  const users = (value as { users: unknown[] }).users;
  const candidate = users.find((item) => {
    if (!item || typeof item !== "object") return false;
    const username = (item as { username?: unknown }).username;
    return typeof username === "string" && username.toLowerCase() === requestedUsername.toLowerCase();
  }) as { id?: unknown; username?: unknown } | undefined;
  const id = candidate?.id === undefined ? "" : String(candidate.id);
  const username = typeof candidate?.username === "string" ? candidate.username : "";
  // No user by that exact name is the one answer that is about the name itself.
  if (!candidate) throw new DuolingoProfileError("NO_SUCH_PROFILE", "Duolingo profile could not be resolved");
  if (!PROFILE_ID.test(id) || BigInt(id) > (1n << 64n) - 1n || !USERNAME.test(username)) {
    throw new DuolingoProfileError("SOURCE_UNAVAILABLE", "Duolingo profile could not be resolved");
  }
  return { id, username };
}

export async function resolvePublicDuolingoProfile(usernameInput: string): Promise<PublicDuolingoProfile> {
  const username = usernameInput.trim();
  if (!USERNAME.test(username)) throw new DuolingoProfileError("INVALID_USERNAME", "Enter a valid Duolingo username");
  const url = new URL("https://www.duolingo.com/2017-06-30/users");
  url.searchParams.set("username", username);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DuolingoProfileError("SOURCE_UNAVAILABLE", "Duolingo profile is unavailable. Try again shortly.");
  }
  if (!response.ok) throw new DuolingoProfileError("SOURCE_UNAVAILABLE", "Duolingo profile is unavailable. Try again shortly.");
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new DuolingoProfileError("SOURCE_UNAVAILABLE", "Duolingo profile response is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DuolingoProfileError("SOURCE_UNAVAILABLE", "Duolingo returned an invalid profile response");
  }
  return parsePublicDuolingoProfile(parsed, username);
}
