import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createEd25519SigningSession } from "@category-labs/mera";
import { consentBytes, consentText, KEPT_AFTER, toHex } from "../src/consent";
import { agreementAt, AGREEMENTS_FROM, readingLeave } from "../src/consent-guard";
import { consentTermsFor } from "../src/consent-terms";
import { configureConsentStore, keepConsent, keepConsentKey, type ConsentRow } from "../src/consent-store";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * No reading that moves money without the recipient's valid yes (the founder, 29 Sep 2026): what every reader asks
 * before it reads, and what the journal marks each reading with.
 */

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
  await db.close();
});

const ACCOUNT = "0x00000000000000000000000000000000000000bb";
const AFTER = AGREEMENTS_FROM + 86_400;
const BEFORE = AGREEMENTS_FROM - 86_400;
const key = createEd25519SigningSession({ privateKey: new Uint8Array(32).fill(9) });
const other = createEd25519SigningSession({ privateKey: new Uint8Array(32).fill(3) });

const textOf = (kind: "yes" | "stop", giftId: string) =>
  consentText(kind, { account: ACCOUNT, giftId, terms: consentTermsFor("chess-rating", "yours", "rapid")!, until: "30 Oct 2026, the gift's last day", kept: KEPT_AFTER });

async function sign(kind: "yes" | "stop", giftId: string, by = key, text = textOf(kind, giftId)) {
  await keepConsentKey(ACCOUNT, toHex(key.publicKey));
  await keepConsent({ giftId, account: ACCOUNT, kind, text, publicKey: toHex(by.publicKey), signature: toHex(await by.signMessage(consentBytes(text))) });
  // Rows are ordered by the moment they are kept: two in the same millisecond would tie.
  await new Promise((resolve) => setTimeout(resolve, 5));
}

test("a gift funded since agreements is read only after its yes, and not after its stop", async () => {
  assert.deepEqual(await readingLeave("2000001", AFTER), { allowed: false, reason: "no_agreement" }, "nothing yet: nothing read");
  await sign("yes", "2000001");
  assert.deepEqual(await readingLeave("2000001", AFTER), { allowed: true, beforeAgreements: false });
  await sign("stop", "2000001");
  assert.deepEqual(await readingLeave("2000001", AFTER), { allowed: false, reason: "stopped" }, "the stop holds from the moment it is kept");
  await sign("yes", "2000001");
  assert.deepEqual(await readingLeave("2000001", AFTER), { allowed: true, beforeAgreements: false }, "agreeing again reads again");
});

test("a gift funded before agreements is read as before until its person answers, and a stop holds for it too", async () => {
  assert.deepEqual(await readingLeave("2000002", BEFORE), { allowed: true, beforeAgreements: true });
  await sign("stop", "2000002");
  assert.deepEqual(await readingLeave("2000002", BEFORE), { allowed: false, reason: "stopped" });
});

test("a yes counts only as it was signed: by the account's own key, over its own text, for this gift", async () => {
  // Signed by another passkey than the one the account agrees with.
  await sign("yes", "2000003", other);
  assert.deepEqual(await readingLeave("2000003", AFTER), { allowed: false, reason: "no_agreement" });
  // A text changed after it was signed.
  const signed = textOf("yes", "2000004");
  await keepConsent({ giftId: "2000004", account: ACCOUNT, kind: "yes", text: signed.replace("rapid", "blitz"), publicKey: toHex(key.publicKey), signature: toHex(await key.signMessage(consentBytes(signed))) });
  assert.deepEqual(await readingLeave("2000004", AFTER), { allowed: false, reason: "no_agreement" });
  // Another gift's yes, kept under this one.
  await sign("yes", "2000005", key, textOf("yes", "2000099"));
  assert.deepEqual(await readingLeave("2000005", AFTER), { allowed: false, reason: "no_agreement" });
});

test("the journal marks each reading by what held at its moment", () => {
  const row = (kind: "yes" | "stop", at: number): ConsentRow => ({ id: at, giftId: "2000009", account: ACCOUNT, kind, text: "", publicKey: "", signature: "", signedAt: new Date(at * 1_000), anchorTx: null, anchorSequence: null, anchorSignature: null });
  const history = [row("yes", AFTER + 100), row("stop", AFTER + 200), row("yes", AFTER + 300)];
  assert.equal(agreementAt(history, AFTER, AFTER + 50), "no_agreement", "before the first yes of a new gift");
  assert.equal(agreementAt(history, AFTER, AFTER + 150), "agreed");
  assert.equal(agreementAt(history, AFTER, AFTER + 250), "no_agreement", "a day after the stop: not read, for want of an agreement");
  assert.equal(agreementAt(history, AFTER, AFTER + 350), "agreed");
  assert.equal(agreementAt([], BEFORE, AFTER), "before_agreements", "an old gift nobody answered for yet");
  assert.equal(agreementAt(history, BEFORE, AFTER + 50), "before_agreements", "an old gift, before its first answer");
});
