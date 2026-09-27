// One account, or one connection, cannot spend a paced platform's readings for everybody (the money path audit of
// 27 Sep 2026): a few a day each, counted in the database, a refused one taken back out.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GiftApiError } from "../src/gift-api";
import type { SqlExecutor } from "../src/proof-session-store";
import { admitPacedReading, PACED_READINGS_PER_DAY } from "../src/reading-admission";
import { configureRelayCeilingStore, ensureRelayCeilingSchema } from "../src/relay-ceiling-store";

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

const NOW = Date.UTC(2026, 9, 5, 9, 0, 0);
const from = (ip: string) => new Request("https://viky.test/api/marathon/prove", { method: "POST", headers: { "x-forwarded-for": ip } });
const refused = (error: unknown) => error instanceof GiftApiError && error.code === "READING_CEILING";

test("an account reads a few results a day, then is told to come back tomorrow, and the next day it may again", async () => {
  const runner = "0x00000000000000000000000000000000000000c1";
  for (let i = 0; i < PACED_READINGS_PER_DAY.account; i++) await admitPacedReading(from(`198.51.100.${i}`), runner, NOW);
  await assert.rejects(admitPacedReading(from("198.51.100.99"), runner, NOW), refused);
  await admitPacedReading(from("198.51.100.99"), runner, NOW + 86_400_000);
});

test("one connection cannot spend them through many accounts", async () => {
  for (let i = 0; i < PACED_READINGS_PER_DAY.connection; i++) await admitPacedReading(from("203.0.113.7"), `0x${(i + 1).toString(16).padStart(40, "d")}`, NOW);
  await assert.rejects(admitPacedReading(from("203.0.113.7"), "0x00000000000000000000000000000000000000e1", NOW), refused);
});

test("the marathon's proof route counts the reading after the gift is checked and before the service is asked", () => {
  const route = readFileSync(new URL("../app/api/marathon/prove/route.ts", import.meta.url), "utf8");
  const checked = route.indexOf("marathonAccountOfGift(");
  const counted = route.indexOf("await admitPacedReading(request, auth.account)");
  const read = route.indexOf("proveCertificate(");
  assert.ok(checked > 0 && checked < counted && counted < read);
});
