import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { identityPseudonym, type CheckInMessage } from "../src/gift-attestation";
import type { GiftState } from "../src/gift-reader";
import { configureGiftStore, ensureGiftSchema, loadGift, markClaimed, recordRelayed, saveGift, setRecipientUsername } from "../src/gift-store";
import { githubNullifier, githubSessionPrefix, profileHasCode, runGithubCheckIn, spanOf, type GithubCheckInDeps } from "../src/github-checkin";
import { GITHUB_PROVIDER_ID, GithubReadError, type GithubReading } from "../src/github-contributions";
import { configureProofSessionStore, ensureProofSessionSchema, loadAttestation, type SqlExecutor } from "../src/proof-session-store";
import { RelayerError } from "../src/relayer";

/**
 * A GitHub gift's two readings (D166), against real stores (PGlite) and fakes for GitHub, the chain, the signer and
 * the relayer: what is read, what is signed, what is bound, and what each refusal is called.
 */

process.env.IDENTITY_HMAC_KEY = Buffer.from("a-test-key-of-no-importance").toString("base64");

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    const result = await database.query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}

before(async () => {
  db = new PGlite();
  configureGiftStore(pgliteExecutor(db));
  configureProofSessionStore(pgliteExecutor(db));
  await ensureGiftSchema();
  await ensureProofSessionSchema();
});

after(async () => {
  configureGiftStore(undefined);
  configureProofSessionStore(undefined);
  await db.close();
});

const CONTRACT = "0x995ab09d8b20511d057e9e87d00fa1f41fc0e233" as const;
const RECIPIENT = "0x000000000000000000000000000000000000beef";
const BIND_AT = Math.floor(Date.UTC(2026, 8, 23, 1, 0, 0) / 1_000);
const NEXT_MORNING = Math.floor(Date.UTC(2026, 8, 24, 0, 30, 0) / 1_000);

function reading(total: number, name = "Mona Octocat", bio = ""): GithubReading {
  return {
    user: { login: "octocat", databaseId: "583231", name, bio, createdAt: "2011-01-25T18:44:36Z" },
    contributions: { from: "", to: "", total, days: [{ date: "2026-09-23", count: total }] },
  };
}

type Seen = { spans: { from: string; to: string }[]; relayed: string[]; signed: CheckInMessage[] };

function fakes(answer: (login: string) => Promise<GithubReading>, now: number, over: Partial<GithubCheckInDeps> = {}): { deps: GithubCheckInDeps; seen: Seen } {
  const seen: Seen = { spans: [], relayed: [], signed: [] };
  const deps: GithubCheckInDeps = {
    read: async (login, span) => {
      seen.spans.push(span);
      const got = await answer(login);
      return { ...got, contributions: { ...got.contributions, ...span } };
    },
    onChain: async () => ({ cancelled: false, finalised: false, startDay: 0 }) as unknown as GiftState,
    sign: async (message) => {
      seen.signed.push(message);
      return `0x${"ab".repeat(65)}` as Hex;
    },
    relay: async (sessionId) => {
      seen.relayed.push(sessionId);
      return { hash: `0x${"7a".repeat(32)}` as Hex, creditedDays: 1 };
    },
    now: () => now,
    ...over,
  };
  return { deps, seen };
}

async function aGift(giftId: string, goalUsername?: string) {
  await saveGift({
    giftId,
    funder: "0x000000000000000000000000000000000000A11C",
    contactHash: `0x${"51".repeat(32)}`,
    claimToken: "a-claim-token-of-some-length",
    goalType: 2,
    dailyTarget: 1,
    durationDays: 30,
    amount: 25_000_000n,
    createdTx: `0x${"aa".repeat(32)}`,
    escrow: CONTRACT,
    goalUsername,
  });
  await markClaimed(giftId, RECIPIENT, `0x${"cc".repeat(32)}`);
}

test("the span read starts on the first moment of the day the account was connected, and today when connecting", () => {
  const boundAt = new Date(Date.UTC(2026, 8, 23, 1, 0, 0));
  assert.deepEqual(spanOf({ boundAt }, "count", NEXT_MORNING), { from: "2026-09-23T00:00:00Z", to: "2026-09-24T00:30:00Z" });
  assert.deepEqual(spanOf({ boundAt: null }, "bind", BIND_AT), { from: "2026-09-23T00:00:00Z", to: "2026-09-23T01:00:00Z" });
  assert.notEqual(githubNullifier("7", "count", NEXT_MORNING, 3), githubNullifier("7", "count", NEXT_MORNING + 1, 3), "a nullifier is unique per read");
  assert.ok(profileHasCode({ name: "Mona", bio: "learning, abc-234" }, "ABC234"), "the bio holds the code as well as the name");
  assert.equal(profileHasCode({ name: "Mona", bio: "" }, "ABC234"), false);
});

test("an account the funder named is bound on the first read, with the calendar's total as the baseline, and counted the next morning", async () => {
  await aGift("7", "octocat");
  const { deps, seen } = fakes(async () => reading(3), BIND_AT);
  const bound = await runGithubCheckIn({ giftId: "7", purpose: "bind" }, deps);
  assert.deepEqual(bound, { kind: "bound", giftId: "7", xp: 3, hash: `0x${"7a".repeat(32)}` });
  assert.deepEqual(seen.spans, [{ from: "2026-09-23T00:00:00Z", to: "2026-09-23T01:00:00Z" }]);
  const record = await loadGift("7");
  assert.ok(record?.boundAt, "bound");
  const message = seen.signed[0];
  assert.equal(message.providerId, GITHUB_PROVIDER_ID, "the goal's own provider id, which the contract checks against goal 2");
  assert.equal(message.identityHash, identityPseudonym("github", "583231"), "the identity is GitHub's numeric id, not the login");
  assert.equal(message.metricValue, 3n);
  assert.equal(message.observedAt, BigInt(BIND_AT));
  const sessionId = `${githubSessionPrefix("7", "bind", BIND_AT)}${githubNullifier("7", "bind", BIND_AT, 3).slice(2, 18)}`;
  assert.deepEqual(seen.relayed, [sessionId]);
  const stored = await loadAttestation(sessionId);
  assert.equal(String(stored?.message.providerId), GITHUB_PROVIDER_ID, "what was relayed is what was signed");

  // The next morning: read from the bind day's first moment, so the total can only grow.
  const morning = fakes(async () => reading(5), NEXT_MORNING);
  const counted = await runGithubCheckIn({ giftId: "7", purpose: "count" }, morning.deps);
  assert.deepEqual(counted, { kind: "counted", giftId: "7", xp: 5, creditedDays: 1, hash: `0x${"7a".repeat(32)}` });
  assert.deepEqual(morning.seen.spans, [{ from: "2026-09-23T00:00:00Z", to: "2026-09-24T00:30:00Z" }]);

  // Once relayed, the same day is not read twice unless forced.
  await recordRelayed({ giftId: "7", kind: "check-in", sessionId: morning.seen.relayed[0], txHash: `0x${"7a".repeat(32)}` });
  assert.deepEqual(await runGithubCheckIn({ giftId: "7", purpose: "count" }, morning.deps), { kind: "already", giftId: "7", reason: "counted_today" });
  assert.equal((await runGithubCheckIn({ giftId: "7", purpose: "count", force: true }, morning.deps)).kind, "counted");
  assert.deepEqual(await runGithubCheckIn({ giftId: "7", purpose: "bind" }, morning.deps), { kind: "already", giftId: "7", reason: "already_bound" });
});

test("an account the person named is bound only once the code is in the profile's name or bio", async () => {
  await aGift("8");
  assert.deepEqual(await runGithubCheckIn({ giftId: "8", purpose: "bind" }, fakes(async () => reading(0), BIND_AT).deps), { kind: "already", giftId: "8", reason: "no_account" });
  await setRecipientUsername("8", "octocat", "ABC234", new Date((BIND_AT + 3_600) * 1_000));
  assert.deepEqual(await runGithubCheckIn({ giftId: "8", purpose: "count" }, fakes(async () => reading(0), BIND_AT).deps), { kind: "already", giftId: "8", reason: "not_bound" }, "nothing is counted before the account is bound");
  const without = await runGithubCheckIn({ giftId: "8", purpose: "bind" }, fakes(async () => reading(0, "Mona Octocat", "hello"), BIND_AT).deps);
  assert.equal(without.kind, "refused");
  assert.equal((without as { code: string }).code, "CODE_NOT_IN_NAME");
  assert.equal((await loadGift("8"))?.boundAt, null, "a refused code binds nothing");
  const expired = await runGithubCheckIn({ giftId: "8", purpose: "bind" }, fakes(async () => reading(0, "Mona Octocat", "learning, ABC 234"), BIND_AT + 7_200).deps);
  assert.equal((expired as { code: string }).code, "CODE_EXPIRED", "an hour later the code is no longer worth anything");
  const withIt = await runGithubCheckIn({ giftId: "8", purpose: "bind" }, fakes(async () => reading(0, "Mona Octocat", "learning, ABC 234"), BIND_AT).deps);
  assert.equal(withIt.kind, "bound");
  assert.ok((await loadGift("8"))?.boundAt, "bound by the code in the bio");
  assert.equal((await runGithubCheckIn({ giftId: "8", purpose: "count" }, fakes(async () => reading(1), NEXT_MORNING).deps)).kind, "counted");
});

test("every refusal is typed: GitHub's, ours, and the contract's, in words about a contribution", async () => {
  await aGift("9", "octocat");
  const refused = async (deps: GithubCheckInDeps) => (await runGithubCheckIn({ giftId: "9", purpose: "bind" }, deps)) as { kind: string; code?: string; message?: string; xp?: number };
  const noSuch = await refused(fakes(async () => { throw new GithubReadError("NO_SUCH_USER", "gone"); }, BIND_AT).deps);
  assert.deepEqual([noSuch.kind, noSuch.code], ["refused", "NO_SUCH_USER"]);
  const off = await refused(fakes(async () => { throw new GithubReadError("NOT_CONFIGURED", "no token"); }, BIND_AT).deps);
  assert.deepEqual([off.kind, off.code, off.message], ["refused", "NOT_CONFIGURED", "Counting is not switched on yet."]);
  const reverted = await refused(fakes(async () => reading(2), BIND_AT, { relay: async () => { throw new RelayerError("REVERTED", "reverted", "InsufficientProgress"); } }).deps);
  assert.deepEqual([reverted.kind, reverted.code, reverted.xp], ["refused", "NOT_ENOUGH_PROGRESS", 2]);
  assert.match(String(reverted.message), /contribution/, "the contract's refusal is said in this condition's words, not the lesson's");
  const backwards = await refused(fakes(async () => reading(2), BIND_AT, { relay: async () => { throw new RelayerError("REVERTED", "reverted", "MetricDecreased"); } }).deps);
  assert.equal(backwards.code, "PROGRESS_WENT_BACKWARDS");
  assert.match(String(backwards.message), /GitHub/);
  assert.equal((await loadGift("9"))?.boundAt, null, "nothing was bound on a refusal");
});
