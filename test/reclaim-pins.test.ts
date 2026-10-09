// Every request hash pinned in the code, worked out again (the audit of 9 Oct 2026, E12).
//
// A proof carries, as its "providerHash", the hash Reclaim's library works out from the provider's published request
// (hashRequestSpec). Some configurations also publish a "requestHash" field beside the request, and it is not that
// hash. Rome's pin held the field until 9 Oct 2026 (#93), and so did the TOEFL's: no proof of either could have
// passed. Duolingo's two pins, which real proofs fit every day, are what the library works out.
//
// The requests are kept as they were published (test/fixtures/reclaim-published-requests.json, read 9 Oct 2026), so
// this runs with no network. A provider pinned in the code with no request kept here fails the last test.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DIRECTORY_PORTALS } from "../src/directory-portals";
import { DUOLINGO_OWNERSHIP_REQUEST_HASH, DUOLINGO_PROVIDER_ID, DUOLINGO_PROVIDER_VERSION, DUOLINGO_XP_REQUEST_HASH } from "../src/duolingo-proof-policy";
import { TOEFL_RECLAIM_PROVIDER } from "../src/toefl-shown";

type Published = Readonly<{ name: string; id: string; version: string; requests: ReadonlyArray<Record<string, unknown>> }>;
const PUBLISHED = (JSON.parse(readFileSync("test/fixtures/reclaim-published-requests.json", "utf8")) as { providers: Published[] }).providers;

/** The pins of the code, by provider and version: one hash per request, in the order the provider publishes them. */
const PINNED: ReadonlyArray<Readonly<{ id: string; version: string; hashes: readonly string[]; where: string }>> = [
  { id: DUOLINGO_PROVIDER_ID, version: DUOLINGO_PROVIDER_VERSION, hashes: [DUOLINGO_OWNERSHIP_REQUEST_HASH, DUOLINGO_XP_REQUEST_HASH], where: "src/duolingo-proof-policy.ts" },
  { id: TOEFL_RECLAIM_PROVIDER.id, version: TOEFL_RECLAIM_PROVIDER.version, hashes: [TOEFL_RECLAIM_PROVIDER.requestHash], where: "src/toefl-shown.ts" },
  ...DIRECTORY_PORTALS.filter((portal) => portal.providerId).map((portal) => ({ id: portal.providerId!, version: portal.providerVersion!, hashes: [portal.requestHash!], where: `src/directory-portals.ts, ${portal.portalId}` })),
];

async function workedOut(request: Record<string, unknown>): Promise<string> {
  const { hashRequestSpec } = await import("@reclaimprotocol/js-sdk");
  const hashes = (hashRequestSpec(request as never) as { value: string[] }).value;
  assert.equal(hashes.length, 1, "one hash a request");
  return hashes[0]!.toLowerCase();
}

test("each pinned request hash is the one Reclaim's library works out from the published request", async () => {
  for (const pin of PINNED) {
    const published = PUBLISHED.find((provider) => provider.id === pin.id && provider.version === pin.version);
    assert.ok(published, `${pin.where}: no published request is kept for ${pin.id} ${pin.version}`);
    assert.equal(published.requests.length, pin.hashes.length, pin.where);
    for (const [at, request] of published.requests.entries()) assert.equal(await workedOut(request), pin.hashes[at]!.toLowerCase(), `${pin.where}, request ${at + 1}`);
  }
});

test("the field a configuration publishes beside a request is never the pin", () => {
  let fields = 0;
  for (const pin of PINNED) {
    const published = PUBLISHED.find((provider) => provider.id === pin.id && provider.version === pin.version)!;
    for (const [at, request] of published.requests.entries()) {
      if (typeof request.requestHash !== "string") continue;
      fields += 1;
      assert.notEqual(request.requestHash.toLowerCase(), pin.hashes[at]!.toLowerCase(), `${pin.where}: the pin is the published field, which no proof carries`);
    }
  }
  // The TOEFL's and Rome's configurations publish one each; Duolingo's publishes none.
  assert.equal(fields, 2);
  assert.equal(TOEFL_RECLAIM_PROVIDER.requestHash, "0xd40b146a6c7210c1ee0213ad3e04c424bea780a4d8315d883595cfa1ce12fd3d");
});

test("no provider is pinned in the code without its published request kept beside this test", () => {
  // The TOEFL, Duolingo, and every portal of the directory that carries a provider: today, Rome's alone.
  assert.deepEqual(PINNED.map((pin) => pin.id).sort(), PUBLISHED.map((provider) => provider.id).sort());
  assert.equal(DIRECTORY_PORTALS.filter((portal) => portal.providerId).length, 1);
});
