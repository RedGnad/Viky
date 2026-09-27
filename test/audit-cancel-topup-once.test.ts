// The cancel route's MON top-up is held to a few a gift for as long as it lives (the money path audit of 27 Sep 2026):
// a funder who sweeps the MON out after each top-up cannot have the relayer ready their account in a loop.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GiftApiError } from "../src/gift-api";
import type { SqlExecutor } from "../src/proof-session-store";
import { admitTopUp } from "../src/relay-admission";
import { DEFAULT_RELAY_CEILINGS } from "../src/relay-ceiling";
import { configureRelayCeilingStore, ensureRelayCeilingSchema, forgetRelayCountsBefore } from "../src/relay-ceiling-store";

let db: PGlite;
before(async () => {
  db = new PGlite();
  configureRelayCeilingStore((async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  }) as SqlExecutor);
  await ensureRelayCeilingSchema();
});
after(async () => {
  configureRelayCeilingStore(undefined);
  await db.close();
});

const FUNDER = "0x00000000000000000000000000000000000A11cE";
const NOW = Date.UTC(2026, 8, 27, 10, 0, 0);
const from = (ip: string) => new Request("https://viky.test/api/gift/7/cancel", { method: "POST", headers: { "x-forwarded-for": ip } });

test("a gift is readied twice at most, whatever the minutes, the days and the connections between", async () => {
  assert.equal(DEFAULT_RELAY_CEILINGS.topUpsPerGift, 2);
  await admitTopUp(from("198.51.100.1"), FUNDER, "7", NOW);
  await admitTopUp(from("198.51.100.2"), FUNDER, "7", NOW + 2 * 60_000);
  // Days later, the old windows swept: the gift's own count is still there.
  await forgetRelayCountsBefore(new Date(NOW + 3 * 86_400_000));
  await assert.rejects(admitTopUp(from("198.51.100.3"), FUNDER, "7", NOW + 3 * 86_400_000), (error: unknown) => error instanceof GiftApiError && error.code === "TOP_UPS_FOR_GIFT");
  // Another gift of the same funder is its own count.
  await admitTopUp(from("198.51.100.3"), FUNDER, "8", NOW + 3 * 86_400_000 + 60_000);
});

test("the cancel route counts the top-up against its gift and writes a journal line for it", () => {
  const route = readFileSync(new URL("../app/api/gift/[id]/cancel/route.ts", import.meta.url), "utf8");
  assert.match(route, /admitTopUp\(request, auth\.account, id\)/);
  const admitted = route.indexOf("admitTopUp(request, auth.account, id)");
  const sent = route.indexOf("walletClient.sendTransaction");
  const journal = route.indexOf("topUp: formatEther(value)");
  assert.ok(admitted < sent && sent < journal, "counted before the MON leaves, journalled once it has");
});
