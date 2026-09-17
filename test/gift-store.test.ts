import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getAddress } from "viem";
import {
  claimTokenHash,
  configureGiftStore,
  holdsGiftLink,
  ensureGiftSchema,
  backfillEscrow,
  loadAllGifts,
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
import { escrowAddress, escrowOf } from "../src/relayer";
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
    escrow: "0x00000000000000000000000000000000000000e1",
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
  await saveGift({ giftId: funderNamed, funder: "0xAbC0000000000000000000000000000000000001", contactHash: "0x11", claimToken: newClaimToken(), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 20_000_000n, createdTx: "0x01", escrow: "0x00000000000000000000000000000000000000e1", goalUsername: "ama_learns" });
  const a = await loadGift(funderNamed);
  assert.equal(a?.goalUsername, "ama_learns");
  assert.equal(a?.usernameSource, "funder");
  assert.equal(a?.bindingCode, null);
  assert.equal(a?.boundAt, null);

  const recipientNamed = "9002";
  await saveGift({ giftId: recipientNamed, funder: "0xAbC0000000000000000000000000000000000001", contactHash: "0x12", claimToken: newClaimToken(), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 20_000_000n, createdTx: "0x02", escrow: "0x00000000000000000000000000000000000000e1" });
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

test("each gift keeps the contract that holds it, across a redeployment", async () => {
  const OLD = "0x00000000000000000000000000000000000000E1";
  const NEW = "0x00000000000000000000000000000000000000F2";
  const previous = process.env.GIFT_ESCROW_ADDRESS;

  assert.equal((await loadGift("1"))?.escrow, OLD.toLowerCase());

  // A gift saved before the column existed is stamped once, explicitly, and never overwritten after.
  await db.query("UPDATE viky_gifts SET escrow = NULL WHERE gift_id = '1'");
  assert.equal(await backfillEscrow(OLD), 1);
  assert.equal((await loadGift("1"))?.escrow, OLD.toLowerCase());
  assert.equal(await backfillEscrow(NEW), 0, "a recorded contract is never overwritten");

  // The contract is redeployed: later gifts go to the new one, gift 1 still resolves to the old one.
  process.env.GIFT_ESCROW_ADDRESS = NEW;
  assert.equal(escrowAddress(), getAddress(NEW));
  assert.equal(escrowOf(await loadGift("1")), getAddress(OLD));

  // A record with no contract is refused, never served by the configured one.
  assert.throws(() => escrowOf({ escrow: null }), /not served by this deployment/);
  assert.throws(() => escrowOf(null), /not served by this deployment/);

  const all = await loadAllGifts();
  assert.ok(all.length >= 1 && all.every((gift) => gift.escrow !== null));

  if (previous === undefined) delete process.env.GIFT_ESCROW_ADDRESS;
  else process.env.GIFT_ESCROW_ADDRESS = previous;
});

test("a gift id that is already recorded fails loudly unless it is the same funding transaction", async () => {
  const base = {
    funder: "0xAbC0000000000000000000000000000000000001",
    contactHash: "0x21" as const,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 20_000_000n,
    escrow: "0x00000000000000000000000000000000000000e1" as const,
  };
  await saveGift({ ...base, giftId: "9300", claimToken: newClaimToken(), createdTx: "0xaa" });

  // The same funding transaction is a retry of one gift and changes nothing.
  await saveGift({ ...base, giftId: "9300", claimToken: newClaimToken(), createdTx: "0xAA" });
  assert.equal((await loadGift("9300"))?.createdTx, "0xaa");

  // A different one means two contracts minted the same id: refuse rather than drop a funded gift.
  await assert.rejects(
    saveGift({ ...base, giftId: "9300", claimToken: newClaimToken(), createdTx: "0xbb" }),
    /already recorded with a different funding transaction/,
  );
});


/**
 * The two names of a gift (17 Sep 2026) live beside the link and nowhere on chain, and they are given only to whoever
 * holds the link, or to the funder or the recipient: gift numbers follow each other, so a public read would let anyone
 * collect first names gift after gift.
 */
test("a gift keeps its two names beside the link, and only the link's key proves holding it", async () => {
  const token = newClaimToken();
  await saveGift({
    giftId: "77",
    funder: FUNDER,
    contactHash: CONTACT,
    claimToken: token,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 25_000_000n,
    createdTx: `0x${"77".repeat(32)}`,
    escrow: "0x00000000000000000000000000000000000000e1",
    recipientName: "Léa",
    funderName: "Maman",
  });
  const gift = await loadGift("77");
  assert.equal(gift?.recipientName, "Léa");
  assert.equal(gift?.funderName, "Maman");
  assert.ok(gift && holdsGiftLink(gift, token));
  assert.ok(gift && !holdsGiftLink(gift, `${token}x`));
  assert.ok(gift && !holdsGiftLink(gift, null));
  assert.ok(gift && !holdsGiftLink(gift, ""));
  // A gift made before the names existed has none, and says so rather than inventing one.
  assert.equal((await loadGift("1"))?.recipientName, null);

  const route = readFileSync("app/api/gift/[id]/route.ts", "utf8");
  assert.match(route, /const names = viewerIsRecipient \|\| viewerIsFunder \|\| holdsTheLink \? \{ recipientName: record\.recipientName, funderName: record\.funderName \} : null;/);
  assert.match(route, /holdsGiftLink\(record, new URL\(request\.url\)\.searchParams\.get\("t"\)\)/);
});
