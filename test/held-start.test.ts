// The first reading of a gift of the second version is signed by the account the gift is for (the review of 2 Oct
// 2026, R-15). The contract's half is pinned in test/V2FirstReading.t.sol. This is the app's half: the reading is read
// once, held, signed in the browser by the person's own account, and sent with that signature.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withTheStartSigned, type StartAsked } from "../src/client/v2";
import { holdTheStart, resumeHeldStart, type ResumeDeps } from "../src/held-start";
import { configureHeldStartStore, dropHeldStart, holdStart, loadHeldStart, type HeldStart } from "../src/held-start-store";
import type { MilestoneProofMessage } from "../src/milestone-protocol";
import type { MilestoneReading } from "../src/milestone-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { RelayerError } from "../src/relayer";
import { startTypedData } from "../src/v2-protocol";
import { isStartSignedBy, StartNotSigned } from "../src/v2-start";

const RECIPIENT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const STRANGER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const DAILY = "0x00000000000000000000000000000000000000D2" as Hex;
const MILESTONE = "0x00000000000000000000000000000000000000d3" as Hex;
const IDENTITY: Hex = `0x${"cd".repeat(32)}`;
const PROVIDER: Hex = `0x${"ab".repeat(32)}`;
const NULLIFIER: Hex = `0x${"ee".repeat(32)}`;
const NOW = 1_800_000_000;

const DAILY_START = { giftId: 41n, identityHash: IDENTITY, metricValue: 1_000n, observedAt: BigInt(NOW - 5) };
const CLIMB_START = { giftId: 1_000_041n, identityHash: IDENTITY, metricValue: 1_904n, observedAt: BigInt(NOW - 5) };

const heldDaily = (): Omit<HeldStart, "heldAt"> => ({
  giftId: "41",
  account: RECIPIENT.address,
  kind: "daily",
  contract: DAILY,
  message: { giftId: "41", recipient: RECIPIENT.address, identityHash: IDENTITY, providerId: PROVIDER, metricValue: "1000", observedAt: String(NOW - 5), nullifier: NULLIFIER, issuedAt: String(NOW), expiresAt: String(NOW + 600) },
  sessionId: "public:41:bind:20833:eeeeeeeeeeeeeeee",
  after: { bindTo: "profile-7", xp: 1_000 },
});

const READING: MilestoneReading = { giftId: "1000041", purpose: "start", attested: true, username: "erik", playerId: "41", rating: 1_904, ratedAt: NOW - 7_200, rd: 42, observedAt: NOW - 5, nullifier: NULLIFIER, outcome: "started", txHash: null, proofs: [{ claim: "kept as it was read" }] };

const heldClimb = (): Omit<HeldStart, "heldAt"> => ({
  giftId: "1000041",
  account: RECIPIENT.address,
  kind: "milestone",
  contract: MILESTONE,
  message: { giftId: "1000041", recipient: RECIPIENT.address, identityHash: IDENTITY, providerId: PROVIDER, metricValue: "1904", eventAt: "0", observedAt: String(NOW - 5), nullifier: NULLIFIER, issuedAt: String(NOW), expiresAt: String(NOW + 600) },
  sessionId: null,
  after: { bindTo: "41", reading: READING as unknown as Record<string, unknown>, maximumStart: "1950" },
});

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureHeldStartStore(executor);
});
beforeEach(async () => {
  await db.query("DROP TABLE IF EXISTS viky_held_starts");
  configureHeldStartStore(async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  });
});
after(async () => {
  configureHeldStartStore(undefined);
  await db.close();
});

/** What a resume does, written down as it does it, over the real store. */
function harness(overrides: Partial<ResumeDeps> = {}) {
  const did: string[] = [];
  const proved: Array<{ message: MilestoneProofMessage; startSignature?: Hex }> = [];
  const recorded: MilestoneReading[] = [];
  const deps: ResumeDeps = {
    load: loadHeldStart,
    drop: dropHeldStart,
    leave: async () => ({ allowed: true }),
    checkIn: async (sessionId, contract, signature) => {
      did.push(`checkIn ${sessionId} ${contract} ${signature === undefined ? "unsigned" : "signed"}`);
      return { hash: "0xc1" as Hex, creditedDays: 0, alreadyRelayed: false };
    },
    prove: async (input) => {
      did.push("prove");
      proved.push({ message: input.message, startSignature: input.startSignature });
      return { hash: "0x51" as Hex, happened: "started", deadline: NOW + 30 * 86_400 };
    },
    markBound: async (giftId, profileId) => {
      did.push(`bind ${giftId} ${profileId}`);
      return true;
    },
    record: async (reading) => {
      recorded.push(reading);
    },
    now: () => NOW + 20,
    ...overrides,
  };
  return { deps, did, proved, recorded };
}

test("the table is made the first time it is needed, and holds one reading per gift: a newer one replaces it", async () => {
  assert.equal(await loadHeldStart("41"), null, "no migration ran: the first question makes the table");
  await holdStart(heldDaily());
  const kept = await loadHeldStart("41");
  assert.deepEqual({ ...kept, heldAt: undefined }, { ...heldDaily(), account: RECIPIENT.address.toLowerCase(), heldAt: undefined });
  assert.ok(kept!.heldAt instanceof Date);
  await holdStart({ ...heldDaily(), sessionId: "public:41:bind:20833:ffffffffffffffff", after: { bindTo: "profile-8", xp: 1_010 } });
  assert.equal((await loadHeldStart("41"))?.after.bindTo, "profile-8");
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM viky_held_starts")).rows[0]?.n, 1);
  await dropHeldStart("41");
  assert.equal(await loadHeldStart("41"), null);
  // Production never runs the migration script, so the store makes its own table (the incident of 29 Sep 2026).
  assert.match(readFileSync("src/held-start-store.ts", "utf8"), /await ensureHeldStartSchema\(\);\s+await sql\(\)`\s+INSERT INTO viky_held_starts/);
});

test("the relay's refusal becomes what the browser is to sign, and the reading is held as it was read", async () => {
  const held: Array<Parameters<typeof holdStart>[0]> = [];
  const asked = await holdTheStart(new StartNotSigned("daily", DAILY, DAILY_START), { account: RECIPIENT.address, message: heldDaily().message, sessionId: heldDaily().sessionId ?? undefined, after: { bindTo: "profile-7", xp: 1_000 } }, async (row) => {
    held.push(row);
  });
  assert.deepEqual(asked, { kind: "sign", giftId: "41", start: { of: "daily", contract: DAILY, identityHash: IDENTITY, metricValue: "1000", observedAt: String(NOW - 5) } });
  assert.deepEqual(held, [heldDaily()]);
  // What is answered is exactly what the contract will check the signature against.
  const signature = await RECIPIENT.signTypedData(startTypedData("daily", DAILY, DAILY_START));
  assert.equal(await isStartSignedBy({ kind: "daily", contract: DAILY, start: DAILY_START, recipient: RECIPIENT.address, signature }), true);
  assert.equal(await isStartSignedBy({ kind: "daily", contract: DAILY, start: { ...DAILY_START, metricValue: 1_001n }, recipient: RECIPIENT.address, signature }), false);
  assert.equal(await isStartSignedBy({ kind: "daily", contract: DAILY, start: DAILY_START, recipient: RECIPIENT.address, signature: "0x" }), false);
});

test("a daily gift's first reading is sent with the recipient's own signature, bound, and held no more", async () => {
  await holdStart(heldDaily());
  const { deps, did } = harness();
  const signature = await RECIPIENT.signTypedData(startTypedData("daily", DAILY, DAILY_START));
  const outcome = await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature }, deps);
  assert.deepEqual(outcome, { kind: "bound", giftId: "41", xp: 1_000, hash: "0xc1" });
  assert.deepEqual(did, [`checkIn public:41:bind:20833:eeeeeeeeeeeeeeee ${DAILY} signed`, "bind 41 profile-7"]);
  assert.equal(await loadHeldStart("41"), null);
  // Asked again, there is nothing to send: the reading is taken afresh.
  assert.deepEqual(await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature }, deps), { kind: "refused", giftId: "41", code: "NOTHING_HELD", message: "That reading is no longer waiting. Start again." });
});

test("nothing is sent on a signature that is not the recipient's over what is held, nor for anybody else's asking", async () => {
  await holdStart(heldDaily());
  const { deps, did } = harness();
  // Another account's signature over the same reading.
  let outcome = await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature: await STRANGER.signTypedData(startTypedData("daily", DAILY, DAILY_START)) }, deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "NOT_SIGNED_BY_YOU");
  // The recipient's own signature over another value: a baseline far above where they stand, say.
  outcome = await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature: await RECIPIENT.signTypedData(startTypedData("daily", DAILY, { ...DAILY_START, metricValue: 2n ** 63n })) }, deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "NOT_SIGNED_BY_YOU");
  // Signed for the other contract.
  outcome = await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature: await RECIPIENT.signTypedData(startTypedData("milestone", DAILY, DAILY_START)) }, deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "NOT_SIGNED_BY_YOU");
  // Asked by another account, with that account's own signature: the reading is not theirs to send.
  outcome = await resumeHeldStart({ giftId: "41", account: STRANGER.address, signature: await STRANGER.signTypedData(startTypedData("daily", DAILY, DAILY_START)) }, deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "NOTHING_HELD");
  assert.deepEqual(did, [], "nothing was relayed, and nothing was bound");
  assert.ok(await loadHeldStart("41"), "what is held is still held for the person it is for");
});

test("a stop signed since the reading was taken holds it back", async () => {
  await holdStart(heldDaily());
  const { deps, did } = harness({ leave: async () => ({ allowed: false }) });
  const outcome = await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature: await RECIPIENT.signTypedData(startTypedData("daily", DAILY, DAILY_START)) }, deps);
  assert.equal(outcome.kind === "refused" && outcome.code, "NO_AGREEMENT");
  assert.deepEqual(did, []);
});

test("the start of a climb is sent with the recipient's signature, signed afresh by the evidence signer, bound and written in its journal", async () => {
  await holdStart(heldClimb());
  const { deps, did, proved, recorded } = harness();
  const signature = await RECIPIENT.signTypedData(startTypedData("milestone", MILESTONE, CLIMB_START));
  const outcome = await resumeHeldStart({ giftId: "1000041", account: RECIPIENT.address, signature }, deps);
  assert.deepEqual(outcome, { kind: "started", giftId: "1000041", rating: 1_904, hash: "0x51", aboveAccepted: false, deadline: NOW + 30 * 86_400 });
  assert.deepEqual(did, ["prove", "bind 1000041 41"]);
  // What was read is what is sent: its value, its moment and its nullifier are the ones held. Only the evidence
  // signer's own window is of now.
  assert.deepEqual(proved, [
    {
      startSignature: signature,
      message: { giftId: 1_000_041n, recipient: RECIPIENT.address, identityHash: IDENTITY, providerId: PROVIDER, metricValue: 1_904n, eventAt: 0n, observedAt: BigInt(NOW - 5), nullifier: NULLIFIER, issuedAt: BigInt(NOW + 20), expiresAt: BigInt(NOW + 620) },
    },
  ]);
  assert.deepEqual(recorded, [{ ...READING, outcome: "started", txHash: "0x51" }]);
  assert.equal(await loadHeldStart("1000041"), null);
});

test("a start above what the funder accepted is said so once it is sent", async () => {
  await holdStart({ ...heldClimb(), after: { ...heldClimb().after, maximumStart: "1900" } });
  const { deps } = harness();
  const outcome = await resumeHeldStart({ giftId: "1000041", account: RECIPIENT.address, signature: await RECIPIENT.signTypedData(startTypedData("milestone", MILESTONE, CLIMB_START)) }, deps);
  assert.equal(outcome.kind === "started" && outcome.aboveAccepted, true);
});

test("what the contract refuses is said in its own words, and the reading is not kept to be sent again", async () => {
  await holdStart(heldDaily());
  const { deps, did } = harness({
    checkIn: async () => {
      throw new RelayerError("REVERTED", "reverted", "AttestationExpired");
    },
  });
  const outcome = await resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature: await RECIPIENT.signTypedData(startTypedData("daily", DAILY, DAILY_START)) }, deps);
  assert.deepEqual(outcome, { kind: "refused", giftId: "41", code: "EXPIRED", message: "That reading took too long. Try again in a moment." });
  assert.deepEqual(did, []);
  assert.equal(await loadHeldStart("41"), null);
  // A failure that is not the contract's answer is not swallowed: the route says it failed, and the reading is kept.
  await holdStart(heldDaily());
  const failing = harness({
    checkIn: async () => {
      throw new Error("the node did not answer");
    },
  });
  await assert.rejects(resumeHeldStart({ giftId: "41", account: RECIPIENT.address, signature: await RECIPIENT.signTypedData(startTypedData("daily", DAILY, DAILY_START)) }, failing.deps), /the node did not answer/);
  assert.ok(await loadHeldStart("41"));
});

test("in the browser: an answer that asks for the signature is signed by the account and asked again, any other is passed through", async () => {
  const asked: StartAsked = { kind: "sign", giftId: "41", start: { of: "daily", contract: DAILY, identityHash: IDENTITY, metricValue: "1000", observedAt: String(NOW - 5) } };
  const sent: Array<{ path: string; body: unknown }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (path: string, init: { body: string }) => {
    sent.push({ path, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ kind: "bound", giftId: "41", xp: 1_000, hash: "0xc1" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  try {
    let asks = 0;
    const signer = async () => {
      asks += 1;
      return RECIPIENT;
    };
    // An ordinary outcome asks the account for nothing.
    assert.deepEqual(await withTheStartSigned("41", { kind: "refused", giftId: "41", code: "X", message: "no" }, signer), { kind: "refused", giftId: "41", code: "X", message: "no" });
    assert.equal(asks, 0);
    assert.deepEqual(await withTheStartSigned<{ kind: string }>("41", asked, signer), { kind: "bound", giftId: "41", xp: 1_000, hash: "0xc1" });
    assert.equal(asks, 1, "the account is asked once, which opens no passkey when its session is open");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].path, "/api/gift/41/bind");
    const signature = (sent[0].body as { startSignature: Hex }).startSignature;
    assert.equal(await isStartSignedBy({ kind: "daily", contract: DAILY, start: DAILY_START, recipient: RECIPIENT.address, signature }), true, "what it sends is the account's signature over exactly what was asked");
    assert.deepEqual(Object.keys(sent[0].body as object), ["startSignature"], "and nothing else");
    // The account signs for the gift its page is on, and for no other.
    await assert.rejects(withTheStartSigned("42", asked, signer), (error: unknown) => error instanceof Error && error.message.includes("could not be used"));
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("every first reading goes through the hold, and the route sends nothing on a request that reads", () => {
  for (const path of ["src/duolingo-public-checkin.ts", "src/connected-checkin.ts"]) {
    assert.match(readFileSync(path, "utf8"), /if \(error instanceof StartNotSigned\) \{\s+return holdTheStart\(error, \{ account: recipient, message: serialiseMessage\(message\), sessionId, after: \{ bindTo: /, path);
  }
  assert.match(readFileSync("src/milestone-reading.ts", "utf8"), /if \(error instanceof StartNotSigned && deps\.hold\) \{\s+return deps\.hold\(error, \{/);
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /if \(error instanceof StartNotSigned\) \{\s+const stored = await loadAttestation\(result\.sessionId\);/);
  const route = readFileSync("app/api/gift/[id]/bind/route.ts", "utf8");
  // The signature is taken from the recipient signed in, and a request that carries one reads nothing.
  assert.ok(route.indexOf("resumeHeldStart(") < route.indexOf("readDailyGift({"));
  assert.match(route, /held\.recipient\.toLowerCase\(\) !== signed\.account\.toLowerCase\(\)\) throw new GiftApiError\("NOT_RECIPIENT"/);
  // The three presses that take a first reading give the account to sign with.
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  // Each also says which step it is on, for the line a long wait shows (app/kit/Waiting.tsx).
  assert.match(page, /startMilestone\(giftId, ensureSigner, startStep\)\) : dailyOutcome\(await bindGoalAccount\(giftId, ensureSigner, startStep\)\)/);
  assert.match(readFileSync("app/kit/ConnectTheAccount.tsx", "utf8"), /withTheStartSigned<Outcome>\(giftId, await postJson<Outcome \| StartAsked>\(`\/api\/gift\/\$\{giftId\}\/bind`, \{\}\), ensureSigner\)/);
});
