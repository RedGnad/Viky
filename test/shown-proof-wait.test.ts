// How the page waits for a shown proof (7 Oct 2026): for as long as its session can be answered, and at once when the
// wait is taken up again by a page loaded anew. The network and the page are stood in for; the schedule is the real one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach, beforeEach, mock } from "node:test";
import { ApiError } from "../src/client/api";
import { awaitShownProof, openShownSessionOf, SHOWN_LOOK_GAPS_MS } from "../src/client/gift";

type Answer = { status: number; body: unknown };
let answers: Answer[] = [];
let asked: Array<{ url: string; method: string }> = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  answers = [];
  asked = [];
  (globalThis as { document?: unknown }).document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    asked.push({ url: String(url), method: init?.method ?? "GET" });
    const next = answers.shift() ?? { status: 409, body: { error: "Reclaim has not returned a proof yet", code: "NO_PROOF_YET" } };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_791_380_000_000 });
});

afterEach(() => {
  mock.timers.reset();
  globalThis.fetch = realFetch;
  delete (globalThis as { document?: unknown }).document;
});

const NOT_YET: Answer = { status: 409, body: { error: "Reclaim has not returned a proof yet", code: "NO_PROOF_YET" } };
const HELD: Answer = { status: 200, body: { kind: "held", giftId: "1000006", message: "First proof from this university: checked within an hour." } };
/** Lets the awaits between two timers run. */
const settle = async () => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

test("a wait taken up again by a page loaded anew looks at once, and takes the proof that was already there", async () => {
  answers = [HELD];
  const outcome = await awaitShownProof({ sessionId: "ffa7b928d5", signal: new AbortController().signal, secondsLeft: 1_300, resumed: true });
  assert.equal(outcome.kind, "held");
  assert.deepEqual(asked, [{ url: "/api/proof/verify", method: "POST" }]);
});

test("a wait just opened keeps its first look for twenty seconds, as before", async () => {
  answers = [HELD];
  const wait = awaitShownProof({ sessionId: "s", signal: new AbortController().signal, secondsLeft: 1_800 });
  await settle();
  mock.timers.tick(SHOWN_LOOK_GAPS_MS[0] - 1);
  await settle();
  assert.equal(asked.length, 0);
  mock.timers.tick(1);
  assert.equal((await wait).kind, "held");
  assert.equal(asked.length, 1);
});

test("the wait lasts as long as the session can be answered: past the ten minutes it had, to the end the server gave", async () => {
  let ended: unknown;
  const wait = awaitShownProof({ sessionId: "s", signal: new AbortController().signal, secondsLeft: 30 * 60 }).catch((error: unknown) => {
    ended = error;
  });
  // Eleven minutes of "not yet": the page is still asking, where it said "took too long" at ten.
  for (let second = 0; second < 11 * 60; second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
  assert.equal(ended, undefined, "still waiting at eleven minutes");
  const atEleven = asked.length;
  assert.ok(atEleven >= 8, `looked ${atEleven} times`);
  // The proof comes at fifteen: taken.
  for (let second = 0; second < 4 * 60; second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
  answers = [HELD];
  for (let second = 0; second < 5 * 60 && asked.length <= atEleven + 4; second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
  await wait;
  assert.equal(ended, undefined);
});

test("with no proof by the session's end the wait says so, by the code the page turns into its sentence", async () => {
  let ended: unknown;
  const wait = awaitShownProof({ sessionId: "s", signal: new AbortController().signal, secondsLeft: 60, resumed: true }).catch((error: unknown) => {
    ended = error;
  });
  for (let second = 0; second < 200 && !ended; second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
  await wait;
  assert.ok(ended instanceof ApiError && ended.code === "TIMED_OUT", String(ended));
});

test("too many looks is a look to make later, never the end of the wait", async () => {
  // A page loaded again counts its looks from nothing: with the looks of the page it replaced they can pass the
  // route's ten in ten minutes (src/rate-limit.ts).
  answers = [{ status: 429, body: { error: "Too many attempts. Try again shortly." } }, NOT_YET, HELD];
  let outcome: unknown;
  const wait = awaitShownProof({ sessionId: "s", signal: new AbortController().signal, secondsLeft: 1_800, resumed: true }).then((value) => {
    outcome = value;
  });
  for (let second = 0; second < 120 && !outcome; second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
  await wait;
  assert.equal((outcome as { kind: string }).kind, "held");
  assert.equal(asked.length, 3);
});

test("a refusal with a reason ends the wait with that reason, and a stop ends it as a stop", async () => {
  answers = [{ status: 400, body: { error: "The proof asked the portal in another way than this university's pin", code: "WITNESS_OTHER_METHOD" } }];
  await assert.rejects(awaitShownProof({ sessionId: "s", signal: new AbortController().signal, secondsLeft: 1_800, resumed: true }), (error: unknown) => error instanceof ApiError && error.code === "WITNESS_OTHER_METHOD");
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(awaitShownProof({ sessionId: "s", signal: stop.signal, secondsLeft: 1_800, resumed: true }), (error: unknown) => error instanceof ApiError && error.code === "CANCELLED");
  assert.equal(asked.length, 1, "a stopped wait asks nothing");
});

test("the page asks the server for the open session by the gift alone", async () => {
  answers = [{ status: 200, body: { open: { sessionId: "ffa7b928d5", requestUrl: "https://share.reclaimprotocol.org/verify/?template=t", secondsLeft: 1_290, conditionId: "university-enrollment-shown" } } }, { status: 200, body: { open: null } }];
  assert.equal((await openShownSessionOf("1000006"))?.sessionId, "ffa7b928d5");
  assert.equal(await openShownSessionOf("1000006"), null);
  assert.deepEqual(asked[0], { url: "/api/proof/session?giftId=1000006", method: "GET" });
});

test("the proof card takes up the open session when it loads, and a press takes it up rather than open a second", () => {
  const source = readFileSync("app/kit/ShowProof.tsx", "utf8");
  // Asked in an effect, when the card is the recipient's and nothing is under review.
  assert.match(source, /const shows = yours && condition\?\.nature === "shown" && !review;/);
  assert.match(source, /const asked = openShownSessionOf\(giftId\)\.catch\(\(\) => null\);/);
  assert.match(source, /void waitFor\.current\(open, stop, true\);/, "taken up as a wait that looks at once");
  // The press: the open one first, and only with none does it sign the yes and open a session.
  const press = source.slice(source.indexOf("const show = async"));
  assert.ok(press.indexOf("if (open) return await waitFor.current(open, stop, true);") > 0);
  assert.ok(press.indexOf("if (open) return await waitFor.current(open, stop, true);") < press.indexOf("openShownProof("));
  // No clock of its own: the seconds are the server's.
  assert.match(source, /secondsLeft: session\.secondsLeft/);
  assert.doesNotMatch(readFileSync("src/client/gift.ts", "utf8"), /SHOWN_WAIT_MS/);
  // A session answered from another page of the gift, or aged out, reads the gift again before it says anything.
  assert.match(source, /if \(code === "UNKNOWN_SESSION"\) await reload\.current\(\);/);
});
