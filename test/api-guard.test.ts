import assert from "node:assert/strict";
import test from "node:test";
import { assertSameOrigin, readJsonBody } from "../src/api-guard";

const ORIGIN = "https://viky.test";

function request(init: { headers?: Record<string, string>; body?: string; method?: string } = {}) {
  return new Request(`${ORIGIN}/api/duolingo/session`, {
    method: init.method ?? "POST",
    headers: init.headers,
    body: init.body,
  });
}

test("accepts same-origin requests and requests without origin headers", () => {
  assert.doesNotThrow(() => assertSameOrigin(request({ headers: { origin: ORIGIN, host: "viky.test" } })));
  assert.doesNotThrow(() => assertSameOrigin(request({ headers: { host: "viky.test" } })));
  assert.doesNotThrow(() =>
    assertSameOrigin(request({ headers: { origin: ORIGIN, host: "internal", "x-forwarded-host": "viky.test" } })),
  );
});

test("refuses cross-site and cross-origin requests and malformed origins", () => {
  assert.throws(() => assertSameOrigin(request({ headers: { "sec-fetch-site": "cross-site" } })), /Cross-site/);
  assert.throws(
    () => assertSameOrigin(request({ headers: { origin: "https://attacker.test", host: "viky.test" } })),
    /Cross-origin/,
  );
  assert.throws(() => assertSameOrigin(request({ headers: { origin: "ftp://viky.test", host: "viky.test" } })), /Invalid/);
});

test("reads a bounded JSON body and refuses the wrong shape", async () => {
  const headers = { origin: ORIGIN, host: "viky.test", "content-type": "application/json" };
  assert.deepEqual(await readJsonBody(request({ headers, body: '{"a":1}' }), 1_024), { a: 1 });
  await assert.rejects(readJsonBody(request({ headers: { ...headers, "content-type": "text/plain" }, body: "{}" }), 1_024), /Content-Type/);
  await assert.rejects(readJsonBody(request({ headers, body: "" }), 1_024), /empty/);
  await assert.rejects(readJsonBody(request({ headers, body: "x".repeat(2_000) }), 1_024), /too large/);
  await assert.rejects(readJsonBody(request({ headers, body: "{not json" }), 1_024), /not valid JSON/);
});
