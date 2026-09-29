import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createEd25519SigningSession } from "@category-labs/mera";
import { CONSENT_SALT_HEX, consentSalt } from "../src/client/consent-key";
import { consentBytes, consentText, KEPT_AFTER, toHex } from "../src/consent";
import { consentTermsFor } from "../src/consent-terms";
import { configureConsentStore, ed25519Verifies, keepConsent, keepConsentKey, latestConsent, latestConsentsOf } from "../src/consent-store";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The recipient's yes and stop (the founder, 29 Sep 2026; Mera's "One Passkey, Many Keys"): a key of its own from the
 * passkey, the same on every device, signing a text the server writes, kept with its signature.
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

const ACCOUNT = "0x00000000000000000000000000000000000000Aa";
const text = (kind: "yes" | "stop") =>
  consentText(kind, { account: ACCOUNT, giftId: "1000000", terms: consentTermsFor("chess-rating", "yours", "rapid")!, until: "30 Sep 2026, the gift's last day", kept: KEPT_AFTER });

test("the consent salt is sha256 of its name, and the key it gives is the same wherever the passkey answers it", async () => {
  assert.equal(CONSENT_SALT_HEX, createHash("sha256").update("viky:consent:v1").digest("hex"));
  assert.equal(toHex(consentSalt()), `0x${CONSENT_SALT_HEX}`);
  // A passkey's PRF is a function of the credential, the site and the salt: two devices holding the same passkey give
  // the same 32 bytes, and so the same key.
  const output = new Uint8Array(32).fill(7);
  const one = createEd25519SigningSession({ privateKey: new Uint8Array(output) });
  const other = createEd25519SigningSession({ privateKey: new Uint8Array(output) });
  assert.equal(toHex(one.publicKey), toHex(other.publicKey));
  const signature = await one.signMessage(consentBytes(text("yes")));
  assert.ok(ed25519Verifies(other.publicKey, consentBytes(text("yes")), signature), "what one device signs, the server checks against the key the other gives");
  assert.equal(ed25519Verifies(one.publicKey, consentBytes(text("yes").replace("rapid", "blitz")), signature), false, "a text changed by a word is not what was signed");
});

test("the text says what is read, for which gift, what the funder sees, until when and what is kept", () => {
  assert.equal(
    text("yes"),
    [
      "Viky agreement, version 1",
      "Account: 0x00000000000000000000000000000000000000aa",
      "Gift: 1000000",
      "Viky may read, for this gift and nothing else: your rapid rating on Chess.com, from your public profile, each time it is read",
      "The person who offered it sees: the rating read, and whether it reaches the target",
      "Until: 30 Sep 2026, the gift's last day",
      `Kept after: ${KEPT_AFTER}`,
    ].join("\n"),
  );
  assert.match(text("stop"), /^Viky stop, version 1\nAccount: 0x0+aa\nGift: 1000000\nViky stops reading for this gift, from now, on every device\.$/);
});

test("an account's consent key is kept at its first signature, and the gift's state is its latest row", async () => {
  assert.equal(await keepConsentKey(ACCOUNT, "0xAB"), "0xab");
  assert.equal(await keepConsentKey(ACCOUNT, "0xcd"), "0xab", "another key does not replace it");
  await keepConsent({ giftId: "1000000", account: ACCOUNT, kind: "yes", text: text("yes"), publicKey: "0xab", signature: "0x01" });
  assert.equal((await latestConsent("1000000"))?.kind, "yes");
  await new Promise((resolve) => setTimeout(resolve, 5));
  await keepConsent({ giftId: "1000000", account: ACCOUNT, kind: "stop", text: text("stop"), publicKey: "0xab", signature: "0x02" });
  assert.equal((await latestConsent("1000000"))?.kind, "stop", "a stop applies from the moment it is kept");
  assert.equal((await latestConsentsOf(ACCOUNT)).length, 1, "one line per gift in Me");
  assert.equal(await latestConsent("1000001"), null);
});
