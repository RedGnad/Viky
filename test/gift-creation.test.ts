import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { ContractAuthorization } from "../src/ausd-authorization";
import { COUNTING_PASS, dailyPass } from "../src/daily-pass";
import { GiftApiError } from "../src/gift-api";
import { RelayerError } from "../src/relayer";
import type { GiftParams } from "../src/gift-attestation";
import { completePendingCreations, CREATION_ABANDON_MS, CREATION_LEASE_MS, makeGift, type CreationDeps } from "../src/gift-creation";
import {
  abandonCreation,
  beginCreation,
  claimTokenHash,
  completeCreation,
  configureGiftStore,
  ensureGiftSchema,
  holdsGiftLink,
  loadCreation,
  loadGift,
  loadPendingCreations,
  markCreationSubmitted,
  restartCreation,
  saveGift,
} from "../src/gift-store";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * Making a gift is a money path (D87): the money moves on the relay, and the gift exists for Viky once it is recorded.
 * These tests break the record between the two, try the same terms twice, and let the keeper's pass finish what was
 * left, against a real Postgres engine and a relay that only pretends to reach the chain.
 */

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
});
after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

const FUNDER = "0x000000000000000000000000000000000000A11C" as Hex;
const ESCROW = "0x00000000000000000000000000000000000000e1" as Hex;
const AUTH: ContractAuthorization = { validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"00".repeat(32)}`, v: 27, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}` };

function terms(n: number): { params: GiftParams; nonce: Hex } {
  return {
    params: { funder: FUNDER, refundTo: FUNDER, recipientContactHash: `0x${"00".repeat(32)}`, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 25_000_000n, salt: `0x${String(n).padStart(64, "0")}` },
    nonce: `0x${String(n).padStart(2, "0").repeat(32)}` as Hex,
  };
}

/** Gift numbers and transactions are unique across the whole file, as they are on the chain. */
let sequence = 100;

/** The store's own functions, and a pretend chain: what was relayed, what each transaction made, whether a nonce is spent. */
function world(options: { saveFailures?: number; relayFails?: "before" | "after" | "accepted"; gate?: Promise<void>; spentUnreadable?: boolean; readBack?: "absent" } = {}) {
  let clock = Date.now();
  let saveFailures = options.saveFailures ?? 0;
  const chain = new Map<Hex, { giftId: string }>();
  const spentNonces = new Set<string>();
  let relays = 0;
  const deps: CreationDeps = {
    begin: beginCreation,
    restart: restartCreation,
    submitted: markCreationSubmitted,
    relay: async (params, authorization, onSubmitted) => {
      relays += 1;
      if (options.relayFails === "before") throw new Error("the simulation refused");
      if (options.relayFails === "accepted") {
        // The node took the transaction and its answer was lost: the money moves, and nothing says so to the caller.
        spentNonces.add(authorization.nonce.toLowerCase());
        throw new Error("the provider answered: overloaded");
      }
      sequence += 1;
      const hash = `0x${String(sequence).padStart(8, "0")}${"ab".repeat(28)}` as Hex;
      await onSubmitted(hash);
      if (options.gate) await options.gate;
      const giftId = String(sequence);
      chain.set(hash, { giftId });
      spentNonces.add(authorization.nonce.toLowerCase());
      return { giftId, hash, escrow: ESCROW };
    },
    readBack: async (txHash) => {
      const made = chain.get(txHash);
      return made ? { kind: "made", giftId: made.giftId, escrow: ESCROW } : { kind: options.readBack ?? "unknown" };
    },
    spent: async (_funder, nonce) => {
      if (options.spentUnreadable) throw new Error("the node did not answer");
      return spentNonces.has(nonce.toLowerCase());
    },
    save: async (input) => {
      if (saveFailures > 0) {
        saveFailures -= 1;
        throw new Error("the database refused");
      }
      await saveGift(input);
    },
    complete: completeCreation,
    abandon: abandonCreation,
    loadPending: loadPendingCreations,
    now: () => clock,
  };
  return {
    deps,
    relays: () => relays,
    advance: (ms: number) => {
      clock += ms;
    },
    spend: (nonce: Hex) => spentNonces.add(nonce.toLowerCase()),
  };
}

const code = (error: unknown) => (error instanceof GiftApiError ? error.code : String(error));

test("a record that fails after the relay leaves a pending creation with its transaction, and no gift row", async () => {
  const w = world({ saveFailures: 1 });
  const { params, nonce } = terms(1);
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce }, recipientName: "Léa", funderName: "Mom" }, w.deps), /the database refused/);
  assert.equal(w.relays(), 1);
  const row = await loadCreation(nonce);
  assert.equal(row?.status, "pending");
  assert.ok(row?.txHash, "the transaction was written the moment it was submitted");
  assert.equal(await loadGift("100"), null, "the gift is not recorded yet");
});

test("a retry of the same terms completes that creation with a fresh key, and relays nothing", async () => {
  const w = world({ saveFailures: 1 });
  const { params, nonce } = terms(2);
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce }, recipientName: "Léa", funderName: "Mom" }, w.deps));
  const failedKeyHash = (await loadCreation(nonce))?.claimTokenHash;

  const made = await makeGift({ params, nonce, authorization: { ...AUTH, nonce }, recipientName: "Léa", funderName: "Mom" }, w.deps);
  assert.equal(w.relays(), 1, "the money moved once");
  const gift = await loadGift(made.giftId);
  assert.ok(gift, "the gift is recorded");
  assert.equal(gift?.funderName, "Mom");
  assert.ok(gift && holdsGiftLink(gift, made.claimToken), "the link answered now opens it");
  assert.notEqual(gift?.claimTokenHash, failedKeyHash, "the key of the failed attempt, never shown, does not");
  assert.equal((await loadCreation(nonce))?.status, "complete");

  // And once made, the same terms again are told so, and nothing is relayed.
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps), (error) => code(error) === "ALREADY_MADE");
  assert.equal(w.relays(), 1);
});

test("a second attempt while the first is in flight is told it is in progress, and the money moves once", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const w = world({ gate });
  const { params, nonce } = terms(3);
  const first = makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps);
  for (let tries = 0; tries < 50 && !(await loadCreation(nonce))?.txHash; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps), (error) => code(error) === "IN_PROGRESS");
  release();
  const made = await first;
  assert.ok(await loadGift(made.giftId));
  assert.equal(w.relays(), 1);
});

test("a refusal before anything was submitted leaves the same terms free to go again at once", async () => {
  const refused = world({ relayFails: "before" });
  const { params, nonce } = terms(4);
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, refused.deps), /refused/);
  assert.equal((await loadCreation(nonce))?.status, "abandoned");
  const w = world();
  const made = await makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps);
  assert.ok(await loadGift(made.giftId));
});

test("the keeper's pass completes a creation left pending, with the key hash of the attempt that made it", async () => {
  const w = world({ saveFailures: 1 });
  const { params, nonce } = terms(5);
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce }, funderName: "Mom" }, w.deps));
  const pending = await loadCreation(nonce);

  // Within the lease nothing is touched: the request may still be finishing.
  assert.deepEqual((await completePendingCreations(w.deps)).filter((line) => line.nonce === nonce), []);

  w.advance(CREATION_LEASE_MS + 1_000);
  const report = await dailyPass(COUNTING_PASS, {
    boundGifts: async () => [],
    allGifts: async () => [],
    read: async () => ({ cancelled: false, finalised: false, startDay: 0, recipient: null, fundedAt: 0, claimedAt: 0 }),
    count: async (giftId) => ({ kind: "already", giftId, reason: "not_bound" }),
    drain: async () => ({ hash: "0x" }),
    finalise: async () => ({ hash: "0x" }),
    refund: async () => ({ hash: "0x" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    completeCreations: () => completePendingCreations(w.deps),
  });
  const completed = await loadCreation(nonce);
  assert.equal(completed?.status, "complete");
  // The pass reports it by the gift it became (other tests left creations pending too, and it completes those as well).
  assert.ok(report.lines.some((entry) => entry.step === "create" && entry.giftId === completed?.giftId && entry.result === "completed"));
  const gift = await loadGift(String(completed?.giftId));
  assert.equal(gift?.claimTokenHash, pending?.claimTokenHash);
  assert.equal(gift?.funderName, "Mom");
  assert.equal(w.relays(), 1);
});

test("the pass calls a creation abandoned only when its money never moved, and asks for an operator when it did", async () => {
  const w = world();
  const quiet = terms(6);
  const paid = terms(7);
  for (const { params, nonce } of [quiet, paid]) {
    await beginCreation({
      nonce,
      funder: params.funder,
      contactHash: params.recipientContactHash,
      goalType: 1,
      dailyTarget: 10,
      durationDays: 7,
      amount: params.amount,
      goalUsername: null,
    goalCourse: null,
    goalCourseTitle: null,
      recipientName: null,
      funderName: null,
      claimTokenHash: claimTokenHash("never-shown"),
    });
  }
  w.spend(paid.nonce);
  w.advance(CREATION_ABANDON_MS + 1_000);
  const lines = await completePendingCreations(w.deps);
  assert.match(String(lines.find((entry) => entry.nonce === quiet.nonce)?.result), /^abandoned/);
  assert.match(String(lines.find((entry) => entry.nonce === paid.nonce)?.result), /^needs an operator/);
  assert.equal((await loadCreation(quiet.nonce))?.status, "abandoned");
  assert.equal((await loadCreation(paid.nonce))?.status, "pending");
});

// ---------------------------------------------------------------------------------------------------------------
// The audit of 1 Oct 2026, F-09: a send that fails is not always a send that did not happen.
// ---------------------------------------------------------------------------------------------------------------

test("a send whose answer was lost after the money moved is not called abandoned, and nobody is told that nothing changed", async () => {
  // The defect this pins: every error of the send was read as "nothing left", so the row went to abandoned while the
  // money could be in the contract, the funder read "Nothing was changed", and a second try could fund a second gift.
  const w = world({ relayFails: "accepted" });
  const { params, nonce } = terms(8);
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps), (error) => code(error) === "BEING_RECORDED");
  assert.equal((await loadCreation(nonce))?.status, "pending", "the creation is kept for the keeper and for an operator");
  // The same terms again relay nothing: the money moved once.
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps), (error) => ["IN_PROGRESS", "BEING_RECORDED"].includes(code(error)));
  assert.equal(w.relays(), 1);
  w.advance(CREATION_ABANDON_MS + 1_000);
  const lines = await completePendingCreations(w.deps);
  assert.match(String(lines.find((entry) => entry.nonce === nonce)?.result), /^needs an operator/);
});

test("when the chain cannot say whether the money moved, the creation is not abandoned either", async () => {
  const w = world({ relayFails: "before", spentUnreadable: true });
  const { params, nonce } = terms(9);
  await assert.rejects(makeGift({ params, nonce, authorization: { ...AUTH, nonce } }, w.deps), (error) => code(error) === "IN_PROGRESS");
  assert.equal((await loadCreation(nonce))?.status, "pending", "an unreadable chain is never read as nothing having moved");

  // The relayer's own refusal is raised before the wallet is asked for anything: what it says is passed on as it
  // is, and the creation is still left for the chain to settle rather than abandoned on that word alone.
  const refusing = world({ spentUnreadable: true });
  const own = terms(12);
  const deps = { ...refusing.deps, relay: async () => Promise.reject(new RelayerError("RESERVE_TOO_LOW", "The relayer holds 9 MON")) };
  await assert.rejects(makeGift({ params: own.params, nonce: own.nonce, authorization: { ...AUTH, nonce: own.nonce } }, deps), (error) => error instanceof RelayerError && error.code === "RESERVE_TOO_LOW");
  assert.equal((await loadCreation(own.nonce))?.status, "pending");
});

test("a transaction in no block keeps its creation in progress while the authorization is good, and frees the terms after", async () => {
  // Submitted, recorded, and never included: the node says it holds no receipt, which is an answer.
  const w = world({ saveFailures: 1, readBack: "absent" });
  const { params, nonce } = terms(10);
  const good = { ...AUTH, nonce, validBefore: BigInt(Math.floor(Date.now() / 1_000) + 3_600) };
  await assert.rejects(makeGift({ params, nonce, authorization: good }, w.deps), /the database refused/);
  // The pretend chain holds that transaction: forget it, as a node does for one that never entered a block.
  const lost = world({ readBack: "absent" });
  await assert.rejects(makeGift({ params, nonce, authorization: good }, lost.deps), (error) => code(error) === "IN_PROGRESS");
  assert.equal(lost.relays(), 0);
  // The keeper leaves it alone for the hour the authorization lasts, then calls it abandoned: its money never moved.
  lost.advance(CREATION_LEASE_MS + 1_000);
  assert.match(String((await completePendingCreations(lost.deps)).find((entry) => entry.nonce === nonce)?.result), /in no block yet/);
  assert.equal((await loadCreation(nonce))?.status, "pending");
  lost.advance(CREATION_ABANDON_MS);
  assert.match(String((await completePendingCreations(lost.deps)).find((entry) => entry.nonce === nonce)?.result), /^abandoned/);

  // The same for a retry of the terms: once the authorization has run out the transaction can never be included, so
  // the attempt no longer answers "in progress" for ever.
  const again = terms(11);
  const first = world({ saveFailures: 1 });
  const expiring = { ...AUTH, nonce: again.nonce, validBefore: BigInt(Math.floor(Date.now() / 1_000) + 600) };
  await assert.rejects(makeGift({ params: again.params, nonce: again.nonce, authorization: expiring }, first.deps), /the database refused/);
  const later = world({ readBack: "absent" });
  await assert.rejects(makeGift({ params: again.params, nonce: again.nonce, authorization: expiring }, later.deps), (error) => code(error) === "IN_PROGRESS");
  later.advance(CREATION_LEASE_MS + 601_000);
  const made = await makeGift({ params: again.params, nonce: again.nonce, authorization: expiring }, later.deps);
  assert.ok(await loadGift(made.giftId), "the pretend relay accepts it; the real one would refuse the expired authorization, and the terms are free");
});
