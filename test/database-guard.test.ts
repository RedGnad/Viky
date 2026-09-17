import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
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

test("the production database is refused everywhere but a running production deployment", () => {
  // The production host is known only by its fingerprint, so a stand-in host plays it here.
  const standIn = "postgresql://u:p@ep-stand-in-000000-pooler.eu-central-1.aws.neon.tech/db";
  const production = String(databaseFingerprint(standIn));
  const deployed = { VERCEL: "1", VERCEL_REGION: "cdg1" };
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn }, production), ProductionDatabaseRefused);
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn.replace("-pooler", "") }, production), ProductionDatabaseRefused, "pooled or direct");
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VERCEL: "0", VIKY_ALLOW_PRODUCTION_DATABASE: "yes" }, production), ProductionDatabaseRefused, "only the exact words open it");
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: standIn, ...deployed, VERCEL_ENV: "production" }, production));
  assert.throws(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VERCEL: "1", VERCEL_ENV: "production" }, production), ProductionDatabaseRefused, "a pulled env file is not a deployment");
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: standIn, VIKY_ALLOW_PRODUCTION_DATABASE: "1" }, production));
  assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: LOCAL }, production));
});

test("a preview or development deployment is refused the production database, however it got the URL", () => {
  const standIn = "postgresql://u:p@ep-stand-in-000000-pooler.eu-central-1.aws.neon.tech/db";
  const production = String(databaseFingerprint(standIn));
  const deployed = { VERCEL: "1", VERCEL_REGION: "cdg1" };
  // Every test branch a developer deploys used to write into real gifts, because the preview environment carried the
  // production URL. The stored value is fixed now; this is the part that holds if the Neon integration writes it back.
  for (const environment of ["preview", "development", undefined]) {
    assert.throws(
      () => assertDatabaseAllowed({ DATABASE_URL: standIn, ...deployed, VERCEL_ENV: environment }, production),
      ProductionDatabaseRefused,
      `a ${environment ?? "nameless"} deployment must not reach production`,
    );
    assert.doesNotThrow(() => assertDatabaseAllowed({ DATABASE_URL: LOCAL, ...deployed, VERCEL_ENV: environment }, production));
  }
});

test("every store connects through the guard, a local server checks it at start, and scripts check it on load", () => {
  // Every file that opens a Neon connection, found rather than listed, so a store added later is covered too.
  const stores = globSync("src/**/*.ts").filter((file) => file !== "src/database-guard.ts" && /\bneon\(/.test(readFileSync(file, "utf8")));
  assert.ok(stores.length >= 6, `only ${stores.length} stores found`);
  for (const store of stores) {
    const source = readFileSync(store, "utf8");
    assert.match(source, /databaseUrl\(\)/, `${store} connects through the guard`);
    assert.doesNotMatch(source, /neon\(process\.env\.DATABASE_URL/, `${store} never reads the URL around it`);
  }
  assert.match(readFileSync("instrumentation.ts", "utf8"), /refuseProductionDatabase\(\)/);
  assert.match(readFileSync("src/database-guard-start.ts", "utf8"), /assertDatabaseAllowed\(\);/);
  assert.match(readFileSync("src/load-env.ts", "utf8"), /assertDatabaseAllowed\(\);/);
});
