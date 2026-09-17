import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { GET as profileGet } from "../app/api/duolingo/profile/route";
import { DuolingoProfileError, parsePublicDuolingoProfile } from "../src/duolingo-profile";

/**
 * The Duolingo name a funder gives is read from Duolingo's public profile before any money moves (decision 10 of the
 * drawn flows). The screen says three different things for three different answers, so each arrives with its own code.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function ask(username: string, ip: string): Request {
  return new Request(`https://viky.test/api/duolingo/profile?username=${encodeURIComponent(username)}`, { headers: { "x-forwarded-for": ip } });
}

test("a name Duolingo knows comes back spelled as Duolingo spells it", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ users: [{ id: 477033640, username: "Ama_Learns" }] }), { status: 200 })) as typeof fetch;
  const response = await profileGet(ask("ama_learns", "10.0.0.1"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { username: "Ama_Learns" });
});

test("no such name, a name of the wrong shape, and Duolingo not answering are three refusals, each typed", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ users: [] }), { status: 200 })) as typeof fetch;
  let response = await profileGet(ask("nobody_here", "10.0.0.2"));
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { code: string }).code, "NO_SUCH_PROFILE");

  response = await profileGet(ask("not a name!", "10.0.0.3"));
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { code: string }).code, "INVALID_USERNAME");

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  response = await profileGet(ask("ama_learns", "10.0.0.4"));
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { code: string }).code, "SOURCE_UNAVAILABLE");

  globalThis.fetch = (async () => new Response("busy", { status: 502 })) as typeof fetch;
  response = await profileGet(ask("ama_learns", "10.0.0.5"));
  assert.equal(((await response.json()) as { code: string }).code, "SOURCE_UNAVAILABLE");
});

test("only an absent name is about the name itself; a malformed answer is Duolingo's", () => {
  assert.throws(() => parsePublicDuolingoProfile({ users: [] }, "Ama"), (error) => error instanceof DuolingoProfileError && error.code === "NO_SUCH_PROFILE");
  assert.throws(() => parsePublicDuolingoProfile({}, "Ama"), (error) => error instanceof DuolingoProfileError && error.code === "SOURCE_UNAVAILABLE");
  assert.throws(() => parsePublicDuolingoProfile({ users: [{ id: 0, username: "Ama" }] }, "Ama"), (error) => error instanceof DuolingoProfileError && error.code === "SOURCE_UNAVAILABLE");
});
