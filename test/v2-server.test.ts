// The second version of the gift contracts on the server and in the browser (the audit of 1 Oct 2026). What these pin:
// it is off until its addresses are set, the two versions never mix, the server is never given what opens a gift, and
// an ending signs the two amounts the contract itself would move. The chain is not reached here: the whole path is
// walked against a fork of mainnet by scripts/rehearse-v2-fork.ts.

process.env.SESSION_SIGNING_SECRET = "test-account-session-secret-that-is-longer-than-32-bytes";
delete process.env.DATABASE_URL;
delete process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS;
delete process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS;
delete process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS;
process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233";
process.env.GIFT_ESCROW_ADDRESS = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233";
process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS = "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e";
process.env.MILESTONE_GIFT_ADDRESS = "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POST as endRoute } from "../app/api/gift/[id]/end/route";
import { POST as claimRoute } from "../app/api/gift/claim/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import type { ContractAuthorization } from "../src/ausd-authorization";
import { prepareGift } from "../src/client/gift";
import { linkSecretOf, versionOf } from "../src/client/v2";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { DAILY_GOALS } from "../src/daily-goals";
import { GiftApiError } from "../src/gift-api";
import { makeGift, type CreationDeps } from "../src/gift-creation";
import { dailyEnded, dailyEndOffer, milestoneEnded, milestoneEndOffer } from "../src/gift-ending";
import type { GiftState } from "../src/gift-reader";
import { relayClaim, relayCreateGift } from "../src/gift-relay";
import { abandonCreation, beginCreation, completeCreation, configureGiftStore, ensureGiftSchema, holdsGiftLink, loadGift, loadPendingCreations, markCreationSubmitted, restartCreation, saveGift } from "../src/gift-store";
import { fundingNonce, type GiftParams } from "../src/gift-terms";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { canExpire, closesAfterPause, milestonePhase, readingTakenBy, type MilestoneState } from "../src/milestone-reader";
import { MILESTONE_DORMANT_SECONDS, MILESTONE_PROOF_GRACE_SECONDS } from "../src/milestone-protocol";
import { relayCreateMilestone } from "../src/milestone-relay";
import type { SqlExecutor } from "../src/proof-session-store";
import { RelayerError } from "../src/relayer";
import { assertSecondVersionWhole, dailyAbiOf, dailyVersionOf, giftEscrowV2Address, milestoneGiftV2Address, milestoneVersionOf, SECOND_VERSION_SETTINGS, SecondVersionHalfSet, secondVersionProblem } from "../src/v2";
import { isVikyContract, secondVersionContracts } from "../src/viky-contracts";
import { holdsTheLinkOf, isTheOpeningSecret, openingOf, versionOfGift } from "../src/v2-opening";
import { fundingNonceV2, giftLink, linkFingerprint, openingAccount, openingSecretOf, openTypedData, previewTokenOf } from "../src/v2-protocol";
import { answeredLink, requestedLink } from "../src/v2-request";

const ORIGIN = "https://viky.test";
const V1 = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233" as Hex;
const V2 = "0x00000000000000000000000000000000000000D2" as Hex;
const V2_MILESTONE = "0x00000000000000000000000000000000000000d3" as Hex;
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECIPIENT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const AUTH: ContractAuthorization = { validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"00".repeat(32)}`, v: 27, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}` };

/** Runs something with the second version set, and unsets it afterwards whatever happened. */
async function withTheSecondVersion<T>(run: () => Promise<T> | T): Promise<T> {
  process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS = V2;
  process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS = V2_MILESTONE;
  try {
    return await run();
  } finally {
    delete process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS;
    delete process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS;
  }
}

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
beforeEach(async () => {
  await db.query("DELETE FROM viky_gifts");
  await db.query("DELETE FROM viky_creations");
});
after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

async function cookieFor(account: typeof FUNDER): Promise<string> {
  const environment = { SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET };
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature: await account.signMessage({ message: challenge.message }), origin: ORIGIN, environment });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function post(path: string, body: unknown, cookie: string): Request {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", cookie }, body: JSON.stringify(body) });
}

// --- off until its addresses are set ---------------------------------------------------------------------------------

test("with no address set there is no second version: every contract is the first, and nothing is made on a second", async () => {
  assert.equal(giftEscrowV2Address(), null);
  assert.equal(milestoneGiftV2Address(), null);
  for (const contract of [V1, V2, V2_MILESTONE, null, undefined, ""]) {
    assert.equal(dailyVersionOf(contract), 1);
    assert.equal(milestoneVersionOf(contract), 1);
  }
  assert.equal(versionOf("7", V2), 1);
  assert.equal(versionOf("1000007", V2_MILESTONE), 1);
  // What the funder's browser signs is exactly what it signed before the second version was written.
  const request = await prepareGift({ account: FUNDER, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n });
  assert.equal(request.openingKey, undefined);
  assert.equal(request.linkFingerprint, undefined);
  const params: GiftParams = { funder: FUNDER.address, refundTo: FUNDER.address, recipientContactHash: NO_CONTACT_HASH, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: request.salt };
  assert.equal(request.authorization.nonce, fundingNonce(params));
  // A request that carries a link is refused while the second version is not set, and one without is the ordinary one.
  assert.equal(requestedLink({}, "daily"), null);
  assert.equal(requestedLink({}, "milestone"), null);
  assert.throws(() => requestedLink({ openingKey: FUNDER.address, linkFingerprint: "ab".repeat(32) }, "daily"), (error: unknown) => error instanceof GiftApiError && error.code === "NOT_CONFIGURED" && error.status === 503);
  await assert.rejects(relayCreateGift(params, AUTH, undefined, FUNDER.address), (error: unknown) => error instanceof RelayerError && error.code === "NOT_CONFIGURED");
});

test("an address that is set is the second version, and no other address is", async () => {
  await withTheSecondVersion(() => {
    assert.equal(giftEscrowV2Address(), V2);
    assert.equal(dailyVersionOf(V2.toLowerCase()), 2);
    assert.equal(dailyVersionOf(V1), 1, "the contract in service keeps serving its gifts as the first version");
    assert.equal(milestoneVersionOf(V2_MILESTONE), 2);
    assert.equal(milestoneVersionOf(V2), 1, "each contract has its own address");
    assert.equal(versionOf("7", V2), 2);
    assert.equal(versionOf("1000007", V2), 1);
    const speaks = (contract: Hex, name: string) => dailyAbiOf(contract).some((entry) => "name" in entry && entry.name === name);
    assert.ok(speaks(V2, "endGiftWithIntent"));
    assert.ok(!speaks(V1, "endGiftWithIntent"));
  });
  // A malformed value is no address: the second version stays off rather than half on.
  process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS = "0x1234";
  assert.equal(giftEscrowV2Address(), null);
  delete process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS;
});

test("the two versions never mix: each creation goes to its own contract or is refused", async () => {
  const params: GiftParams = { funder: FUNDER.address, refundTo: FUNDER.address, recipientContactHash: NO_CONTACT_HASH, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: `0x${"01".repeat(32)}` };
  await withTheSecondVersion(async () => {
    // Terms without an opening key, once the second version is set: a page loaded before. Refused before the chain.
    await assert.rejects(relayCreateGift(params, AUTH), (error: unknown) => error instanceof RelayerError && /earlier version/.test(error.message));
    await assert.rejects(
      relayCreateMilestone({ funder: FUNDER.address, refundTo: FUNDER.address, recipientContactHash: NO_CONTACT_HASH, goalType: 1, shape: 0, target: 1500n, maximumStart: 1300n, subject: `0x${"00".repeat(32)}`, durationDays: 30, amount: 5_000_000n, salt: params.salt }, AUTH),
      (error: unknown) => error instanceof RelayerError && /earlier version/.test(error.message),
    );
    assert.throws(() => requestedLink({}, "daily"), (error: unknown) => error instanceof GiftApiError && error.code === "OUT_OF_DATE" && error.status === 409);
    // The evidence signer's attestation opens nothing on the second version, whoever asks for it.
    await assert.rejects(relayClaim({ giftId: "7", escrow: V2, recipient: RECIPIENT.address, contactHash: NO_CONTACT_HASH }), (error: unknown) => error instanceof RelayerError && /key of its link/.test(error.message));
  });
});

// --- the link is the funder's browser's, and the server is never given it ------------------------------------------------

test("once the second version is set, the funder's browser makes the link and sends its key's address and its fingerprint", async () => {
  await withTheSecondVersion(async () => {
    const request = await prepareGift({ account: FUNDER, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n });
    const secret = await linkSecretOf(FUNDER, request.salt);
    assert.equal(request.openingKey, openingAccount(secret).address);
    // The fingerprint is of the preview token, which is what the link sends in `?t=`: never of the secret itself.
    assert.equal(request.linkFingerprint, linkFingerprint(previewTokenOf(secret)));
    assert.notEqual(request.linkFingerprint, linkFingerprint(secret));
    // Nothing in the request is the secret, or carries it.
    assert.ok(!JSON.stringify(request).includes(secret));
    // The one signature pays for these terms, opening key included, on the second version's contract.
    assert.equal(request.authorization.nonce, fundingNonceV2({ funder: FUNDER.address, refundTo: FUNDER.address, openingKey: request.openingKey as Hex, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: request.salt }));
    const link = requestedLink(request, "daily");
    assert.deepEqual(link, { openingKey: request.openingKey, fingerprint: request.linkFingerprint });
    // The same account finds the same link again; another account makes another.
    assert.equal(await linkSecretOf(FUNDER, request.salt), secret);
    assert.notEqual(await linkSecretOf(RECIPIENT, request.salt), secret);
  });
});

test("a request's link is an address and a fingerprint, or the page is out of date", async () => {
  await withTheSecondVersion(() => {
    const good = { openingKey: FUNDER.address, linkFingerprint: "ab".repeat(32) };
    assert.deepEqual(requestedLink(good, "milestone"), { openingKey: FUNDER.address, fingerprint: good.linkFingerprint });
    for (const bad of [
      { openingKey: FUNDER.address },
      { linkFingerprint: good.linkFingerprint },
      { openingKey: "0x1234", linkFingerprint: good.linkFingerprint },
      { openingKey: `0x${"0".repeat(40)}`, linkFingerprint: good.linkFingerprint },
      { openingKey: FUNDER.address, linkFingerprint: "AbCdEfGhIjKlMnOpQrStUvWxYz012345" },
      { openingKey: FUNDER.address, linkFingerprint: `0x${"ab".repeat(32)}` },
    ]) {
      assert.throws(() => requestedLink(bad, "daily"), (error: unknown) => error instanceof GiftApiError && error.code === "OUT_OF_DATE", JSON.stringify(bad));
    }
  });
  assert.equal(answeredLink(ORIGIN, "7", "the-key-of-the-first-version"), `${ORIGIN}/g/7?t=the-key-of-the-first-version`);
  assert.equal(answeredLink(ORIGIN, "7", ""), null, "the server answers no link it never held");
});

test("a creation with the browser's link keeps its fingerprint, relays its opening key, and answers no key", async () => {
  const relayed: Array<Hex | undefined> = [];
  const deps: CreationDeps = {
    begin: beginCreation,
    restart: restartCreation,
    submitted: markCreationSubmitted,
    relay: async (_params, _authorization, onSubmitted, openingKey) => {
      relayed.push(openingKey);
      const hash = `0x${"cd".repeat(32)}` as Hex;
      await onSubmitted(hash);
      return { giftId: "41", hash, escrow: V2 };
    },
    readBack: async () => ({ kind: "unknown" }),
    spent: async () => false,
    save: saveGift,
    complete: completeCreation,
    abandon: abandonCreation,
    loadPending: loadPendingCreations,
    now: () => Date.now(),
  };
  const secret = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const openingKey = openingAccount(secret).address;
  const nonce = `0x${"77".repeat(32)}` as Hex;
  const made = await makeGift(
    {
      params: { funder: FUNDER.address, refundTo: FUNDER.address, recipientContactHash: NO_CONTACT_HASH, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: `0x${"01".repeat(32)}` },
      nonce,
      authorization: { ...AUTH, nonce },
      link: { openingKey, fingerprint: linkFingerprint(previewTokenOf(secret)) },
    },
    deps,
  );
  assert.equal(made.claimToken, "", "no key was made on the server");
  assert.deepEqual(relayed, [openingKey]);
  const record = await loadGift("41");
  assert.equal(record?.claimTokenHash, linkFingerprint(previewTokenOf(secret)));
  assert.equal(holdsGiftLink(record!, previewTokenOf(secret)), true, "whoever holds the link is still told apart from whoever does not");
  assert.equal(holdsGiftLink(record!, "AbCdEfGhIjKlMnOpQrStUvWxYz012346"), false);
  // The fingerprint opens nothing: the key is made from the secret alone.
  assert.notEqual(openingAccount(linkFingerprint(previewTokenOf(secret))).address, openingKey);
});

/**
 * The review of 2 Oct 2026, R-01. The link was `/g/<id>?t=<secret>`: the server was sent the secret at every visit,
 * a messaging app's robot fetched it, and the key that opens the gift is made from that secret alone. Whoever ran the
 * server, or read what it was sent, and held the evidence key could open a gift nobody had opened yet.
 */
test("the link's secret is after its #: what the server is sent names the reader as holding the link, and opens nothing", async () => {
  const secret = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const link = new URL(giftLink(ORIGIN, "41", secret));
  // What a browser sends: the path and the query. What follows the `#` goes to no server.
  const sent = `${link.pathname}${link.search}`;
  assert.equal(link.hash, `#${secret}`);
  assert.ok(!sent.includes(secret), "the secret is in nothing the server is sent");
  const token = String(link.searchParams.get("t"));
  assert.equal(token, previewTokenOf(secret));
  assert.equal(token, "IUOs-GN-QhXIXYM_n1HKcieBUkRAqMIq", "pinned: the same token in every browser, for the same secret");
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  // The reviewer's theft, with everything the server is sent: the key it makes is not the gift's.
  const openingKey = openingAccount(secret).address;
  assert.notEqual(openingAccount(token).address, openingKey, "the preview token makes another key");
  assert.notEqual(openingAccount(linkFingerprint(token)).address, openingKey);
  assert.notEqual(previewTokenOf(token), token);
  // And the secret is read back from the address in the browser alone.
  assert.equal(openingSecretOf(link.hash), secret);
  assert.equal(openingSecretOf(""), null);
  assert.equal(openingSecretOf("#short"), null);
  assert.equal(openingSecretOf("#with a space in it, and more"), null);
  assert.throws(() => previewTokenOf("short"));

  // The server keeps the fingerprint of the token, and tells a holder of the link by it, as it always did.
  await saveGift({ giftId: "41", funder: FUNDER.address, contactHash: NO_CONTACT_HASH, claimTokenHash: linkFingerprint(token), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, createdTx: `0x${"a2".repeat(32)}`, escrow: V2 });
  const record = (await loadGift("41"))!;
  assert.equal(holdsTheLinkOf(record, token), true);
  assert.equal(holdsTheLinkOf(record, null), false);
  assert.equal(holdsTheLinkOf(record, "AbCdEfGhIjKlMnOpQrStUvWxYz012346"), false);
  // The secret itself, sent where the token belongs, is refused and never taken for the link.
  assert.equal(isTheOpeningSecret(record, secret), true);
  assert.equal(isTheOpeningSecret(record, token), false);
  assert.throws(() => holdsTheLinkOf(record, secret), (error: unknown) => error instanceof GiftApiError && error.code === "LINK_OUT_OF_DATE" && error.status === 400 && !error.message.includes(secret));
  // A gift of the first version keeps the fingerprint of its key, which is what its link carries: nothing is refused.
  await saveGift({ giftId: "3", funder: FUNDER.address, contactHash: NO_CONTACT_HASH, claimToken: "first-version-key-0123456789", goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, createdTx: `0x${"a1".repeat(32)}`, escrow: V1 });
  const first = (await loadGift("3"))!;
  assert.equal(isTheOpeningSecret(first, "first-version-key-0123456789"), false);
  assert.equal(holdsTheLinkOf(first, "first-version-key-0123456789"), true);

  // Every place the server reads a reader's `?t=` goes through that refusal, and the page opens with the `#` alone.
  assert.match(readFileSync("src/gift-status.ts", "utf8"), /const holdsTheLink = holdsTheLinkOf\(record, reader\.linkKey\);/);
  assert.match(readFileSync("src/milestone-routes.ts", "utf8"), /const holdsTheLink = holdsTheLinkOf\(record, reader\.linkKey\);/);
  assert.match(readFileSync("src/gift-preview.ts", "utf8"), /const holds = !isTheOpeningSecret\(record, linkKey\) && holdsGiftLink\(record, linkKey\);/);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /useSyncExternalStore\(onHashChange, \(\) => openingSecretOf\(window\.location\.hash\), \(\) => null\)/);
  assert.match(page, /const linkOpened = opensByItsLink\(status\.version\);\n\s*const openingKey = linkOpened \? openingSecret : linkKey;/);
  // No request the browser's code makes carries the secret: it is given to the key that signs, and to nothing else.
  const client = readFileSync("src/client/v2.ts", "utf8");
  assert.match(client, /openingAccount\(input\.linkSecret\)\.signTypedData\(/);
  assert.match(client, /return postJson\("\/api\/gift\/claim", \{ giftId: input\.giftId, opening: \{ deadline: deadline\.toString\(\), signature \} \}\);/);
});

// --- the opening -----------------------------------------------------------------------------------------------------

test("an opening is a deadline and a signature made for now, or the link is not valid", async () => {
  const now = 1_800_000_000;
  const signature = `0x${"11".repeat(65)}`;
  assert.deepEqual(openingOf({ deadline: String(now + 600), signature }, now), { deadline: BigInt(now + 600), signature });
  for (const bad of [undefined, {}, { deadline: "soon", signature }, { deadline: String(now + 600), signature: "0x1234" }, { deadline: String(now + 600) }]) {
    assert.throws(() => openingOf(bad, now), (error: unknown) => error instanceof GiftApiError && error.code === "CLAIM_LINK_INVALID" && error.status === 404, JSON.stringify(bad));
  }
  assert.throws(() => openingOf({ deadline: String(now - 1), signature }, now), (error: unknown) => error instanceof GiftApiError && error.code === "EXPIRED");
  assert.throws(() => openingOf({ deadline: String(now + 86_400), signature }, now), (error: unknown) => error instanceof GiftApiError && error.code === "EXPIRED");
});

test("what the link's key signs names the account, and anybody checks it against the key's address", async () => {
  const secret = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const typed = openTypedData("daily", V2, { giftId: 7n, recipient: RECIPIENT.address, deadline: 1_800_000_600n });
  const signature = await openingAccount(secret).signTypedData(typed);
  assert.equal(await recoverTypedDataAddress({ ...typed, signature }), openingAccount(secret).address);
  // The evidence signer's key is another key: what it signs recovers to another address, which the contract refuses.
  const evidence = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  assert.notEqual(await recoverTypedDataAddress({ ...typed, signature: await evidence.signTypedData(typed) }), openingAccount(secret).address);
});

test("the claim route keeps the two versions apart: a first version gift takes no opening, a second takes nothing else", async () => {
  await saveGift({ giftId: "3", funder: FUNDER.address, contactHash: NO_CONTACT_HASH, claimToken: "first-version-key-0123456789", goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, createdTx: `0x${"a1".repeat(32)}`, escrow: V1 });
  await saveGift({ giftId: "41", funder: FUNDER.address, contactHash: NO_CONTACT_HASH, claimTokenHash: linkFingerprint(previewTokenOf("second-version-secret-0123456789")), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, createdTx: `0x${"a2".repeat(32)}`, escrow: V2 });
  const cookie = await cookieFor(RECIPIENT);
  const opening = { deadline: String(Math.floor(Date.now() / 1_000) + 600), signature: `0x${"11".repeat(65)}` };
  await withTheSecondVersion(async () => {
    assert.equal(versionOfGift((await loadGift("3"))!), 1);
    assert.equal(versionOfGift((await loadGift("41"))!), 2);
    // An opening sent for a gift of the first version is no way in.
    let answer = await claimRoute(post("/api/gift/claim", { giftId: "3", opening }, cookie));
    assert.equal(answer.status, 404);
    // The link's own secret sent for a gift of the second version, by a page loaded before: asked to load again, and
    // nothing is relayed for it.
    answer = await claimRoute(post("/api/gift/claim", { giftId: "41", token: "second-version-secret-0123456789" }, cookie));
    assert.equal(answer.status, 409);
    assert.equal(((await answer.json()) as { code?: string }).code, "OUT_OF_DATE");
    // Any key in the body is refused for a gift of the second version, its preview token as much as its secret, and a
    // key sent beside a signed opening too: the signature is all an opening carries (the review of 2 Oct 2026, R-01).
    for (const body of [
      { giftId: "41", token: previewTokenOf("second-version-secret-0123456789") },
      { giftId: "41", token: "another-key-altogether-0123456789" },
      { giftId: "41", opening, token: "second-version-secret-0123456789" },
    ]) {
      answer = await claimRoute(post("/api/gift/claim", body, cookie));
      assert.equal(answer.status, 409);
      assert.equal(((await answer.json()) as { code?: string }).code, "OUT_OF_DATE");
    }
    // The funder cannot open their own gift, whatever key signs.
    answer = await claimRoute(post("/api/gift/claim", { giftId: "41", opening }, await cookieFor(FUNDER)));
    assert.equal(((await answer.json()) as { code?: string }).code, "OWN_GIFT");
  });
});

// --- the ending ------------------------------------------------------------------------------------------------------

const DAILY: GiftState = {
  giftId: "41",
  funder: FUNDER.address,
  refundTo: FUNDER.address,
  recipient: RECIPIENT.address,
  recipientContactHash: NO_CONTACT_HASH,
  goalType: 1,
  dailyTarget: 10,
  durationDays: 7,
  startDay: 20_834,
  endDay: 20_840,
  creditedDays: 2,
  drainedDays: 1,
  settledThroughDay: 20_836,
  amount: 7_000_004n,
  perDay: 1_000_000n,
  withdrawnByRecipient: 1_000_000n,
  refundedToFunder: 1_000_000n,
  refundable: 1_000_000n,
  identityHash: `0x${"aa".repeat(32)}`,
  baselineValue: 1_020n,
  lastCheckInAt: 1_800_100_000,
  fundedAt: 1_800_000_000,
  claimedAt: 1_800_000_100,
  cancelled: false,
  finalised: false,
  earnedBalance: 1_000_000n,
  refundableBalance: 0n,
  withdrawNonce: 1n,
  version: 2,
  openingKey: FUNDER.address,
  endedAt: 0,
  givenBackDays: 0,
};

test("the ending a daily gift offers is the contract's own two amounts, to the unit, and only to the person it is for", () => {
  // Two days counted stay theirs, taken out or not. What goes back is everything else that has not gone back already.
  assert.deepEqual(dailyEndOffer(DAILY, true), { keep: "2000000", keepDisplay: "$2.00", giveBack: "4000004", giveBackDisplay: "$4.00", nonce: "1" });
  assert.equal(dailyEndOffer(DAILY, false), null, "nobody else is offered it");
  assert.equal(dailyEndOffer({ ...DAILY, version: 1 }, true), null, "a gift of the first version cannot be ended");
  assert.equal(dailyEndOffer({ ...DAILY, finalised: true }, true), null);
  assert.equal(dailyEndOffer({ ...DAILY, cancelled: true }, true), null);
  assert.equal(dailyEndOffer({ ...DAILY, recipient: null }, true), null);
  // Opened and never connected: nothing was counted, everything goes back.
  assert.deepEqual(dailyEndOffer({ ...DAILY, startDay: 0, endDay: 0, creditedDays: 0, drainedDays: 0, refundedToFunder: 0n, withdrawnByRecipient: 0n }, true)?.giveBack, "7000004");
  // The contract's own formula, word for word.
  const source = readFileSync("contracts/GiftEscrowV2.sol", "utf8");
  assert.match(source, /keep = uint256\(g\.creditedDays\) \* g\.perDay;\s+giveBack = g\.amount - keep - g\.refundedToFunder;/);
  assert.equal(dailyEnded(DAILY), null);
  assert.deepEqual(dailyEnded({ ...DAILY, finalised: true, endedAt: 1_800_200_000, givenBackDays: 4 }), { atMs: 1_800_200_000_000, keptDisplay: "$2.00", givenBackDisplay: "$5.00" });
});

const CLIMB: MilestoneState = {
  giftId: "1000041",
  funder: FUNDER.address,
  refundTo: FUNDER.address,
  recipient: RECIPIENT.address,
  recipientContactHash: NO_CONTACT_HASH,
  goalType: 1,
  shape: 0,
  target: 1500n,
  maximumStart: 1300n,
  subject: `0x${"00".repeat(32)}`,
  durationDays: 30,
  amount: 20_000_000n,
  earned: 0n,
  withdrawnByRecipient: 0n,
  refundable: 0n,
  refundedToFunder: 0n,
  identityHash: `0x${"aa".repeat(32)}`,
  startingValue: 1200n,
  lastProofAt: 1_800_000_200,
  deadline: 1_802_592_200,
  fundedAt: 1_800_000_000,
  claimedAt: 1_800_000_100,
  cancelled: false,
  settled: false,
  earnedBalance: 0n,
  withdrawNonce: 0n,
  proofPaused: false,
  proofResumedAt: 1_700_000_000,
  proofPauseBegan: 1_699_900_000,
  version: 2,
  openingKey: FUNDER.address,
  endedAt: 0,
};

test("ending a milestone gift keeps nothing and gives the whole amount back; a gift reached cannot be ended", () => {
  assert.deepEqual(milestoneEndOffer(CLIMB, true), { keep: "0", keepDisplay: "$0.00", giveBack: "20000000", giveBackDisplay: "$20.00", nonce: "0" });
  assert.equal(milestoneEndOffer(CLIMB, false), null);
  assert.equal(milestoneEndOffer({ ...CLIMB, version: 1 }, true), null);
  assert.equal(milestoneEndOffer({ ...CLIMB, settled: true, earned: 20_000_000n }, true), null, "reached: it is theirs");
  assert.equal(milestoneEndOffer({ ...CLIMB, recipient: null }, true), null);
  assert.deepEqual(milestoneEnded({ ...CLIMB, settled: true, endedAt: 1_800_300_000 }), { atMs: 1_800_300_000_000, keptDisplay: "$0.00", givenBackDisplay: "$20.00" });
  assert.equal(milestoneEnded(CLIMB), null);
});

test("the end route refuses a gift of the first version, a stranger's request and a malformed one, before any relay", async () => {
  await saveGift({ giftId: "3", funder: FUNDER.address, contactHash: NO_CONTACT_HASH, claimToken: "first-version-key-0123456789", goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, createdTx: `0x${"a1".repeat(32)}`, escrow: V1 });
  const cookie = await cookieFor(RECIPIENT);
  const body = { keep: "0", giveBack: "5000000", nonce: "0", deadline: String(Math.floor(Date.now() / 1_000) + 600), signature: `0x${"11".repeat(64)}1b` };
  const end = (id: string, sent: unknown, as: string) => endRoute(post(`/api/gift/${id}/end`, sent, as), { params: Promise.resolve({ id }) });
  let answer = await end("3", body, cookie);
  assert.equal(answer.status, 409);
  assert.equal(((await answer.json()) as { code?: string }).code, "CANNOT_BE_ENDED");
  answer = await end("999", body, cookie);
  assert.equal(answer.status, 404);
  answer = await end("3", { ...body, keep: "a lot" }, cookie);
  assert.equal(((await answer.json()) as { code?: string }).code, "INVALID_REQUEST");
  answer = await end("3", { ...body, signature: "0x1234" }, cookie);
  assert.equal(((await answer.json()) as { code?: string }).code, "INVALID_SIGNATURE");
  answer = await endRoute(new Request(`${ORIGIN}/api/gift/3/end`, { method: "POST", headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "3" }) });
  assert.equal(answer.status, 401);
  answer = await endRoute(new Request(`${ORIGIN}/api/gift/3/end`, { method: "POST", headers: { origin: "https://elsewhere.example", host: "viky.test", "content-type": "application/json", cookie }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "3" }) });
  assert.equal(((await answer.json()) as { code?: string }).code, "CROSS_ORIGIN", "asked by Viky's own pages alone");
});

// --- what the keeper and the deployment read ---------------------------------------------------------------------------

test("on the second version a window closes where the contract says: a pause gives back what it took, and reopens nothing", () => {
  const unopened = { ...CLIMB, recipient: null, identityHash: `0x${"00".repeat(32)}` as Hex, deadline: 0, claimedAt: 0 };
  const waited = unopened.fundedAt + MILESTONE_DORMANT_SECONDS;
  const due = waited + MILESTONE_PROOF_GRACE_SECONDS;
  assert.equal(canExpire(unopened, due), true);
  // A pause that began the day before the wait ran out and ended two days after it: the grace is counted from its end.
  const across = { proofPauseBegan: waited - 86_400, proofResumedAt: waited + 2 * 86_400 };
  assert.equal(canExpire({ ...unopened, ...across }, due), false);
  assert.equal(canExpire({ ...unopened, ...across }, across.proofResumedAt + MILESTONE_PROOF_GRACE_SECONDS - 1), false);
  assert.equal(canExpire({ ...unopened, ...across }, across.proofResumedAt + MILESTONE_PROOF_GRACE_SECONDS), true);
  // The first version did not move this wait, and the keeper still reads it as it is.
  assert.equal(canExpire({ ...unopened, version: 1, proofPauseBegan: 0, proofResumedAt: across.proofResumedAt }, due), true);

  // The review of 2 Oct 2026, R-04: a pause sent weeks after a window closed reopens nothing, even while it runs.
  const late = { proofPauseBegan: due + 20 * 86_400, proofResumedAt: due + 27 * 86_400, proofPaused: true };
  assert.equal(canExpire({ ...unopened, ...late }, due + 21 * 86_400), true);
  const climb = { ...CLIMB, deadline: 1_800_900_000 };
  const lateForClimb = { proofPauseBegan: climb.deadline + 30 * 86_400, proofResumedAt: climb.deadline + 30 * 86_400 };
  assert.equal(canExpire({ ...climb, ...lateForClimb }, climb.deadline + 30 * 86_400 + 60), true);

  // A pause that began two hours into the six of the grace gives back the four that were left, and no more.
  const inGrace = { proofPauseBegan: climb.deadline + 2 * 3_600, proofResumedAt: climb.deadline + 2 * 3_600 + 3 * 86_400 };
  assert.equal(closesAfterPause(climb.deadline, MILESTONE_PROOF_GRACE_SECONDS, { began: inGrace.proofPauseBegan, until: inGrace.proofResumedAt }), inGrace.proofResumedAt + 4 * 3_600);
  assert.equal(canExpire({ ...climb, ...inGrace }, inGrace.proofResumedAt + 4 * 3_600), false);
  assert.equal(canExpire({ ...climb, ...inGrace }, inGrace.proofResumedAt + 4 * 3_600 + 1), true);
  // While the pause runs its end is still ahead, so the window it shut cannot close.
  assert.equal(canExpire({ ...climb, proofPaused: true, proofPauseBegan: climb.deadline - 3_600, proofResumedAt: climb.deadline + 6 * 86_400 }, climb.deadline + 2 * 86_400), false);

  // A certificate's fourteen late days: what was left comes back, a week at most, and a pause across the deadline
  // leaves more than a week by itself, so nothing moves.
  const late14 = 14 * 86_400;
  const d = 1_800_900_000;
  assert.equal(closesAfterPause(d, late14, { began: d + 13 * 86_400, until: d + 20 * 86_400 }), d + 21 * 86_400);
  assert.equal(closesAfterPause(d, late14, { began: d + 2 * 86_400, until: d + 9 * 86_400 }), d + 16 * 86_400);
  assert.equal(closesAfterPause(d, late14, { began: d - 86_400, until: d + 6 * 86_400 }), d + late14);
  assert.equal(closesAfterPause(d, late14, { began: 0, until: 0 }), d + late14, "a contract never paused");

  // R-14: a deadline that fell inside a pause is read at the end of that pause, and no other deadline moves.
  assert.equal(readingTakenBy(d, { began: d - 2 * 86_400, until: d + 3 * 86_400 }), d + 3 * 86_400);
  assert.equal(readingTakenBy(d, { began: d + 3_600, until: d + 2 * 86_400 }), d);
  assert.equal(readingTakenBy(d, { began: d - 5 * 86_400, until: d - 4 * 86_400 }), d);
  const started = { ...climb, identityHash: `0x${"aa".repeat(32)}` as Hex, startingValue: 1_200n, deadline: d };
  const covering = { proofPauseBegan: d - 2 * 86_400, proofResumedAt: d + 3 * 86_400 };
  assert.equal(milestonePhase({ ...started, ...covering }, d + 86_400), "climbing", "still read while the pause that covers its deadline runs");
  assert.equal(milestonePhase({ ...started, ...covering }, d + 3 * 86_400 + 1), "overdue");
  assert.equal(milestonePhase(started, d + 1), "overdue", "with no pause across it, the deadline is the deadline");
  assert.equal(milestonePhase({ ...started, ...covering, version: 1 }, d + 86_400), "overdue", "the first version has no such rule");

  // The contract's own lines, so this mirror and the contract cannot drift apart unseen.
  const contract = readFileSync("contracts/MilestoneGiftV2.sol", "utf8");
  assert.match(contract, /_closes\(uint256\(g\.fundedAt\) \+ DORMANT_REFUND_DELAY, PROOF_GRACE\)/);
  assert.match(contract, /_closes\(uint256\(g\.claimedAt\) \+ DORMANT_REFUND_DELAY, PROOF_GRACE\)/);
  assert.match(contract, /if \(block\.timestamp <= _closes\(g\.deadline, LATE_PROOF_WINDOW\)\) revert TooEarly\(\);/);
  assert.match(contract, /if \(block\.timestamp <= _closes\(g\.deadline, PROOF_GRACE\)\) revert TooEarly\(\);/);
  assert.match(contract, /if \(began > close\) return close;\s+uint256 left = close - \(began > moment \? began : moment\);\s+uint256 reopened = uint256\(proofPausedUntil\) \+ \(left < PAUSE_REST \? left : PAUSE_REST\);\s+if \(reopened > close\) close = reopened;/);
  assert.match(contract, /return proofPauseBegan <= deadline && deadline < proofPausedUntil \? uint256\(proofPausedUntil\) : deadline;/);
  assert.match(contract, /if \(uint256\(a\.observedAt\) > _readBy\(g\.deadline\)\) revert DeadlinePassed\(\);/);
});

test("the three addresses of the second version are set together or not at all: a half-set one refuses to build and to start (the review of 2 Oct 2026, R-08)", () => {
  const all = { NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS: V2, NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS: V2_MILESTONE, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: "0x00000000000000000000000000000000000000A4" };
  assert.equal(secondVersionProblem({}), null, "none of the three: the second version is off");
  assert.equal(secondVersionProblem(all), null, "the three: it is on");
  assert.doesNotThrow(() => assertSecondVersionWhole(all));
  // One left out was a silence: the anchor's, and no agreement was ever written down; a gift contract's, and its gifts
  // were read with the first version's words.
  for (const left of SECOND_VERSION_SETTINGS) {
    const two = { ...all, [left]: undefined };
    assert.match(String(secondVersionProblem(two)), new RegExp(`${left} is not: the three are set together, or none is`), left);
    assert.throws(() => assertSecondVersionWhole(two), (error: unknown) => error instanceof SecondVersionHalfSet && error.message.startsWith("Refusing to start: "));
    const one = { [left]: all[left] };
    assert.match(String(secondVersionProblem(one)), new RegExp(`^${left} is set and `), left);
  }
  // Set and not an address is not "unset": it used to be read as nothing, without a word.
  assert.match(String(secondVersionProblem({ ...all, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: "0x1234" })), /NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS is set and is not an address/);
  assert.match(String(secondVersionProblem({ ...all, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: V2 })), /name the same address/);
  assert.equal(secondVersionProblem({ ...all, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: "  " }) === null, false, "blank is left out");

  // Where it is asked: when the app is built, since a browser's copy of the three is fixed then, and when a server starts.
  const config = readFileSync("next.config.mjs", "utf8");
  assert.match(config, /throw new Error\(`Refusing to build: \$\{SECOND_VERSION_SETTINGS\.join\(", "\)\} are set together, each an address of its own, or none is\.`\);/);
  for (const name of SECOND_VERSION_SETTINGS) assert.ok(config.includes(`"${name}"`), `${name} is one of the three the build checks`);
  // The build's own check is plain JavaScript: held to the same answer as the one a server starts with.
  const buildRefuses = (env: Record<string, string | undefined>) => {
    const given = SECOND_VERSION_SETTINGS.map((name) => (env[name] ?? "").trim()).filter((value) => value !== "");
    return given.length > 0 && (given.length < 3 || given.some((value) => !/^0x[0-9a-fA-F]{40}$/.test(value)) || new Set(given.map((value) => value.toLowerCase())).size < 3);
  };
  assert.match(config, /secondVersionSet\.length > 0 && \(secondVersionSet\.length < 3 \|\| secondVersionSet\.some\(\(value\) => !\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(value\)\) \|\| new Set\(secondVersionSet\.map\(\(value\) => value\.toLowerCase\(\)\)\)\.size < 3\)/);
  for (const env of [{}, all, { ...all, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: undefined }, { NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS: V2 }, { ...all, NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS: "nope" }, { ...all, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: V2 }]) {
    assert.equal(buildRefuses(env), secondVersionProblem(env) !== null, JSON.stringify(env));
  }
  assert.match(readFileSync("instrumentation.ts", "utf8"), /refuseHalfSetSecondVersion\(\);\s+refuseProductionDatabase\(\);/);
  assert.match(readFileSync("src/database-guard-start.ts", "utf8"), /assertSecondVersionWhole\(\);\s+\} catch \(error\) \{\s+if \(!\(error instanceof SecondVersionHalfSet\)\) throw error;\s+console\.error\(error\.message\);\s+process\.exit\(1\);/);
});

test("the three contracts of the second version are Viky's own: money is never sent to one by hand (the review of 2 Oct 2026, R-09)", async () => {
  const anchor = "0x00000000000000000000000000000000000000A4";
  // Off, they are nobody's: no address is known.
  for (const address of [V2, V2_MILESTONE, anchor]) assert.equal(isVikyContract(address), false);
  assert.deepEqual(secondVersionContracts(), []);
  process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS = anchor;
  try {
    await withTheSecondVersion(() => {
      assert.deepEqual(secondVersionContracts().map((address) => address.toLowerCase()), [V2, V2_MILESTONE, anchor].map((address) => address.toLowerCase()));
      for (const address of [V2, V2_MILESTONE, anchor]) {
        assert.equal(isVikyContract(address), true, address);
        assert.equal(isVikyContract(address.toLowerCase()), true, address);
      }
      // The four in service are still refused, and a person's own address still is not.
      assert.equal(isVikyContract(V1), true);
      assert.equal(isVikyContract(FUNDER.address), false);
    });
  } finally {
    delete process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS;
  }
  // The same question is asked where money is sent by hand: the send route, and the two fields of the way out.
  assert.match(readFileSync("app/api/send/route.ts", "utf8"), /if \(isVikyContract\(to\)\) throw new GiftApiError\("VIKY_DESTINATION"/);
  assert.equal((readFileSync("app/components/CashOut.tsx", "utf8").match(/isVikyContract\(typed\)/g) ?? []).length, 2);
});

test("the goals a deployment registers are the register's, each number once", () => {
  assert.deepEqual(DAILY_GOALS.map((goal) => goal.goalType), [1, 4, 5, 6]);
  assert.equal(new Set(DAILY_GOALS.map((goal) => goal.providerId)).size, DAILY_GOALS.length);
  assert.equal(new Set(MILESTONE_GOALS.map((goal) => goal.goalType)).size, MILESTONE_GOALS.length);
  // As read on the contract in service on 1 Oct 2026: the deployment refuses to run if they no longer match.
  assert.equal(DAILY_GOALS[0].providerId, "0x95160f9e5c0e1752b7128f3aeffd36d5906b2cedb43432391d1dc6c7ec958e34");
  assert.equal(DAILY_GOALS[1].providerId, "0x891688d7bb10712c938397c2502da41b764a18322340c895613ac00b0fcab790");
  assert.equal(DAILY_GOALS[2].providerId, "0x8f940d06b0eb5122941908713583a1aef4c026ab396ce91c93348d460cf89629");
  assert.equal(DAILY_GOALS[3].providerId, "0x1945fcd86cc0f0a5a3ffcea6145dbbb882c4c0ac989624a4476da8885c16a701");
  const deploy = readFileSync("scripts/deploy-v2.ts", "utf8");
  assert.match(deploy, /creation is still open on/);
  assert.match(deploy, /if \(owner === deployer\) throw new Error/);
  // One rule for every script that sends (src/monad/chain.ts, pinned in test/safe-actions.test.ts): a rehearsal speaks
  // to its local node alone, and a local node is nothing but a rehearsal.
  assert.match(deploy, /const transport = scriptTransport\(rpc, rehearsal\);/);
});
