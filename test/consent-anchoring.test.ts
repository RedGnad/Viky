import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createEd25519SigningSession } from "@category-labs/mera";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { consentBytes, consentText, KEPT_AFTER, toHex } from "../src/consent";
import {
  anchorOffer,
  anchorRow,
  anchorSignatureStands,
  bindingStands,
  configureConsentAnchor,
  requestedAnchor,
  type AnchorDeps,
  type AnchorEntry,
} from "../src/consent-anchoring";
import { AGREEMENTS_FROM, readingLeave } from "../src/consent-guard";
import { bindingOf, configureConsentStore, consentHistory, keepBinding, keepConsent, keepConsentKey, noteAnchored, stopWaitingForAnchor, type ConsentRow } from "../src/consent-store";
import { consentTermsFor } from "../src/consent-terms";
import type { SqlExecutor } from "../src/proof-session-store";
import { consentAnchorMessage, consentKeyTypedData, consentTextDigest } from "../src/v2-protocol";

/**
 * A yes and a stop written down in public (the audit of 1 Oct 2026, section 3.7): what the browser is told to sign, what
 * the server checks before it keeps it, and what the relayer writes, in the anchor's own order. The chain here is a
 * stand-in that keeps the contract's rules (contracts/ConsentAnchor.sol, held by test/ConsentAnchor.t.sol): one key per
 * account, for good, and each entry at the next place of its gift.
 */

const CONTRACT = "0x00000000000000000000000000000000000a2c04" as Hex;
const ZERO = `0x${"00".repeat(32)}` as Hex;
const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const stranger = privateKeyToAccount(`0x${"22".repeat(32)}`);
const ACCOUNT = owner.address.toLowerCase() as Hex;
const key = createEd25519SigningSession({ privateKey: new Uint8Array(32).fill(9) });
const other = createEd25519SigningSession({ privateKey: new Uint8Array(32).fill(3) });
const KEY = toHex(key.publicKey) as Hex;

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureConsentStore(executor);
});
after(async () => {
  configureConsentStore(undefined);
  configureConsentAnchor(undefined);
  await db.close();
});

/** The anchor, as far as this code can tell it from the real one: its two rules, and what it holds. */
function chain(contract: Hex | null = CONTRACT) {
  const bound = new Map<string, Hex>();
  const entries = new Map<string, AnchorEntry[]>();
  const sent: { functionName: string; args: readonly unknown[] }[] = [];
  let failing: string | null = null;
  const listOf = (account: string, giftId: string) => {
    const at = `${account.toLowerCase()}:${giftId}`;
    if (!entries.has(at)) entries.set(at, []);
    return entries.get(at)!;
  };
  const deps: AnchorDeps = {
    contract: () => contract,
    boundKey: async (_contract, account) => bound.get(account.toLowerCase()) ?? ZERO,
    entryCount: async (_contract, account, giftId) => listOf(account, giftId).length,
    entryAt: async (_contract, account, giftId, sequence) => listOf(account, giftId)[sequence],
    send: async (_contract, functionName, args) => {
      if (failing) throw new Error(failing);
      sent.push({ functionName, args });
      if (functionName === "bind") {
        const [account, boundKey] = args as [Hex, Hex, Hex];
        if (bound.has(account.toLowerCase())) throw new Error("KeyAlreadyBound");
        bound.set(account.toLowerCase(), boundKey);
      } else {
        const [account, giftId, kind, sequence, digest, signatureR, signatureS] = args as [Hex, bigint, number, bigint, Hex, Hex, Hex];
        if (!bound.has(account.toLowerCase())) throw new Error("KeyNotBound");
        const list = listOf(account, giftId.toString());
        if (Number(sequence) !== list.length) throw new Error("OutOfSequence");
        list.push({ kind, anchoredAt: 1_800_000_000 + list.length, digest, signatureR, signatureS });
      }
      return `0x${(sent.length).toString(16).padStart(64, "0")}` as Hex;
    },
    binding: bindingOf,
    anchored: noteAnchored,
    gaveUp: stopWaitingForAnchor,
  };
  return { deps, bound, entries: listOf, sent, fail: (reason: string | null) => (failing = reason) };
}

const textOf = (kind: "yes" | "stop", giftId: string) =>
  consentText(kind, { account: ACCOUNT, giftId, terms: consentTermsFor("chess-rating", "yours", "rapid")!, until: "30 Oct 2026, the gift's last day", kept: KEPT_AFTER });

const anchorSignature = async (kind: "yes" | "stop", giftId: string, sequence: number, by = key) =>
  toHex(await by.signMessage(new TextEncoder().encode(consentAnchorMessage({ anchor: CONTRACT, account: ACCOUNT, giftId, kind, sequence, digest: consentTextDigest(textOf(kind, giftId)) })))) as Hex;

const bindingBy = (signer = owner) => signer.signTypedData(consentKeyTypedData(CONTRACT, ACCOUNT, KEY));

/** Keeps a row as the route does once everything is checked, signed for a place on the anchor. */
async function kept(kind: "yes" | "stop", giftId: string, sequence: number | null): Promise<ConsentRow> {
  await keepConsentKey(ACCOUNT, KEY);
  const text = textOf(kind, giftId);
  const row = await keepConsent({
    giftId,
    account: ACCOUNT,
    kind,
    text,
    publicKey: KEY,
    signature: toHex(await key.signMessage(consentBytes(text))),
    anchor: sequence === null ? null : { sequence, signature: await anchorSignature(kind, giftId, sequence) },
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  return row;
}

const latestRow = async (giftId: string) => (await consentHistory(giftId)).at(-1)!;

beforeEach(async () => {
  configureConsentAnchor(undefined);
  await db.query("DROP TABLE IF EXISTS viky_consents").catch(() => undefined);
  await db.query("DROP TABLE IF EXISTS viky_consent_keys").catch(() => undefined);
  // The store makes its tables once per process: told to forget, it makes them again.
  configureConsentStore(async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  });
});

test("while the anchor is not set nothing is offered, nothing is sent, and a row signed for nothing is left alone", async () => {
  const off = chain(null);
  assert.equal(await anchorOffer(ACCOUNT, "3000001", off.deps), null);
  const row = await kept("yes", "3000001", 0);
  assert.equal(await anchorRow(row, off.deps), "off");
  const on = chain();
  assert.equal(await anchorRow(await kept("yes", "3000002", null), on.deps), "off", "a row that came with no signature for the anchor is not anchored");
  assert.equal(off.sent.length + on.sent.length, 0);
});

test("the offer says where, for which account, whether its key is bound and the next place; a chain that cannot be read offers nothing", async () => {
  const anchor = chain();
  assert.deepEqual(await anchorOffer(owner.address, "3000003", anchor.deps), { contract: CONTRACT, account: ACCOUNT, bound: false, sequence: 0 });
  await keepConsentKey(ACCOUNT, KEY);
  await keepBinding(ACCOUNT, await bindingBy());
  assert.equal(await anchorRow(await kept("yes", "3000003", 0), anchor.deps), "anchored");
  assert.deepEqual(await anchorOffer(ACCOUNT, "3000003", anchor.deps), { contract: CONTRACT, account: ACCOUNT, bound: true, sequence: 1 });
  assert.deepEqual(await anchorOffer(ACCOUNT, "3000004", anchor.deps), { contract: CONTRACT, account: ACCOUNT, bound: true, sequence: 0 }, "each gift has its own sequence");
  const dark: AnchorDeps = { ...anchor.deps, entryCount: async () => Promise.reject(new Error("the chain did not answer")) };
  assert.equal(await anchorOffer(ACCOUNT, "3000003", dark), null);
});

test("what comes back with an agreement is read strictly: a place, 64 bytes, and 65 for the binding", () => {
  const signature = `0x${"ab".repeat(64)}`;
  const binding = `0x${"cd".repeat(65)}`;
  assert.equal(requestedAnchor(undefined), null);
  assert.equal(requestedAnchor(null), null);
  assert.deepEqual(requestedAnchor({ sequence: 2, signature }), { sequence: 2, signature, binding: null });
  assert.deepEqual(requestedAnchor({ sequence: 0, signature: signature.toUpperCase().replace("0X", "0x"), binding }), { sequence: 0, signature, binding });
  for (const wrong of ["yes", { sequence: -1, signature }, { sequence: 1.5, signature }, { sequence: "0", signature }, { sequence: 0, signature: "0x00" }, { sequence: 0, signature, binding: "0x00" }, { sequence: 0 }]) {
    assert.equal(requestedAnchor(wrong), false, JSON.stringify(wrong));
  }
});

test("the consent key's signature stands for this gift, this kind, this place and this text, and for nothing else", async () => {
  const row = { account: ACCOUNT, giftId: "3000005", kind: "yes" as const, text: textOf("yes", "3000005"), publicKey: KEY };
  const signature = await anchorSignature("yes", "3000005", 1);
  assert.ok(anchorSignatureStands(CONTRACT, row, { sequence: 1, signature }));
  assert.equal(anchorSignatureStands(CONTRACT, row, { sequence: 0, signature }), false, "another place: an old yes cannot be written again after a stop");
  assert.equal(anchorSignatureStands(CONTRACT, { ...row, kind: "stop" }, { sequence: 1, signature }), false);
  assert.equal(anchorSignatureStands(CONTRACT, { ...row, giftId: "3000006" }, { sequence: 1, signature }), false);
  assert.equal(anchorSignatureStands(CONTRACT, { ...row, text: row.text.replace("rapid", "blitz") }, { sequence: 1, signature }), false);
  assert.equal(anchorSignatureStands("0x00000000000000000000000000000000000000a1", row, { sequence: 1, signature }), false, "another contract");
  assert.equal(anchorSignatureStands(CONTRACT, row, { sequence: 1, signature: await anchorSignature("yes", "3000005", 1, other) }), false, "another key");
});

test("only the account itself binds its consent key", async () => {
  assert.ok(await bindingStands(CONTRACT, ACCOUNT, KEY, await bindingBy()));
  assert.equal(await bindingStands(CONTRACT, ACCOUNT, KEY, await bindingBy(stranger)), false, "somebody else's signature");
  assert.equal(await bindingStands(CONTRACT, ACCOUNT, toHex(other.publicKey), await bindingBy()), false, "signed for another key");
  assert.equal(await bindingStands("0x00000000000000000000000000000000000000a1", ACCOUNT, KEY, await bindingBy()), false, "signed for another contract");
  assert.equal(await bindingStands(CONTRACT, ACCOUNT, KEY, "0x1234"), false);
});

test("the first yes binds the key and is written; a stop and a second yes follow in order, and the key is bound once", async () => {
  const anchor = chain();
  await keepConsentKey(ACCOUNT, KEY);
  await keepBinding(ACCOUNT, await bindingBy());
  const yes = await kept("yes", "3000007", 0);
  assert.equal(await anchorRow(yes, anchor.deps), "anchored");
  assert.deepEqual(anchor.sent.map((one) => one.functionName), ["bind", "anchor"]);
  assert.equal(anchor.bound.get(ACCOUNT), KEY);
  const first = anchor.entries(ACCOUNT, "3000007")[0];
  assert.equal(first.kind, 1);
  assert.equal(first.digest, consentTextDigest(textOf("yes", "3000007")));
  assert.equal(`0x${first.signatureR.slice(2)}${first.signatureS.slice(2)}`, yes.anchorSignature, "the two halves are the consent key's signature, whole");
  assert.match((await latestRow("3000007")).anchorTx ?? "", /^0x[0-9a-f]{64}$/);

  assert.equal(await anchorRow(await kept("stop", "3000007", 1), anchor.deps), "anchored");
  assert.equal(await anchorRow(await kept("yes", "3000007", 2), anchor.deps), "anchored");
  assert.deepEqual(anchor.entries(ACCOUNT, "3000007").map((entry) => entry.kind), [1, 2, 1]);
  assert.deepEqual(anchor.sent.map((one) => one.functionName), ["bind", "anchor", "anchor", "anchor"], "bound once, for good");
  // Asked again for a row already written: nothing is sent.
  assert.equal(await anchorRow(await latestRow("3000007"), anchor.deps), "anchored");
  assert.equal(anchor.sent.length, 4);
});

test("a row that could not be written waits with its signature, and is written when tried again", async () => {
  const anchor = chain();
  await keepConsentKey(ACCOUNT, KEY);
  // No binding yet: the account has not signed for its key, so nothing can be written, and nothing is sent.
  const yes = await kept("yes", "3000008", 0);
  assert.equal(await anchorRow(yes, anchor.deps), "waiting");
  assert.equal(anchor.sent.length, 0);
  await keepBinding(ACCOUNT, await bindingBy());
  // The relayer cannot send just now.
  anchor.fail("RESERVE_TOO_LOW");
  assert.equal(await anchorRow(yes, anchor.deps), "waiting");
  assert.notEqual((await latestRow("3000008")).anchorSignature, null, "it still holds what the anchor is to be given");
  assert.equal((await latestRow("3000008")).anchorTx, null);
  anchor.fail(null);
  assert.equal(await anchorRow(await latestRow("3000008"), anchor.deps), "anchored");
  assert.equal(anchor.entries(ACCOUNT, "3000008").length, 1);
});

test("a binding nobody but the account could have made is the only one sent", async () => {
  const anchor = chain();
  await keepConsentKey(ACCOUNT, KEY);
  await keepBinding(ACCOUNT, await bindingBy(stranger));
  assert.equal(await anchorRow(await kept("yes", "3000009", 0), anchor.deps), "waiting");
  assert.equal(anchor.sent.length, 0, "a binding the contract would refuse costs the relayer nothing");
});

test("a place taken by something else is never written; taken by the row itself, it is written and the hash is all that is missing", async () => {
  const anchor = chain();
  await keepConsentKey(ACCOUNT, KEY);
  await keepBinding(ACCOUNT, await bindingBy());
  // Two devices signed for the same place: the first is written, the second can never be.
  const one = await kept("yes", "3000010", 0);
  const two = await kept("stop", "3000010", 0);
  assert.equal(await anchorRow(one, anchor.deps), "anchored");
  assert.equal(await anchorRow(two, anchor.deps), "never");
  const rows = await consentHistory("3000010");
  assert.equal(rows[1].anchorSignature, null, "it stops waiting");
  assert.equal(rows[1].kind, "stop", "and the stop itself stands: it is the public record of it that does not exist");
  assert.equal(anchor.sent.filter((sent) => sent.functionName === "anchor").length, 1);

  // A transaction that went through and whose answer was lost: the entry is there, exactly this row's.
  const lost = await kept("yes", "3000011", 0);
  anchor.entries(ACCOUNT, "3000011").push({ kind: 1, anchoredAt: 1_800_000_000, digest: consentTextDigest(lost.text), signatureR: `0x${lost.anchorSignature!.slice(2, 66)}`, signatureS: `0x${lost.anchorSignature!.slice(66, 130)}` });
  const before = anchor.sent.length;
  assert.equal(await anchorRow(lost, anchor.deps), "anchored");
  assert.equal(anchor.sent.length, before, "nothing is sent twice");
});

test("an account whose key on the anchor is another one is never written under this one", async () => {
  const anchor = chain();
  anchor.bound.set(ACCOUNT, toHex(other.publicKey) as Hex);
  const row = await kept("yes", "3000012", 0);
  assert.equal(await anchorRow(row, anchor.deps), "never");
  assert.equal(anchor.sent.length, 0);
});

test("a yes that still waits is tried again before a reading, and the reading is allowed whatever comes of it", async () => {
  const anchor = chain();
  configureConsentAnchor(anchor.deps);
  const AFTER = AGREEMENTS_FROM + 86_400;
  await keepConsentKey(ACCOUNT, KEY);
  await keepBinding(ACCOUNT, await bindingBy());
  anchor.fail("the chain did not answer");
  const yes = await kept("yes", "3000013", 0);
  assert.equal(await anchorRow(yes), "waiting");

  // A page that only reads the state sends nothing.
  anchor.fail(null);
  assert.deepEqual(await readingLeave("3000013", AFTER, false), { allowed: true, beforeAgreements: false });
  assert.equal(anchor.sent.length, 0);

  // A reading: the yes is written first.
  assert.deepEqual(await readingLeave("3000013", AFTER), { allowed: true, beforeAgreements: false });
  assert.deepEqual(anchor.sent.map((one) => one.functionName), ["bind", "anchor"]);
  // And once written, the next reading sends nothing.
  assert.deepEqual(await readingLeave("3000013", AFTER), { allowed: true, beforeAgreements: false });
  assert.equal(anchor.sent.length, 2);

  // The chain refusing does not refuse the reading: the yes is in force since it was kept.
  await kept("stop", "3000013", 1);
  assert.deepEqual(await readingLeave("3000013", AFTER), { allowed: false, reason: "stopped" });
  anchor.fail("the chain did not answer");
  await kept("yes", "3000013", 1);
  assert.deepEqual(await readingLeave("3000013", AFTER), { allowed: true, beforeAgreements: false });
});
