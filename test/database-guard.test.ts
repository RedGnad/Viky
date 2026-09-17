import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertDatabaseAllowed, databaseFingerprint, databaseUrl, PRODUCTION_DATABASE_FINGERPRINT, ProductionDatabaseRefused } from "../src/database-guard";

/**
 * A local run never touches the production database by accident (17 Sep 2026). The production host is known only by
 * its fingerprint, so these tests build hosts whose fingerprints they control rather than naming production.
 */

const LOCAL = "postgresql://user:secret@ep-local-branch-a1b2c3.eu-central-1.aws.neon.tech/neondb?sslmode=require";

test("a host is fingerprinted the same whether it is reached through the pooler or not", () => {
  const pooled = databaseFingerprint("postgresql://u:p@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/db");
  const direct = databaseFingerprint("postgresql://u:p@ep-cool-name-123456.eu-central-1.aws.neon.tech/db");
  assert.ok(pooled && pooled === direct);
  assert.notEqual(databaseFingerprint(LOCAL), pooled);
  assert.equal(databaseFingerprint("not a url"), undefined);
  assert.match(PRODUCTION_DATABASE_FINGERPRINT, /^[0-9a-f]{64}$/);
});

test("a local run with no database, or another database, goes ahead", () => {
  assert.doesNotThrow(() => assertDatabaseAllowed({}));
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: LOCAL }));
  assert.equal(databaseUrl({ DATABASE_URL: ` ${LOCAL} ` }), LOCAL);
  assert.throws(() => databaseUrl({}), /DATABASE_URL is not configured/);
});

test("the production database is refused locally, and allowed on Vercel or when an operator command says so", () => {
  // The production host is known only by its fingerprint, so a stand-in host plays it here.
  const standIn = "postgresql://u:p@ep-stand-in-000000-pooler.eu-central-1.aws.neon.tech/db";
  const production = String(databaseFingerprint(standIn));
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn }, production), ProductionDatabaseRefused);
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn.replace("-pooler", "") }, production), ProductionDatabaseRefused, "pooled or direct");
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VERCEL: "0", VIKY_ALLOW_PRODUCTION_DATABASE: "yes" }, production), ProductionDatabaseRefused, "only the exact words open it");
  // A running deployment has a region; a production env file pulled onto a laptop says VERCEL=1 and has none.
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VERCEL: "1", VERCEL_REGION: "cdg1" }, production));
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VERCEL: "1", VERCEL_ENV: "production" }, production), ProductionDatabaseRefused, "a pulled env file is not a deployment");
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VIKY_ALLOW_PRODUCTION_DATABASE: "1" }, production));
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: LOCAL }, production));
});

test("every store connects through the guard, a local server checks it at start, and scripts check it on load", () => {
  for (const store of ["src/gift-store.ts", "src/preferences-store.ts", "src/proof-session-store.ts", "src/send-store.ts", "src/exit-store.ts"]) {
    const source = readFileSync(store, "utf8");
    assert.match(source, /databaseUrl\(\)/, `${store} connects through the guard`);
    assert.doesNotMatch(source, /neon\(process\.env\.DATABASE_URL/, `${store} never reads the URL around it`);
  }
  assert.match(readFileSync("instrumentation.ts", "utf8"), /refuseProductionDatabase\(\)/);
  assert.match(readFileSync("src/database-guard-start.ts", "utf8"), /assertDatabaseAllowed\(\);/);
  assert.match(readFileSync("src/load-env.ts", "utf8"), /assertDatabaseAllowed\(\);/);
});
