import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { CREATION_LEASE_MS, type CreationDeps } from "../src/gift-creation";
import { configureGiftStore, ensureGiftSchema, holdsGiftLink, loadCreation, loadGift, loadPendingCreations } from "../src/gift-store";
import { completePendingMilestoneCreations, liveMilestoneCreationDeps, makeMilestoneGift } from "../src/milestone-creation";
import { MILESTONE_FIRST_ID, SHAPE_CLIMB, ZERO_SUBJECT, type MilestoneParams } from "../src/milestone-protocol";
import { configureMilestoneStore, ensureMilestoneSchema, loadMilestoneGift } from "../src/milestone-store";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * A milestone gift is made in the order D87 set for every gift: recorded before its money moves, recorded as a gift
 * after. These tests break the record between the two and let the milestone pass finish it, with the milestone's own
 * record carried by the creation, against a real Postgres engine and a relay that only pretends to reach the chain.
 */

let db: PGlite;
before(async () => {
  db = new PGlite();
  const exec: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(exec);
  configureMilestoneStore(exec);
  await ensureGiftSchema();
  await ensureMilestoneSchema();
});
after(async () => {
  configureGiftStore(undefined);
  configureMilestoneStore(undefined);
  await db.close();
});

const FUNDER = "0x000000000000000000000000000000000000A11C" as Hex;
const CONTRACT = "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e" as Hex;
const FACTS = { conditionId: "chess-rating", mode: "rapid", standingAtOffer: 1904, standingReadAt: "2026-09-17T14:00:00.000Z" };
const AUTH = { validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"00".repeat(32)}` as Hex, v: 27, r: `0x${"03".repeat(32)}` as Hex, s: `0x${"04".repeat(32)}` as Hex };

function params(salt: number): MilestoneParams {
  return {
    funder: FUNDER,
    refundTo: FUNDER,
    recipientContactHash: `0x${"61".repeat(32)}`,
    goalType: 1,
    shape: SHAPE_CLIMB,
    target: 1954n,
    maximumStart: 1914n,
    subject: ZERO_SUBJECT,
    durationDays: 30,
    amount: 25_000_000n,
    salt: `0x${String(salt).padStart(64, "0")}`,
  };
}

/** The live dependencies on this database, with the chain replaced: a relay that submits, and a read back of it. */
function chain(over: Partial<CreationDeps> = {}, p?: MilestoneParams): { deps: CreationDeps; relayed: MilestoneParams[] } {
  const relayed: MilestoneParams[] = [];
  const live = liveMilestoneCreationDeps(p, p ? FACTS : undefined);
  const deps: CreationDeps = {
    ...live,
    relay: async (_daily, _authorization, onSubmitted) => {
      if (p) relayed.push(p);
      await onSubmitted(`0x${"7a".repeat(32)}`);
      return { giftId: String(MILESTONE_FIRST_ID), hash: `0x${"7a".repeat(32)}`, escrow: CONTRACT };
    },
    readBack: async () => ({ kind: "made", giftId: String(MILESTONE_FIRST_ID), escrow: CONTRACT }),
    spent: async () => true,
    ...over,
  };
  return { deps, relayed };
}

test("a milestone gift is recorded as a creation first, relayed with its own terms, then recorded with its own record", async () => {
  const p = params(1);
  const { deps, relayed } = chain({}, p);
  const made = await makeMilestoneGift({ params: p, authorization: AUTH, nonce: `0x${"01".repeat(32)}`, goalUsername: "erik", recipientName: "Erik", funderName: "Sam", facts: FACTS }, deps);
  assert.equal(made.giftId, "1000000");
  assert.deepEqual(relayed, [p], "the milestone contract's own terms went out, not a daily gift's");
  const gift = await loadGift("1000000");
  assert.equal(gift?.escrow?.toLowerCase(), CONTRACT.toLowerCase());
  assert.equal(gift?.goalUsername, "erik");
  assert.equal(gift?.dailyTarget, 0, "a milestone has no bar for a day");
  assert.ok(gift && holdsGiftLink(gift, made.claimToken));
  assert.deepEqual({ ...(await loadMilestoneGift("1000000")), standingReadAt: undefined }, { giftId: "1000000", conditionId: "chess-rating", mode: "rapid", standingAtOffer: 1904, standingReadAt: undefined, portal: null, course: null });
  const creation = await loadCreation(`0x${"01".repeat(32)}`);
  assert.equal(creation?.status, "complete");
  assert.equal(creation?.kind, "milestone");
});

test("a record that fails after the money moved leaves a pending milestone creation, which the milestone pass completes", async () => {
  const p = { ...params(2) };
  const nonce = `0x${"02".repeat(32)}` as Hex;
  const failing = chain(
    {
      save: async () => Promise.reject(new Error("the database went away")),
      readBack: async () => ({ kind: "made", giftId: "1000001", escrow: CONTRACT }),
      relay: async (_daily, _authorization, onSubmitted) => {
        await onSubmitted(`0x${"7b".repeat(32)}`);
        return { giftId: "1000001", hash: `0x${"7b".repeat(32)}`, escrow: CONTRACT };
      },
    },
    p,
  );
  await assert.rejects(makeMilestoneGift({ params: p, authorization: AUTH, nonce, goalUsername: "erik", facts: FACTS }, failing.deps), /database went away/);
  const pending = await loadCreation(nonce);
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.txHash, `0x${"7b".repeat(32)}`);
  assert.deepEqual(pending?.milestone, FACTS, "the milestone's own record travels with its creation");

  // The daily contract's pass never sees it: it would read it back with the wrong events.
  const later = new Date(Date.now() + CREATION_LEASE_MS + 1_000);
  assert.equal((await loadPendingCreations(later)).some((row) => row.nonce === nonce), false);
  assert.equal((await loadPendingCreations(later, "milestone")).some((row) => row.nonce === nonce), true);

  // The milestone pass's completion, with no terms in hand: everything comes from the creation.
  const keeper = chain({ readBack: async () => ({ kind: "made", giftId: "1000001", escrow: CONTRACT }), now: () => later.getTime() });
  const lines = await completePendingMilestoneCreations(keeper.deps);
  assert.deepEqual(lines, [{ nonce, result: "completed", giftId: "1000001" }]);
  assert.equal((await loadGift("1000001"))?.escrow?.toLowerCase(), CONTRACT.toLowerCase());
  assert.equal((await loadMilestoneGift("1000001"))?.standingAtOffer, 1904);
  assert.equal((await loadCreation(nonce))?.status, "complete");
});
