import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { EMPTY_SPACE, NICKNAME_MAX_LENGTH, NOTES_MAX_LENGTH, PEOPLE_MAX, parsePrivateSpace, parseSealedSpace, peopleOf, personKey, PRIVATE_SPACE_SALT_LABEL, spaceFrom, tidyNickname } from "../src/private-space";
import { deriveSpaceKey, openSpace, privateSpaceSalt, sealSpace, SpaceOpenError } from "../src/private-space-crypto";
import { configurePrivateSpaceStore, ensurePrivateSpaceSchema, keepPrivateSpace, loadPrivateSpace } from "../src/private-space-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { GET, PUT } from "../app/api/account/private/route";

/**
 * The funder's private space (D202): what the page keeps in the clear, what the server is given, and what opens it.
 * The sealing runs here on Node's Web Crypto, the same API the browser runs it on.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;

let db: PGlite;
let cookie: string;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

/** A PRF output as a passkey would give one: 32 bytes, and the same bytes for the same passkey and salt. */
const prfOutput = (seed: number) => new Uint8Array(32).map((_, index) => (seed * 31 + index * 7) % 256) as Uint8Array<ArrayBuffer>;

function request(method: "GET" | "PUT", body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/account/private`, {
    method,
    headers: { origin: ORIGIN, host: "viky.test", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

before(async () => {
  db = new PGlite();
  configurePrivateSpaceStore(pgliteExecutor(db));
  await ensurePrivateSpaceSchema();
  const challenge = createAccountAuthChallenge({ account: FUNDER.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await FUNDER.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  cookie = `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_private_spaces");
});

after(async () => {
  configurePrivateSpaceStore(undefined);
  await db.close();
});

test("a person is one key whatever the case and the spaces, and a nickname is tidied and bounded", () => {
  assert.equal(personKey("  Léa "), "léa");
  assert.equal(personKey("LÉA"), "léa");
  assert.equal(personKey("Marie Claire"), "marie claire");
  assert.equal(tidyNickname("  ma   petite   sœur  "), "ma petite sœur");
  assert.equal([...tidyNickname("x".repeat(NICKNAME_MAX_LENGTH + 10))].length, NICKNAME_MAX_LENGTH);
});

test("the people of a space are the first names of the gifts funded, once each, then anybody the space still names", () => {
  const space = parsePrivateSpace({ version: 1, notes: "", people: { léa: { nickname: "Lili" }, kofi: { nickname: "K" } } });
  assert.ok(space);
  const people = peopleOf(["Léa", "Sam", null, "léa", "Sam"], space);
  assert.deepEqual(
    people.map((person) => [person.key, person.firstName, person.nickname]),
    [
      ["léa", "Léa", "Lili"],
      ["sam", "Sam", ""],
      ["kofi", "kofi", "K"],
    ],
  );
});

test("what the funder leaves is kept without the empty names, tidied, and cut to the limits", () => {
  const space = spaceFrom(
    [
      { key: "léa", nickname: "  Lili " },
      { key: "sam", nickname: "   " },
    ],
    "n".repeat(NOTES_MAX_LENGTH + 5),
  );
  assert.deepEqual(space.people, { léa: { nickname: "Lili" } });
  assert.equal(space.notes.length, NOTES_MAX_LENGTH);
  const many = spaceFrom(Array.from({ length: PEOPLE_MAX + 5 }, (_, index) => ({ key: `p${index}`, nickname: "x" })), "");
  assert.equal(Object.keys(many.people).length, PEOPLE_MAX);
});

test("a decrypted space that is not one is refused, and unknown fields are dropped", () => {
  assert.equal(parsePrivateSpace(null), undefined);
  assert.equal(parsePrivateSpace({ version: 2, people: {}, notes: "" }), undefined);
  assert.equal(parsePrivateSpace({ version: 1, people: "x", notes: "" }), undefined);
  assert.deepEqual(parsePrivateSpace({ version: 1, people: { léa: { nickname: "Lili", extra: 1 } }, notes: "hi", extra: true }), { version: 1, people: { léa: { nickname: "Lili" } }, notes: "hi" });
});

test("the server accepts an envelope by its shape and size alone", () => {
  const good = { version: 1, nonce: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(40) };
  assert.deepEqual(parseSealedSpace(good), good);
  assert.equal(parseSealedSpace({ ...good, version: 2 }), undefined);
  assert.equal(parseSealedSpace({ ...good, nonce: "short" }), undefined);
  assert.equal(parseSealedSpace({ ...good, ciphertext: "not base64url!" }), undefined);
  assert.equal(parseSealedSpace({ ...good, ciphertext: "A".repeat(40_000) }), undefined);
  assert.equal(parseSealedSpace("{}"), undefined);
});

test("the salt is the space's own, fixed, and unrelated to the account's", async () => {
  assert.equal(PRIVATE_SPACE_SALT_LABEL, "viky:private:v1");
  const salt = await privateSpaceSalt();
  assert.equal(salt.length, 32);
  assert.notDeepEqual(salt, await deriveExpected("mera.prf.salt.v1"));
  assert.deepEqual(salt, await deriveExpected(PRIVATE_SPACE_SALT_LABEL));
});

async function deriveExpected(label: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(label)));
}

test("sealed with a passkey's output, a space opens with the same output on another device, and the PRF bytes are zeroed", async () => {
  const bytes = prfOutput(1);
  const key = await deriveSpaceKey(bytes);
  assert.ok(bytes.every((byte) => byte === 0), "the PRF output is zeroed once the key exists");
  assert.equal(key.extractable, false);
  const space = { version: 1 as const, people: { léa: { nickname: "Lili" } }, notes: "Birthday in March" };
  const sealed = await sealSpace(key, FUNDER.address, space);
  assert.equal(sealed.version, 1);
  assert.match(sealed.nonce, /^[A-Za-z0-9_-]{16}$/);
  assert.match(sealed.ciphertext, /^[A-Za-z0-9_-]{22,}$/);
  for (const word of ["Lili", "Birthday", "léa", "nickname"]) assert.ok(!JSON.stringify(sealed).includes(word), `the envelope carries no clear text: ${word}`);
  // Another device: the same passkey gives the same output, and a key derived there opens it.
  const elsewhere = await deriveSpaceKey(prfOutput(1));
  assert.deepEqual(await openSpace(elsewhere, FUNDER.address, sealed), space);
  // Sealed twice, two different envelopes: the nonce is fresh each time.
  const again = await sealSpace(key, FUNDER.address, space);
  assert.notEqual(again.nonce, sealed.nonce);
  assert.notEqual(again.ciphertext, sealed.ciphertext);
});

test("another passkey, or another account, does not open it, and the refusal is named", async () => {
  const key = await deriveSpaceKey(prfOutput(1));
  const sealed = await sealSpace(key, FUNDER.address, EMPTY_SPACE);
  const other = await deriveSpaceKey(prfOutput(2));
  await assert.rejects(openSpace(other, FUNDER.address, sealed), (error: unknown) => error instanceof SpaceOpenError && error.code === "NOT_THIS_PASSKEY");
  const same = await deriveSpaceKey(prfOutput(1));
  await assert.rejects(openSpace(same, "0x000000000000000000000000000000000000dEaD", sealed), (error: unknown) => error instanceof SpaceOpenError && error.code === "NOT_THIS_PASSKEY");
  const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -2) + (sealed.ciphertext.endsWith("AA") ? "BB" : "AA") };
  await assert.rejects(openSpace(same, FUNDER.address, tampered), (error: unknown) => error instanceof SpaceOpenError && error.code === "NOT_THIS_PASSKEY");
});

test("the store keeps one envelope per account, counts revisions, and refuses a write over a revision it has moved past", async () => {
  assert.deepEqual(await loadPrivateSpace(FUNDER.address), { sealed: null, revision: 0 });
  const one = { version: 1 as const, nonce: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(40) };
  assert.equal(await keepPrivateSpace(FUNDER.address, one, 0), 1);
  assert.equal(await keepPrivateSpace(FUNDER.address, one, 0), null, "a second first write is refused: the other device wrote first");
  const two = { ...one, nonce: "BBBBBBBBBBBBBBBB" };
  assert.equal(await keepPrivateSpace(FUNDER.address, two, 1), 2);
  assert.equal(await keepPrivateSpace(FUNDER.address, one, 1), null, "a write over revision 1 is refused once revision 2 is kept");
  assert.deepEqual(await loadPrivateSpace(FUNDER.address.toLowerCase()), { sealed: two, revision: 2 });
});

test("the route answers the account's own envelope only, and keeps by shape and revision", async () => {
  assert.equal((await GET(request("GET"))).status, 401);
  const empty = await GET(request("GET", undefined, { cookie }));
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { sealed: null, revision: 0 });
  const sealed = { version: 1, nonce: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(40) };
  const kept = await PUT(request("PUT", { sealed, revision: 0 }, { cookie }));
  assert.equal(kept.status, 200);
  assert.deepEqual(await kept.json(), { revision: 1 });
  const read = await GET(request("GET", undefined, { cookie }));
  assert.deepEqual(await read.json(), { sealed, revision: 1 });
  const stale = await PUT(request("PUT", { sealed, revision: 0 }, { cookie }));
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { code: string }).code, "CHANGED_ELSEWHERE");
  const malformed = await PUT(request("PUT", { sealed: { version: 1, nonce: "x", ciphertext: "y" }, revision: 1 }, { cookie }));
  assert.equal(malformed.status, 400);
  assert.equal(((await malformed.json()) as { code: string }).code, "NOT_A_SEALED_SPACE");
  assert.equal((await PUT(request("PUT", { sealed, revision: 1 }))).status, 401);
});
