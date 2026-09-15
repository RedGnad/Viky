import assert from "node:assert/strict";
import test from "node:test";
import { contactHash, NO_CONTACT_HASH, normaliseContact } from "../src/contact-hash";

test("a gift that names no contact carries a fixed value the contract accepts, and that names nobody", () => {
  assert.match(NO_CONTACT_HASH, /^0x[0-9a-f]{64}$/);
  assert.notEqual(NO_CONTACT_HASH, `0x${"0".repeat(64)}`, "the contract refuses a zero hash");
  assert.notEqual(NO_CONTACT_HASH, contactHash("ama@example.com"));
});

test("emails are trimmed and lowercased, phones reduced to E.164", () => {
  assert.deepEqual(normaliseContact("  Ama@Example.COM "), { kind: "email", value: "ama@example.com" });
  assert.deepEqual(normaliseContact("+221 77 123 45 67"), { kind: "phone", value: "+221771234567" });
  assert.deepEqual(normaliseContact("0033 6 12 34 56 78"), { kind: "phone", value: "+33612345678" });
  assert.deepEqual(normaliseContact("+33 (0)6-12-34-56-78".replace("(0)", "")), { kind: "phone", value: "+33612345678" });
});

test("the same contact always hashes the same, and different contacts differ", () => {
  assert.equal(contactHash("Ama@example.com"), contactHash("ama@example.com "));
  assert.equal(contactHash("+221771234567"), contactHash("+221 77 123 45 67"));
  assert.notEqual(contactHash("ama@example.com"), contactHash("amy@example.com"));
  assert.notEqual(contactHash("ama@example.com"), contactHash("+221771234567"));
  assert.match(contactHash("ama@example.com"), /^0x[0-9a-f]{64}$/);
});

test("malformed contacts are refused", () => {
  assert.throws(() => normaliseContact("not an email@"), /valid email/);
  assert.throws(() => normaliseContact("0612345678"), /country code/);
  assert.throws(() => normaliseContact(""), /country code/);
  assert.throws(() => normaliseContact("+1"), /country code/);
});
