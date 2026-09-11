import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  claimTokenHash,
  configureGiftStore,
  ensureGiftSchema,
  loadBoundGifts,
  loadGift,
  loadGiftForClaim,
  loadGiftsOf,
  loadRelayed,
  markBound,
  markClaimed,
  newClaimToken,
  recordRelayed,
  relayedForSession,
  saveGift,
  setRecipientUsername,
} from "../src/gift-store";
import type { SqlExecutor } from "../src/proof-session-store";

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
  await ensureGiftSchema();
});

after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

const FUNDER = "0x000000000000000000000000000000000000A11C";
const RECIPIENT = "0x000000000000000000000000000000000000B0B0";
const CONTACT = `0x${"51".repeat(32)}` as const;
const TX = `0x${"aa".repeat(32)}` as const;

test("a claim token is random and only its hash is stored", async () => {
  const token = newClaimToken();
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(token, newClaimToken());
  await saveGift({
    giftId: "1",
    funder: FUNDER,
    contactHash: CONTACT,
    claimToken: token,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 7_000_000n,
    createdTx: TX,
  });
  const rows = await db.query<{ claim_token_hash: string }>("SELECT claim_token_hash FROM viky_gifts WHERE gift_id = '1'");
  assert.equal(rows.rows[0].claim_token_hash, claimTokenHash(token));
  assert.notEqual(rows.rows[0].claim_token_hash, token);

  const gift = await loadGift("1");
  assert.equal(gift?.amount, 7_000_000n);
  assert.equal(gift?.funder, FUNDER.toLowerCase());
  assert.equal(gift?.recipient, null);
  assert.deepEqual(await loadGiftForClaim("1", "wrong-token"), null);
  assert.equal((await loadGiftForClaim("1", token))?.giftId, "1");

  assert.equal(await markClaimed("1", RECIPIENT, `0x${"bb".repeat(32)}`), true);
  assert.equal(await markClaimed("1", FUNDER, `0x${"cc".repeat(32)}`), false, "a second claimant finds the row taken");
  assert.equal(await loadGiftForClaim("1", token), null, "the link is spent");
  assert.equal((await loadGift("1"))?.recipient, RECIPIENT.toLowerCase());
});

test("gifts are listed for their funder and their recipient", async () => {
  assert.equal((await loadGiftsOf(FUNDER)).length, 1);
  assert.equal((await loadGiftsOf(RECIPIENT)).length, 1);
  assert.equal((await loadGiftsOf("0x0000000000000000000000000000000000000001")).length, 0);
});

test("relayed transactions are recorded per gift and per session", async () => {
  await recordRelayed({ giftId: "1", kind: "claim", txHash: `0x${"bb".repeat(32)}`, blockNumber: 100n });
  await recordRelayed({ giftId: "1", kind: "check-in", sessionId: "s1", txHash: `0x${"dd".repeat(32)}` });
  const relayed = await loadRelayed("1");
  assert.deepEqual(
    relayed.map((entry) => [entry.kind, entry.sessionId, entry.blockNumber]),
    [
      ["claim", null, 100n],
      ["check-in", "s1", null],
    ],
  );
  assert.equal(await relayedForSession("s1"), `0x${"dd".repeat(32)}`);
  assert.equal(await relayedForSession("s2"), null);
});

test("the public mode binding: funder-named account needs no code, recipient-named account needs one, bound once", async () => {
  const funderNamed = "9001";
  await saveGift({ giftId: funderNamed, funder: "0xAbC0000000000000000000000000000000000001", contactHash: "0x11", claimToken: newClaimToken(), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 20_000_000n, createdTx: "0x01", goalUsername: "ama_learns" });
  const a = await loadGift(funderNamed);
  assert.equal(a?.goalUsername, "ama_learns");
  assert.equal(a?.usernameSource, "funder");
  assert.equal(a?.bindingCode, null);
  assert.equal(a?.boundAt, null);

  const recipientNamed = "9002";
  await saveGift({ giftId: recipientNamed, funder: "0xAbC0000000000000000000000000000000000001", contactHash: "0x12", claimToken: newClaimToken(), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 20_000_000n, createdTx: "0x02" });
  const expires = new Date(Date.now() + 60_000);
  assert.equal(await setRecipientUsername(recipientNamed, "luis", "VK7K3Q", expires), true);
  const b = await loadGift(recipientNamed);
  assert.equal(b?.goalUsername, "luis");
  assert.equal(b?.usernameSource, "recipient");
  assert.equal(b?.bindingCode, "VK7K3Q");
  assert.ok(b?.bindingCodeExpiresAt instanceof Date);

  // Only opened (claimed) and bound gifts are read by the keeper.
  assert.equal(await markClaimed(recipientNamed, "0xdef0000000000000000000000000000000000002", "0x03"), true);
  assert.deepEqual((await loadBoundGifts()).map((g) => g.giftId).filter((id) => id === recipientNamed), []);
  assert.equal(await markBound(recipientNamed, "14"), true);
  const c = await loadGift(recipientNamed);
  assert.equal(c?.goalProfileId, "14");
  assert.equal(c?.bindingCode, null, "the code is cleared once proved");
  assert.ok(c?.boundAt instanceof Date);
  assert.deepEqual((await loadBoundGifts()).map((g) => g.giftId).filter((id) => id === recipientNamed), [recipientNamed]);
  // Binding is one-way: a second bind or a new code is refused.
  assert.equal(await markBound(recipientNamed, "15"), false);
  assert.equal(await setRecipientUsername(recipientNamed, "other", "ABCDEF", expires), false);
});
