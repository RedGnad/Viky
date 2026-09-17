import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { configureGiftStore, ensureGiftSchema, markClaimed, newClaimToken, recordSettledDays, saveGift } from "../src/gift-store";
import { configureMilestoneStore, ensureMilestoneSchema } from "../src/milestone-store";
import { configureProofSessionStore, ensureProofSessionSchema } from "../src/proof-session-store";
import { configureProofJournal, dailyJournal, exampleForJudges, proofOfDay } from "../src/proof-journal";
import type { SqlExecutor } from "../src/proof-session-store";
import { GET as journalGet } from "../app/api/gift/[id]/journal/route";
import { GET as proofGet } from "../app/api/gift/[id]/proof/route";

/**
 * The public journal says what settled and against which claim; the proof itself goes to the two people the gift is
 * between, and to nobody else. These tests hold both halves, because getting the second one wrong would publish a
 * person's username, display name and XP, which Privacy promises never happens.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;

const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECIPIENT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const STRANGER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

const TX = `0x${"aa".repeat(32)}` as const;
const FINGERPRINT = `0x${"cd".repeat(32)}`;
const SESSION = "public:7:count:20345:cdcdcdcdcdcdcdcd";

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    const result = await database.query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}

async function cookieFor(account: typeof FUNDER): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

const ask = (path: string, cookie?: string) => new Request(`${ORIGIN}${path}`, { headers: { origin: ORIGIN, host: "viky.test", ...(cookie ? { cookie } : {}) } });
const forGift = (id: string) => ({ params: Promise.resolve({ id }) });

before(async () => {
  db = new PGlite();
  const executor = pgliteExecutor(db);
  configureGiftStore(executor);
  configureProofSessionStore(executor);
  configureMilestoneStore(executor);
  configureProofJournal(executor);
  await ensureGiftSchema();
  await ensureProofSessionSchema();
  await ensureMilestoneSchema();

  await saveGift({
    giftId: "7",
    funder: FUNDER.address,
    contactHash: `0x${"51".repeat(32)}`,
    claimToken: newClaimToken(),
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 7_000_000n,
    createdTx: TX,
    escrow: "0x00000000000000000000000000000000000000e1",
    goalUsername: "ama_learns",
  });
  await markClaimed("7", RECIPIENT.address, TX);

  // A session that read Duolingo, with its attestation and the proof it kept, exactly as a check-in writes it.
  await db.query(
    `INSERT INTO viky_proof_sessions (session_id, account, gift_id, phase, duolingo_username, duolingo_profile_id, consumed_at, attestation, proofs)
     VALUES ($1, $2, '7', 'check-in', 'ama_learns', '123', now(), $3::jsonb, $4::jsonb)`,
    [SESSION, RECIPIENT.address.toLowerCase(), JSON.stringify({ message: { nullifier: FINGERPRINT }, signature: "0x00" }), JSON.stringify({ claimData: { identifier: "0xabc" } })],
  );
  await recordSettledDays("7", [{ day: 20345, outcome: "earned" }], TX, SESSION);
  await recordSettledDays("7", [{ day: 20346, outcome: "returned" }], TX);
});

after(async () => {
  configureGiftStore(undefined);
  configureProofSessionStore(undefined);
  configureMilestoneStore(undefined);
  configureProofJournal(undefined);
  await db.close();
});

test("the journal publishes what settled and the fingerprint of the claim that earned it, and nothing else", async () => {
  const days = await dailyJournal("7");
  assert.deepEqual(
    days.map((day) => [day.day, day.outcome, day.fingerprint, day.proofKept]),
    [
      [20345, "earned", FINGERPRINT, true],
      // A day that went back was settled by a drain, which read nothing: it has no claim and says so.
      [20346, "returned", null, false],
    ],
  );
  const answer = await journalGet(ask("/api/gift/7/journal"), forGift("7"));
  assert.equal(answer.status, 200);
  const body = (await answer.json()) as { days: Array<Record<string, unknown>> };
  assert.equal(body.days.length, 2);
  // The public answer carries no proof, no username and no reading.
  assert.doesNotMatch(JSON.stringify(body), /ama_learns|claimData|proofs/);
});

test("the proof of a day goes to the funder and to the recipient, and to nobody else", async () => {
  const kept = await proofOfDay("7", 20345);
  assert.equal(kept?.fingerprint, FINGERPRINT);
  assert.deepEqual(kept?.proof, { claimData: { identifier: "0xabc" } });
  assert.equal(await proofOfDay("7", 20346), null, "a day that went back has no proof to give");

  for (const account of [FUNDER, RECIPIENT]) {
    const answer = await proofGet(ask("/api/gift/7/proof?day=20345", await cookieFor(account)), forGift("7"));
    assert.equal(answer.status, 200, `${account.address} is in this gift`);
    const body = (await answer.json()) as { fingerprint: string };
    assert.equal(body.fingerprint, FINGERPRINT);
  }

  const outsider = await proofGet(ask("/api/gift/7/proof?day=20345", await cookieFor(STRANGER)), forGift("7"));
  assert.equal(outsider.status, 403);
  assert.equal(((await outsider.json()) as { code?: string }).code, "NOT_IN_THIS_GIFT");

  // Somebody holding the link, but signed in to nothing, is refused as well: a link opens the gift, not the person.
  const anonymous = await proofGet(ask("/api/gift/7/proof?day=20345"), forGift("7"));
  assert.ok(anonymous.status === 401 || anonymous.status === 403, `a request with no account was answered ${anonymous.status}`);
  assert.doesNotMatch(await anonymous.clone().text(), /ama_learns|claimData/);
});

test("the example a judge may replay is only ever one of Viky's own gifts", async () => {
  const example = await exampleForJudges([RECIPIENT.address]);
  assert.equal(example?.giftId, "7");
  assert.equal(example?.day, 20345);
  assert.equal(example?.fingerprint, FINGERPRINT);
  // Asked for anybody else's account, it finds nothing rather than falling back to whatever exists.
  assert.equal(await exampleForJudges([STRANGER.address]), null);
  assert.equal(await exampleForJudges([]), null);
});
