import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { claimPass, configurePassGuard, FREQUENT_PASS_EVERY_SECONDS, FREQUENT_PASS_RECENT_SECONDS } from "../src/frequent-pass";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The milestones' frequent pass (the founder, 29 Sep 2026): a public address cron-job.org calls every ten minutes,
 * guarding itself, reading one gift after another, telling what is reached once, and answering with nothing.
 */

let db: PGlite;

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configurePassGuard(executor);
});

after(async () => {
  configurePassGuard(undefined);
  await db.close();
});

test("one pass every four minutes at most: a call in between claims nothing, each call of a five-minute scheduler runs", async () => {
  assert.equal(FREQUENT_PASS_EVERY_SECONDS, 4 * 60);
  const start = Date.UTC(2026, 8, 29, 12, 3);
  assert.equal(await claimPass("milestones", FREQUENT_PASS_EVERY_SECONDS, start), true);
  assert.equal(await claimPass("milestones", FREQUENT_PASS_EVERY_SECONDS, start + 60_000), false);
  assert.equal(await claimPass("milestones", FREQUENT_PASS_EVERY_SECONDS, start + 3 * 60_000), false);
  // The scheduler's next call, even twenty seconds early, runs: a five-minute guard would have dropped it.
  assert.equal(await claimPass("milestones", FREQUENT_PASS_EVERY_SECONDS, start + 5 * 60_000 - 20_000), true, "the next call of the scheduler");
  assert.equal(await claimPass("other", FREQUENT_PASS_EVERY_SECONDS, start + 60_000), true, "each pass by its own name");
});

test("the route answers at once with nothing about any gift, and the pass reads and tells, one gift after another", () => {
  const route = readFileSync("app/api/cron/milestones/route.ts", "utf8");
  assert.match(route, /export async function GET\(\)/, "a GET, which the scheduler sends");
  assert.doesNotMatch(route, /CRON_SECRET|authorization/i, "no secret");
  assert.match(route, /after\(async \(\) =>/, "the pass after the answer");
  assert.match(route, /NextResponse\.json\(\{ ok: true \}/);
  const pass = readFileSync("src/frequent-pass.ts", "utf8");
  assert.match(pass, /milestonePass\(false, deps\)/, "reading and telling, never settling");
  assert.match(pass, /recentSeconds: FREQUENT_PASS_RECENT_SECONDS/);
  assert.equal(FREQUENT_PASS_RECENT_SECONDS, 4 * 60, "a gift read by the last pass, five minutes ago, is read again by this one");
  const milestones = readFileSync("src/milestone-pass.ts", "utf8");
  assert.match(milestones, /for \(const record of await deps\.gifts\(\)\) \{\n\s*try \{\n\s*lines\.push\(\.\.\.\(await passOne/, "one gift after another");
  assert.match(milestones, /if \(outcome\.kind === "reached"\) \{\n\s*await tell\(giftId, "reached"\);/, "told when reached");
  assert.match(milestones, /const tell = deps\.tell \?\? liveTell;/);
});
