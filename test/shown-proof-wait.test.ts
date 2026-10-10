// How the page waits for a shown proof (7 Oct 2026): for as long as its session can be answered, at once when the wait
// is taken up again by a page loaded anew, never from a page behind another, and never offering a link before the
// server has said what became of the session. The network and the page are stood in for; the schedule is the real one.

import assert from "node:assert/strict";
import { SHOW_PROOF } from "../src/sentences";
import { readFileSync } from "node:fs";
import test, { afterEach, beforeEach, mock } from "node:test";
import { ApiError } from "../src/client/api";
import { awaitShownProof, openShownSessionOf, SHOWN_LOOK_EARLY_MS, SHOWN_LOOK_GAPS_MS } from "../src/client/gift";

type Answer = { status: number; body: unknown };
let answers: Answer[] = [];
let asked: Array<{ url: string; method: string }> = [];
const realFetch = globalThis.fetch;

/** The page: in front or behind, and whoever listens for the change. */
const page = { visibilityState: "visible" as "visible" | "hidden", listeners: new Set<() => void>() };
const show = (state: "visible" | "hidden") => {
  page.visibilityState = state;
  for (const listener of [...page.listeners]) listener();
};

beforeEach(() => {
  answers = [];
  asked = [];
  page.visibilityState = "visible";
  page.listeners.clear();
  (globalThis as { document?: unknown }).document = {
    get visibilityState() {
      return page.visibilityState;
    },
    addEventListener: (_name: string, listener: () => void) => page.listeners.add(listener),
    removeEventListener: (_name: string, listener: () => void) => page.listeners.delete(listener),
  };
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    asked.push({ url: String(url), method: init?.method ?? "GET" });
    const next = answers.shift() ?? NOT_YET;
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
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
};
const seconds = async (count: number, until: () => boolean = () => false) => {
  for (let second = 0; second < count && !until(); second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
};
const signal = () => new AbortController().signal;

test("a wait taken up again by a page loaded anew looks at once, and takes the proof that was already there", async () => {
  answers = [HELD];
  const phases: string[] = [];
  const outcome = await awaitShownProof({ sessionId: "f6b8d0e2a4", signal: signal(), secondsLeft: 1_300, resumed: true, onPhase: (phase) => phases.push(phase), stillOpen: async () => assert.fail("a page just loaded is not asked twice") });
  assert.equal(outcome.kind, "held");
  assert.deepEqual(asked, [{ url: "/api/proof/verify", method: "POST" }]);
  assert.deepEqual(phases, ["checking"], "no link is offered before the answer");
});

test("a wait just opened keeps its first look for twenty seconds, as before", async () => {
  answers = [HELD];
  const wait = awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 1_800 });
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
  let outcome: unknown;
  const wait = awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 30 * 60 }).then(
    (value) => {
      outcome = value;
    },
    (error: unknown) => {
      ended = error;
    },
  );
  // Eleven minutes of "not yet": the page is still asking, where it said "took too long" at ten.
  await seconds(11 * 60);
  assert.equal(ended, undefined, "still waiting at eleven minutes");
  assert.ok(asked.length >= 8, `looked ${asked.length} times`);
  // The proof comes at fifteen: taken at the next look.
  await seconds(4 * 60);
  answers = [HELD];
  await seconds(5 * 60, () => outcome !== undefined);
  await wait;
  assert.equal((outcome as { kind: string }).kind, "held");
});

test("with no proof by the session's end the wait says so, by the code the page turns into its sentence", async () => {
  let ended: unknown;
  const wait = awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 60, resumed: true }).catch((error: unknown) => {
    ended = error;
  });
  await seconds(200, () => ended !== undefined);
  await wait;
  assert.ok(ended instanceof ApiError && ended.code === "TIMED_OUT", String(ended));
});

test("too many looks is a look to make later, never the end of the wait", async () => {
  // A page loaded again counts its looks from nothing: with the looks of the page it replaced they can pass the
  // route's ten in ten minutes (src/rate-limit.ts).
  answers = [{ status: 429, body: { error: "Too many attempts. Try again shortly." } }, NOT_YET, HELD];
  let outcome: unknown;
  const phases: string[] = [];
  const wait = awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 1_800, resumed: true, onPhase: (phase) => phases.push(phase) }).then((value) => {
    outcome = value;
  });
  await seconds(120, () => outcome !== undefined);
  await wait;
  assert.equal((outcome as { kind: string }).kind, "held");
  assert.equal(asked.length, 3);
  assert.deepEqual(phases.slice(0, 2), ["checking", "waiting"], "once the first answer is not yet, the link is offered again");
});

test("a page behind another asks nothing, and asks the server's row first when it comes back to the front", async () => {
  // Several pages of one gift were open on a phone (7 Oct 2026), each spending the looks the route allows, and the
  // one the person came back to was answered "too many".
  let stillOpen = 0;
  let outcome: unknown;
  const phases: string[] = [];
  const wait = awaitShownProof({
    sessionId: "s",
    signal: signal(),
    secondsLeft: 1_800,
    onPhase: (phase) => phases.push(phase),
    stillOpen: async () => {
      stillOpen += 1;
      return true;
    },
  }).then((value) => {
    outcome = value;
  });
  await settle();
  show("hidden");
  // Five minutes behind another page: the schedule's turns come and go, and nothing is asked.
  await seconds(5 * 60);
  assert.equal(asked.length, 0, "a page behind another makes no look");
  assert.equal(stillOpen, 0);
  // Back in front: the row first, "checking" meanwhile, then the look, at once.
  answers = [HELD];
  show("visible");
  await settle();
  await wait;
  assert.equal(stillOpen, 1);
  assert.deepEqual(phases, ["checking"]);
  assert.equal(asked.length, 1);
  assert.equal((outcome as { kind: string }).kind, "held");
});

test("a page back in front whose session is no longer the open one ends its wait, without a look", async () => {
  let ended: unknown;
  const phases: string[] = [];
  const wait = awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 1_800, onPhase: (phase) => phases.push(phase), stillOpen: async () => false }).catch((error: unknown) => {
    ended = error;
  });
  await settle();
  show("hidden");
  await seconds(90);
  show("visible");
  await settle();
  await wait;
  assert.ok(ended instanceof ApiError && ended.code === "UNKNOWN_SESSION", String(ended));
  assert.equal(asked.length, 0, "the verify route is not spent on a session that is over");
  assert.deepEqual(phases, ["checking"], "and its link is not drawn again");
});

test("brought to the front again and again, a page still looks no more than once in ten seconds", async () => {
  let outcome: unknown;
  const phases: string[] = [];
  const wait = awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 1_800, resumed: true, onPhase: (phase) => phases.push(phase), stillOpen: async () => true }).then((value) => {
    outcome = value;
  });
  await settle();
  assert.equal(asked.length, 1, "the look of the page just loaded");
  for (let turn = 0; turn < 4; turn += 1) {
    show("hidden");
    await seconds(1);
    show("visible");
    await settle();
  }
  assert.equal(asked.length, 1, "four returns in four seconds cost no look");
  assert.equal(phases[phases.length - 1], "waiting", "the link is back: the row says the session is open");
  answers = [HELD];
  await seconds(SHOWN_LOOK_EARLY_MS / 1_000 + 1, () => outcome !== undefined);
  await wait;
  assert.equal(asked.length, 2, "and the look comes ten seconds after the last");
});

test("a refusal with a reason ends the wait with that reason, and a stop ends it as a stop", async () => {
  answers = [{ status: 409, body: { error: "The verification stopped before it made a proof. Show it again.", code: "VERIFICATION_STOPPED" } }];
  await assert.rejects(awaitShownProof({ sessionId: "s", signal: signal(), secondsLeft: 1_800, resumed: true }), (error: unknown) => error instanceof ApiError && error.code === "VERIFICATION_STOPPED");
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(awaitShownProof({ sessionId: "s", signal: stop.signal, secondsLeft: 1_800, resumed: true }), (error: unknown) => error instanceof ApiError && error.code === "CANCELLED");
  assert.equal(asked.length, 1, "a stopped wait asks nothing");
});

test("the page asks the server for the open session by the gift alone", async () => {
  answers = [{ status: 200, body: { open: { sessionId: "f6b8d0e2a4", requestUrl: "https://share.reclaimprotocol.org/verify/?template=t", secondsLeft: 1_290, conditionId: "university-enrollment-shown" } } }, { status: 200, body: { open: null } }];
  assert.equal((await openShownSessionOf("1000006"))?.sessionId, "f6b8d0e2a4");
  assert.equal(await openShownSessionOf("1000006"), null);
  assert.deepEqual(asked[0], { url: "/api/proof/session?giftId=1000006", method: "GET" });
});

test("the proof card takes up the open session when it loads, and a press takes it up rather than open a second", () => {
  const source = readFileSync("app/kit/ShowProof.tsx", "utf8");
  // Asked in an effect, when the card is the recipient's and nothing is under review.
  assert.match(source, /const shows = yours && condition\?\.nature === "shown" && !review;/);
  assert.match(source, /const asked = given \? Promise\.resolve<OpenShown \| null>\(given\) : openShownSessionOf\(gift\)\.catch\(\(\) => null\);/);
  assert.match(source, /void waitFor\.current\(gift, open, stop, true\);/, "taken up as a wait that looks at once");
  // The press: the open one first, and only with none does it sign the yes and open a session.
  const press = source.slice(source.indexOf("const show = async"));
  assert.ok(press.indexOf("if (open) return await waitFor.current(giftId, open, stop, true);") > 0);
  assert.ok(press.indexOf("if (open) return await waitFor.current(giftId, open, stop, true);") < press.indexOf("openShownProof("));
  // No clock of its own: the seconds are the server's.
  assert.match(source, /secondsLeft: session\.secondsLeft/);
  assert.doesNotMatch(readFileSync("src/client/gift.ts", "utf8"), /SHOWN_WAIT_MS/);
});

test("a session open when the page is read on the server is checking from the first image", () => {
  // Brought back by the verification page, the person never sees the button to start over while the browser asks.
  const page = readFileSync("app/g/[id]/page.tsx", "utf8");
  assert.match(page, /return account \? await loadOpenShownSession\(id, account\) : null;/, "by the signed-in account and the gift, on the server");
  assert.match(page, /<GiftPage giftId=\{id\} linkKey=\{linkKey\} initialStatus=\{initialStatus\} openProof=\{openProof\} \/>/);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /openAtLoad=\{openProof\} onChecking=\{setProofSilent\} onShown=\{reloadAll\}/);
  const source = readFileSync("app/kit/ShowProof.tsx", "utf8");
  assert.match(source, /useState<State>\(\(\) => \(checkingAtLoad\(\{ yours, review, openAtLoad \}\) \? \{ at: "checking" \} : \{ at: "asking" \}\)\);/);
  assert.match(source, /export const checkingAtLoad = \(input: [^)]+\) => input\.yours && !input\.review && Boolean\(input\.openAtLoad\);/);
  // Handed once: a later look for the open session asks the server, which alone knows what became of it.
  assert.match(source, /const given = handed\.current;\n\s+handed\.current = null;\n\s+find\.current\(giftId, false, left\.signal, given\);/);
});

test("no page offers the link of a verification that is over", () => {
  const source = readFileSync("app/kit/ShowProof.tsx", "utf8");
  // A wait taken up again starts on "checking", and a link is drawn in the waiting state alone.
  assert.match(source, /setState\(resumed \? \{ at: "checking" \} : \{ at: "waiting", requestUrl: session\.requestUrl \}\);/);
  assert.equal(source.split("href={state.requestUrl}").length, 2, "one link, in one state");
  assert.ok(source.indexOf('state.at === "waiting" ? (') < source.indexOf("href={state.requestUrl}"));
  // While the server is asked the block draws nothing at all: the card says it (test/back-from-the-check.test.ts).
  assert.match(source, /const saidByTheCard = \(state: State\) => state\.at === "checking" \|\| state\.at === "done";/);
  assert.match(source, /if \(saidByTheCard\(state\)\) return null;/);
  // The server's row is what says a session is still the open one, and a lookup that fails drops nothing.
  assert.match(source, /stillOpen: \(\) => openShownSessionOf\(gift\)\.then\(\(open\) => open\?\.sessionId === session\.sessionId, \(\) => true\)/);
  // Answered from another page of the gift, aged out, or ended by Reclaim: the gift is read again, then said.
  assert.match(source, /if \(code === "UNKNOWN_SESSION"\) await reload\.current\(\);/);
  assert.match(source, /UNKNOWN_SESSION: W\.refusals\.over/);
  assert.match(source, /VERIFICATION_STOPPED: W\.refusals\.stopped/);
  // An idle page asks too when it comes to the front, and reads the gift anew when nothing is open.
  assert.match(source, /if \(document\.visibilityState === "visible" && !waiting\.current\) find\.current\(giftId, true, left\.signal\);/);
  assert.match(source, /if \(again\) await reload\.current\(\);/);
  // And a page whose proof is under review reads the gift again when it comes to the front.
  assert.match(source, /const underReview = yours && \(review === "pending" \|\| review === "building"\);/);
});

test("while the verification page is open, Viky says to stay on it, and it is that page that brings the person back", () => {
  // The founder, 9 Oct 2026: Viky said to come back, the verification page says to keep it open, and on 8 Oct a
  // student came back 69 seconds in, which closed the session.
  assert.equal(SHOW_PROOF.waiting, "Sign in there and stay on that page. It brings you back here.");
  assert.doesNotMatch(SHOW_PROOF.waiting, /Come back|Waiting for the proof/);
  // It is true of the session Viky opens: Reclaim's page is told where to send the person once the proof is made.
  assert.match(readFileSync("app/api/proof/session/route.ts", "utf8"), /proofRequest\.setRedirectUrl\(`\$\{accountAuthOriginFromRequest\(request\)\}\/g\/\$\{giftId\}`\);/);
  assert.match(readFileSync("app/kit/ShowProof.tsx", "utf8"), /\{W\.waiting\}/);
});

