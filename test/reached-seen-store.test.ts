import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { SqlExecutor } from "../src/proof-session-store";
import { configureReachedSeenStore, markReachedSeen, reachedSeenOf } from "../src/reached-seen-store";

/** The moment of a reached gift, once per account and gift, whichever device asks (the founder, 29 Sep 2026). */

let db: PGlite;

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureReachedSeenStore(executor);
});

after(async () => {
  configureReachedSeenStore(undefined);
  await db.close();
});

test("a moment is owed until it is shown, then seen by that account alone, and a second write changes nothing", async () => {
  const recipient = "0x00000000000000000000000000000000000000AA";
  const funder = "0x00000000000000000000000000000000000000Bb";
  assert.deepEqual([...(await reachedSeenOf(recipient, ["1000000", "1000001"]))], []);
  await markReachedSeen(recipient, "1000000");
  await markReachedSeen(recipient.toLowerCase(), "1000000");
  assert.deepEqual([...(await reachedSeenOf(recipient.toLowerCase(), ["1000000", "1000001"]))], ["1000000"]);
  assert.deepEqual([...(await reachedSeenOf(funder, ["1000000"]))], [], "the funder has their own moment");
  assert.deepEqual([...(await reachedSeenOf(funder, []))], []);
});
