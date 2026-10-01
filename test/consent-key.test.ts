import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { createEd25519SigningSession, isMeraError, type WebAuthnClient } from "@category-labs/mera";
// Mera's own browser client. The package does not export it, so it is read from the installed files themselves.
import { browserWebAuthnClient as merasOwn } from "../node_modules/@category-labs/mera/dist/webauthn.js";
import { ceremonyClient, CONSENT_SALT_HEX, consentKey, consentSalt, consentWebAuthnClient, endConsentKey, meraOwnClient } from "../src/client/consent-key";

/**
 * Every account is made and opened through a copy of Mera's browser WebAuthn client with one field added: the consent
 * salt, asked in the same ceremony (src/client/consent-key.ts). The copy cited this file as what holds the two
 * together, and this file did not exist (the audit of 1 Oct 2026, S-15). It gives both clients the same request and
 * the same authenticator, and holds them to the same ceremony, the same answer and the same refusals; the only
 * difference allowed is the second salt.
 */

const mera = merasOwn as WebAuthnClient;
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** An authenticator that records what it was asked and answers what the test gives it. */
function authenticator(answers: { first?: unknown; second?: unknown; enabled?: boolean; credential?: unknown }) {
  const asked: { method: "create" | "get"; options: { publicKey: Record<string, unknown> } }[] = [];
  const credential =
    answers.credential !== undefined
      ? answers.credential
      : {
          type: "public-key",
          rawId: Uint8Array.from([1, 2, 3, 4]).buffer,
          response: { getTransports: () => ["internal", "hybrid"] },
          getClientExtensionResults: () => ({ prf: { enabled: answers.enabled ?? true, results: { first: answers.first, second: answers.second } } }),
        };
  const credentials = {
    create: async (options: { publicKey: Record<string, unknown> }) => (asked.push({ method: "create", options }), credential),
    get: async (options: { publicKey: Record<string, unknown> }) => (asked.push({ method: "get", options }), credential),
  };
  Object.defineProperty(globalThis, "navigator", { value: { credentials }, configurable: true, writable: true });
  return asked;
}

const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
  endConsentKey();
  if (real) Object.defineProperty(globalThis, "navigator", real);
});

const SALT = new Uint8Array(32).fill(5);
const CREATE: WebAuthnClient.CreateCredentialRequest = {
  rp: { id: "viky.cash", name: "Viky" },
  user: { id: new Uint8Array(16).fill(7), name: "Viky account", displayName: "Viky account" },
  challenge: new Uint8Array(32).fill(9),
  algorithms: [-7, -257],
  timeout: 60_000,
  attestation: "none",
  residentKey: "required",
  userVerification: "required",
  prfSalt: SALT,
} as WebAuthnClient.CreateCredentialRequest;
const GET: WebAuthnClient.GetCredentialRequest = {
  rpId: "viky.cash",
  challenge: new Uint8Array(32).fill(9),
  timeout: 60_000,
  userVerification: "required",
  prfSalt: SALT,
} as WebAuthnClient.GetCredentialRequest;

/** The ceremony's options with the one field the copy adds taken out, for comparing the rest. */
function withoutSecond(publicKey: Record<string, unknown>): Record<string, unknown> {
  const extensions = publicKey.extensions as { prf: { eval: { first: unknown; second?: unknown } } };
  return { ...publicKey, extensions: { prf: { eval: { first: extensions.prf.eval.first } } } };
}

test("the consent salt is sha256 of its name", () => {
  assert.equal(CONSENT_SALT_HEX, createHash("sha256").update("viky:consent:v1").digest("hex"));
  assert.equal(toHex(consentSalt()), CONSENT_SALT_HEX);
});

test("making an account: the same ceremony as Mera's own client, with the consent salt as its one addition", async () => {
  const first = new Uint8Array(32).fill(11).buffer;
  const second = new Uint8Array(32).fill(13).buffer;
  let asked = authenticator({ first, second });
  const theirs = await mera.createCredential(CREATE);
  const theirOptions = asked[0].options.publicKey;
  asked = authenticator({ first, second });
  const ours = await consentWebAuthnClient.createCredential(CREATE);
  const ourOptions = asked[0].options.publicKey;

  assert.deepEqual(withoutSecond(ourOptions), theirOptions, "every parameter of the ceremony is Mera's");
  assert.equal(toHex((ourOptions.extensions as { prf: { eval: { second: Uint8Array } } }).prf.eval.second), CONSENT_SALT_HEX, "and the second salt is the consent salt");
  assert.deepEqual({ ...ours, prfOutput: toHex(ours.prfOutput!), credentialId: toHex(ours.credentialId) }, { ...theirs, prfOutput: toHex(theirs.prfOutput!), credentialId: toHex(theirs.credentialId) }, "the account is given exactly what Mera's client would give it");
  assert.deepEqual(ours.transports, ["internal", "hybrid"]);
  assert.equal(ours.prfEnabled, true);
  // The second answer became the consent key, and nothing of it is in what the account's side receives.
  assert.equal(toHex(consentKey()!.publicKey), toHex(createEd25519SigningSession({ privateKey: new Uint8Array(32).fill(13) }).publicKey));
});

test("opening an account: the same ceremony again, with and without a passkey already known", async () => {
  const first = new Uint8Array(32).fill(21).buffer;
  const second = new Uint8Array(32).fill(23).buffer;
  for (const request of [GET, { ...GET, allowCredential: { credentialId: Uint8Array.from([1, 2, 3, 4]), transports: ["internal"] } } as WebAuthnClient.GetCredentialRequest]) {
    let asked = authenticator({ first, second });
    const theirs = await mera.getCredential(request);
    const theirOptions = asked[0].options.publicKey;
    asked = authenticator({ first, second });
    const ours = await consentWebAuthnClient.getCredential(request);
    assert.equal(asked[0].method, "get");
    assert.deepEqual(withoutSecond(asked[0].options.publicKey), theirOptions);
    assert.equal(toHex(ours.prfOutput!), toHex(theirs.prfOutput!));
    assert.equal(toHex(ours.credentialId), toHex(theirs.credentialId));
    assert.ok(consentKey());
    endConsentKey();
  }
});

test("an answer in any of the forms an authenticator gives is read the same way by both", async () => {
  const bytes = Array.from({ length: 32 }, (_, index) => index + 1);
  const inside = new Uint8Array(64);
  inside.set(bytes, 16);
  const forms: Record<string, unknown> = {
    "a buffer": Uint8Array.from(bytes).buffer,
    "a view into a larger buffer": new Uint8Array(inside.buffer, 16, 32),
    // The form that broke the copy: it took a list for a view.
    "a plain list of bytes": bytes,
  };
  for (const [form, first] of Object.entries(forms)) {
    authenticator({ first });
    const theirs = await mera.getCredential(GET);
    authenticator({ first });
    const ours = await consentWebAuthnClient.getCredential(GET);
    assert.equal(toHex(ours.prfOutput!), toHex(Uint8Array.from(bytes)), form);
    assert.equal(toHex(ours.prfOutput!), toHex(theirs.prfOutput!), form);
  }
  // No output at all: neither gives one, and Mera says what that means further up.
  authenticator({});
  assert.equal((await consentWebAuthnClient.getCredential(GET)).prfOutput, undefined);
  authenticator({});
  assert.equal((await mera.getCredential(GET)).prfOutput, undefined);
});

test("both refuse the same answers, with the same error", async () => {
  const refusal = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return "answered";
    } catch (error) {
      return isMeraError(error) ? error.code : `not a MeraError: ${String(error)}`;
    }
  };
  // Something that is not a public key credential, and nothing at all.
  for (const credential of [null, { type: "password" }, { type: "public-key", rawId: new ArrayBuffer(4) }]) {
    authenticator({ credential });
    const theirs = await refusal(() => mera.getCredential(GET));
    authenticator({ credential });
    assert.equal(await refusal(() => consentWebAuthnClient.getCredential(GET)), theirs);
    assert.equal(theirs, "PASSKEY_OPERATION_FAILED");
  }
  // A list that holds something other than bytes.
  authenticator({ first: [1, 2, 300] });
  const theirs = await refusal(() => mera.getCredential(GET));
  authenticator({ first: [1, 2, 300] });
  assert.equal(await refusal(() => consentWebAuthnClient.getCredential(GET)), theirs);
  assert.equal(theirs, "PRF_UNAVAILABLE");
});

test("a second answer that cannot be read gives no consent key and still opens the account", async () => {
  const first = new Uint8Array(32).fill(31).buffer;
  for (const second of [undefined, new Uint8Array(16).buffer, [1, 2, 300], "not bytes"]) {
    authenticator({ first, second });
    const ours = await consentWebAuthnClient.getCredential(GET);
    assert.equal(toHex(ours.prfOutput!), toHex(new Uint8Array(32).fill(31)));
    assert.equal(consentKey(), null);
  }
});

test("one setting leaves both ceremonies to Mera's own client", () => {
  assert.equal(meraOwnClient(undefined), false);
  assert.equal(meraOwnClient(""), false);
  assert.equal(meraOwnClient("0"), false);
  assert.equal(meraOwnClient(" 1 "), true);
  // Unset, as it is everywhere today: the client is the one above.
  assert.equal(ceremonyClient(), consentWebAuthnClient);
  const account = readFileSync("src/account/mera.ts", "utf8");
  assert.equal(account.match(/webAuthnClient: ceremonyClient\(\)/g)?.length, 2, "the two ceremonies, making and opening, both follow the switch");
  assert.doesNotMatch(account, /webAuthnClient: consentWebAuthnClient/);
  assert.match(readFileSync("src/client/consent-key.ts", "utf8"), /return meraOwnClient\(\) \? undefined : consentWebAuthnClient;/, "undefined is Mera's own default client");
});
