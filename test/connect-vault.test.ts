import assert from "node:assert/strict";
import test from "node:test";
import { newVaultKey, openSecret, sealSecret, vaultConfigured, VaultError } from "../src/connect-vault";

/** Where a connected source's keys sleep (D188, rule 4): sealed under a key of the founder's, opened for one reading. */

const env = { CONNECT_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64") } as unknown as NodeJS.ProcessEnv;

test("a sealed value opens with the key, and with nothing else", () => {
  const sealed = sealSecret("a key Fitbit gave", env);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes("Fitbit"), "nothing of the text shows");
  assert.equal(openSecret(sealed, env), "a key Fitbit gave");
  assert.notEqual(sealSecret("the same", env), sealSecret("the same", env), "a fresh nonce each time");
  const other = { CONNECT_TOKEN_KEY: Buffer.alloc(32, 8).toString("base64") } as unknown as NodeJS.ProcessEnv;
  assert.throws(() => openSecret(sealed, other), (error: unknown) => error instanceof VaultError && error.code === "CANNOT_OPEN");
  assert.throws(() => openSecret("v1.not.a.seal", env), (error: unknown) => error instanceof VaultError && error.code === "CANNOT_OPEN");
  // One byte of the ciphertext flipped, decoded and encoded again. Changing the last character instead left the bytes as
  // they were one time in 16 (it carries 4 bits here), and the seal then rightly opened.
  const [version, iv, tag, body] = sealed.split(".");
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 0x01;
  const changed = [version, iv, tag, flipped.toString("base64url")].join(".");
  assert.notEqual(changed, sealed);
  assert.throws(() => openSecret(changed, env), (error: unknown) => error instanceof VaultError && error.code === "CANNOT_OPEN", "a changed byte is not the value");
});

test("without the key nothing seals, and the answer to 'is it configured' is a boolean", () => {
  assert.equal(vaultConfigured({} as unknown as NodeJS.ProcessEnv), false);
  assert.equal(vaultConfigured({ CONNECT_TOKEN_KEY: "short" } as unknown as NodeJS.ProcessEnv), false);
  assert.equal(vaultConfigured(env), true);
  assert.throws(() => sealSecret("x", {} as unknown as NodeJS.ProcessEnv), (error: unknown) => error instanceof VaultError && error.code === "NOT_CONFIGURED");
  assert.throws(() => sealSecret("x", { CONNECT_TOKEN_KEY: Buffer.alloc(16, 1).toString("base64") } as unknown as NodeJS.ProcessEnv), (error: unknown) => error instanceof VaultError && error.code === "INVALID_KEY");
  const fresh = newVaultKey();
  assert.equal(Buffer.from(fresh, "base64").length, 32);
  assert.ok(vaultConfigured({ CONNECT_TOKEN_KEY: fresh } as unknown as NodeJS.ProcessEnv));
});
