import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeraError } from "@category-labs/mera";
import { accountError, AccountError, isAccountError, toAccountError } from "../src/account/errors";

describe("toAccountError", () => {
  it("turns a missing PRF into the guided refusal (refusal case 3)", () => {
    const error = toAccountError(new MeraError("PRF_UNAVAILABLE", "no prf"));
    assert.equal(error.code, "PRF_UNAVAILABLE");
    assert.match(error.guidance, /iCloud Keychain/);
    assert.match(error.guidance, /Google Password Manager/);
    assert.match(error.guidance, /1Password/);
  });

  it("keeps a cancelled prompt distinct from a real failure", () => {
    assert.equal(toAccountError(new MeraError("PASSKEY_OPERATION_FAILED", "cancelled")).code, "PASSKEY_CANCELLED");
    assert.equal(toAccountError(new MeraError("CRYPTO_UNAVAILABLE", "http")).code, "NOT_SECURE_CONTEXT");
    assert.equal(toAccountError(new MeraError("SESSION_ENDED", "ended")).code, "SESSION_ENDED");
  });

  it("never leaks an unknown failure as a specific one", () => {
    assert.equal(toAccountError(new Error("boom")).code, "UNKNOWN");
    assert.equal(toAccountError(new MeraError("INPUT_INVALID", "bad")).code, "UNKNOWN");
    assert.equal(toAccountError("string").code, "UNKNOWN");
  });

  it("passes an AccountError through unchanged", () => {
    const original = accountError("NO_CREDENTIAL");
    assert.equal(toAccountError(original), original);
    assert.ok(isAccountError(original));
    assert.ok(original instanceof AccountError);
  });

  it("never uses the words a person must not see", () => {
    const forbidden = /\b(wallet|gas|chain|seed|token|transaction hash|address)\b/i;
    for (const code of [
      "PRF_UNAVAILABLE",
      "PASSKEY_CANCELLED",
      "NOT_SECURE_CONTEXT",
      "SESSION_ENDED",
      "NO_CREDENTIAL",
      "NOT_IN_BROWSER",
      "UNKNOWN",
    ] as const) {
      assert.doesNotMatch(accountError(code).guidance, forbidden, `guidance for ${code}`);
    }
  });
});
