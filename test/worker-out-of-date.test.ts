import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { AttestedReadError, reclaimAttestedReadDeps } from "../src/attested-read";
import { CHESS_PLAYER } from "../src/attested-sources";
import { READING_FINGERPRINT } from "../src/reading-fingerprint";

/**
 * The night of 18 Sep 2026: the app shipped a new pattern, the reading service was still running the day before's
 * image, and every reading died as `PROOF_MISMATCH` under a screen that said "try again in a minute". These tests
 * hold the two things that were wrong: a worker that does not run what this build runs is never asked for a proof,
 * and nobody is told to try again.
 */

const realFetch = globalThis.fetch;
const url = "https://worker.example";

function answering(health: unknown, calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const asked = String(input);
    calls.push(asked);
    if (asked.endsWith("/health")) return new Response(JSON.stringify(health), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ proof: { claimData: {} } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ZKFETCH_WORKER_URL;
  delete process.env.ZKFETCH_WORKER_SECRET;
});

function configured(): void {
  // A different host each time, so one test's agreement is never the next test's answer.
  process.env.ZKFETCH_WORKER_URL = `${url}/${Math.random().toString(36).slice(2)}`;
  process.env.ZKFETCH_WORKER_SECRET = "secret";
}

test("a worker running other sources is refused before anything is fetched", async () => {
  configured();
  const calls: string[] = [];
  globalThis.fetch = answering({ ok: true, reading: { fingerprint: "0xdeadbeef" } }, calls);
  const error = await reclaimAttestedReadDeps()
    .zkFetch(CHESS_PLAYER, "hikaru")
    .then(() => null, (thrown: unknown) => thrown);
  assert.ok(error instanceof AttestedReadError, "it refuses with a typed error");
  assert.equal(error.code, "WORKER_OUT_OF_DATE");
  assert.deepEqual(calls.filter((call) => call.endsWith("/read")), [], "and it never asked for a reading");
});

test("a worker that publishes no fingerprint at all is one of those", async () => {
  configured();
  const calls: string[] = [];
  globalThis.fetch = answering({ ok: true, worker: "zkfetch" }, calls);
  const error = await reclaimAttestedReadDeps()
    .zkFetch(CHESS_PLAYER, "hikaru")
    .then(() => null, (thrown: unknown) => thrown);
  assert.equal((error as AttestedReadError).code, "WORKER_OUT_OF_DATE");
  assert.deepEqual(calls.filter((call) => call.endsWith("/read")), []);
});

test("a worker running this build's own sources is asked for the reading", async () => {
  configured();
  const calls: string[] = [];
  globalThis.fetch = answering({ ok: true, reading: { fingerprint: READING_FINGERPRINT } }, calls);
  await reclaimAttestedReadDeps().zkFetch(CHESS_PLAYER, "hikaru");
  assert.equal(calls.filter((call) => call.endsWith("/read")).length, 1);
});

test("the sentence a person reads never sends them back to try again", async () => {
  const { MILESTONE_OURS_TO_FIX, refusalMessage } = await import("../src/milestone-reading");
  const said = refusalMessage("WORKER_OUT_OF_DATE");
  assert.equal(said, "Our reading service needs an update. Nothing was changed, and we have been told.");
  assert.doesNotMatch(said, /try again/i);
  // And the pass holds the gift rather than settling anything against a reading that never happened.
  assert.ok(MILESTONE_OURS_TO_FIX.has("WORKER_OUT_OF_DATE"));
});
