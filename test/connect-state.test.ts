import assert from "node:assert/strict";
import test from "node:test";
import { connectCookie, connectCookieValue, CONNECT_COOKIE_NAME, ConnectStateError, newConnectNonce, openConnectState, sealConnectState, type ConnectState } from "../src/connect-state";

/** What crosses the OAuth round trip (D188): signed by the server, ten minutes, one source, one gift. */

const env = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" } as unknown as NodeJS.ProcessEnv;
const NOW = 1_790_000_000;
const state: ConnectState = { giftId: "42", account: "0x000000000000000000000000000000000000a11c", source: "fitbit", verifier: "v".repeat(43), nonce: newConnectNonce(), issuedAt: NOW };

test("a state comes back as it went, signed, and not from another secret or another time", () => {
  const sealed = sealConnectState(state, env);
  assert.deepEqual(openConnectState(sealed, NOW + 30, env), state);
  assert.throws(() => openConnectState(sealed, NOW + 601, env), (error: unknown) => error instanceof ConnectStateError && error.code === "EXPIRED");
  assert.throws(() => openConnectState(sealed, NOW - 120, env), (error: unknown) => error instanceof ConnectStateError && error.code === "EXPIRED", "a state from the future is no state");
  assert.throws(() => openConnectState(sealed, NOW, { SESSION_SIGNING_SECRET: "another-secret-that-is-also-longer-than-32-bytes" } as unknown as NodeJS.ProcessEnv), (error: unknown) => error instanceof ConnectStateError && error.code === "INVALID");
  assert.throws(() => openConnectState(`${sealed.split(".")[0]}.tampered`, NOW, env), (error: unknown) => error instanceof ConnectStateError && error.code === "INVALID");
  assert.throws(() => openConnectState("nothing", NOW, env), (error: unknown) => error instanceof ConnectStateError && error.code === "INVALID");
  assert.throws(() => sealConnectState(state, {} as unknown as NodeJS.ProcessEnv), (error: unknown) => error instanceof ConnectStateError && error.code === "NOT_CONFIGURED");
  assert.ok(newConnectNonce() !== newConnectNonce());
});

test("the cookie is host-only, secure, unreadable by a script, and gone with the round trip", () => {
  const cookie = connectCookie("abc");
  assert.match(cookie, /^__Host-viky-connect=abc; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  assert.match(connectCookie("", 0), /Max-Age=0$/);
  assert.equal(connectCookieValue(`other=1; ${CONNECT_COOKIE_NAME}=a.b=c; x=y`), "a.b=c");
  assert.equal(connectCookieValue("other=1"), null);
  assert.equal(connectCookieValue(null), null);
});
