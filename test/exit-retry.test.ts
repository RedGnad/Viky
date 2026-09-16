import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { takeTheWayOut } from "../src/client/exit.js";

/**
 * The retry of D81, exercised rather than assumed.
 *
 * A route that moved between the quote and the relay cannot be detected when the terms are built: the announced
 * and engraved minima are equal in every quote measured, and only the chain knows which route fills. So the
 * protection is not a check, it is asking again with a new quote. That makes the retry the thing carrying the
 * safety, and an untested retry would leave us exactly where we were, with nothing to reveal it: the defect is
 * intermittent, so a live attempt would most likely pass whatever we had written.
 */

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

type Call = { path: string; body: Record<string, unknown> };

/** Stands in for the two routes, counting what was asked and answering as the server would. */
function server(relayAnswers: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  let relayed = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const path = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ path, body });
    if (path.endsWith("/api/exit/prepare")) {
      return new Response(
        JSON.stringify({
          id: `terms-${calls.filter((c) => c.path.endsWith("prepare")).length}`,
          shown: "$9.995060",
          signed: false,
          authorization: {
            to: "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223",
            value: "10000000",
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 900),
            nonce: `0x${"11".repeat(32)}`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const answer = relayAnswers[Math.min(relayed, relayAnswers.length - 1)];
    relayed += 1;
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetcher, prepares: () => calls.filter((c) => c.path.endsWith("prepare")).length, relays: () => relayed };
}

function withFetch<T>(fetcher: typeof fetch, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = fetcher;
  return run().finally(() => {
    globalThis.fetch = real;
  });
}

const STALE = { status: 409, body: { error: "The exchange's price moved while you were signing.", code: "QUOTE_STALE" } };
const PAID = { status: 200, body: { paid: true, hash: `0x${"ab".repeat(32)}` } };

test("a route that moved is asked again, with new terms and a new signature", async () => {
  const s = server([STALE, PAID]);
  const result = await withFetch(s.fetcher, () => takeTheWayOut({ account, ticket: "t" }));

  assert.equal(result.paid, true);
  assert.equal(s.prepares(), 2, "the second attempt built new terms rather than reusing the refused ones");
  assert.equal(s.relays(), 2);
  // Each attempt signed for itself: the whole point is that the bytes and the signature belong together.
  const signatures = s.calls.filter((c) => c.path.endsWith("relay")).map((c) => c.body.signature);
  assert.equal(signatures.length, 2);
  assert.ok(signatures.every((sig) => typeof sig === "string" && sig.length > 2));
});

test("it gives up after three attempts rather than asking forever", async () => {
  const s = server([STALE]);
  await assert.rejects(
    () => withFetch(s.fetcher, () => takeTheWayOut({ account, ticket: "t" })),
    (error: Error & { code?: string }) => error.code === "QUOTE_STALE",
  );
  assert.equal(s.prepares(), 3, "three attempts in all, not an endless loop over somebody's passkey");
  assert.equal(s.relays(), 3);
});

/**
 * Everything except a moved route is a real answer. Retrying those would ask somebody to sign the same refusal
 * again, which is worse than showing it the first time.
 */
test("a refusal that is not a moved route is not retried", async () => {
  for (const code of ["RATE_MOVED", "NOT_ENOUGH", "SIGN_IN_REQUIRED", "NOT_CONFIGURED", "TOO_SLOW"]) {
    const s = server([{ status: 409, body: { error: "no", code } }]);
    await assert.rejects(() => withFetch(s.fetcher, () => takeTheWayOut({ account, ticket: "t" })));
    assert.equal(s.prepares(), 1, `${code} must be answered once, not signed twice`);
  }
});

test("terms already signed are relayed again without asking for a second signature", async () => {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = String(input);
    calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    if (path.endsWith("/api/exit/prepare")) {
      return new Response(
        JSON.stringify({
          id: "already",
          shown: "$9.995060",
          signed: true,
          authorization: { to: "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223", value: "10000000", validAfter: "0", validBefore: "99999999999", nonce: `0x${"11".repeat(32)}` },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify(PAID.body), { status: 200, headers: { "content-type": "application/json" } });
  };
  await withFetch(fetcher, () => takeTheWayOut({ account, ticket: "t" }));
  const relay = calls.find((c) => c.path.endsWith("relay"))!;
  assert.equal(relay.body.signature, undefined, "a second signature for terms already signed is a second thing to relay");
});
