import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeraError } from "@category-labs/mera";
import { accountError, AccountError, isAccountError, passkeyEnvironmentProblem, toAccountError } from "../src/account/errors";

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

describe("passkeyEnvironmentProblem", () => {
  const chromeAndroid = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
  const safariIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const androidWebView = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";
  const instagramIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.0";

  it("accepts real browsers", () => {
    assert.equal(passkeyEnvironmentProblem(chromeAndroid, true), undefined);
    assert.equal(passkeyEnvironmentProblem(safariIos, true), undefined);
  });

  it("refuses OEM browsers outside the support matrix (Mi Browser on 11 Sep 2026 never showed a prompt)", () => {
    const miBrowser = "Mozilla/5.0 (Linux; U; Android 14; fr-fr; 23090RA98G Build/UKQ1.230917.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.48 Mobile Safari/537.36 XiaoMi/MiuiBrowser/18.3.20";
    assert.equal(passkeyEnvironmentProblem(miBrowser, true), "UNSUPPORTED_BROWSER");
    assert.match(accountError("UNSUPPORTED_BROWSER").guidance, /Chrome \(Android\) or Safari \(iPhone\)/);
  });

  it("refuses in-app browsers and browsers without WebAuthn, with a way out", () => {
    assert.equal(passkeyEnvironmentProblem(androidWebView, true), "UNSUPPORTED_BROWSER");
    assert.equal(passkeyEnvironmentProblem(instagramIos, true), "UNSUPPORTED_BROWSER");
    assert.equal(passkeyEnvironmentProblem(chromeAndroid, false), "UNSUPPORTED_BROWSER");
    assert.match(accountError("TIMED_OUT").guidance, /did not answer/);
  });
});
